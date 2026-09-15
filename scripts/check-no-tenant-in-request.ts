/**
 * FR-API-003: the OEM is derived from the credential, never from the request.
 *
 * This scan removes the convenient shapes that would otherwise hide a tenant
 * identifier in the HTTP layer:
 *
 *   - @Query/@Param/@Body/@Headers string arguments and bound names
 *   - class/interface/type-literal DTO properties on those parameters
 *   - raw @Req/@Res/@Request/@Response/@Next
 *   - Zod object keys, including nested objects, arrays, unions and .extend()
 *   - header reads matching /^x-(oem|tenant)/i
 *   - Fastify onRequest/preHandler/preValidation/preParsing reads of
 *     req.query / req.params / req.body / req.headers on a key matching
 *     /oem|tenant/i
 *
 * It does not prove that the OEM never comes from the request. A determined
 * read through an alias, an untyped bag, or a new framework API will still
 * compile. Only authentication (OEM from the credential) plus review closes
 * that in general.
 */
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as ts from 'typescript';

const FORBIDDEN_NAME = /oem|tenant/i;
const FORBIDDEN_HEADER = /^x-(oem|tenant)/i;
const REQUEST_DECORATORS = new Set(['Query', 'Param', 'Body', 'Headers']);
const RAW_REQUEST_DECORATORS = new Set([
  'Req',
  'Res',
  'Request',
  'Response',
  'Next',
]);
const ZOD_OBJECT_METHODS = new Set(['object', 'strictObject', 'looseObject']);
const ZOD_EXTEND_METHODS = new Set(['extend', 'merge']);
const ZOD_WRAP_METHODS = new Set([
  'array',
  'union',
  'discriminatedUnion',
  'intersection',
  'tuple',
  'record',
  'optional',
  'nullable',
  'nullish',
  'default',
  'catch',
  'promise',
  'lazy',
  'pipe',
  'and',
  'or',
  'readonly',
  'describe',
  'brand',
  'meta',
]);
const FASTIFY_HOOKS = new Set([
  'onRequest',
  'preHandler',
  'preValidation',
  'preParsing',
]);
const REQUEST_BAGS = new Set(['query', 'params', 'body', 'headers']);

export type FindingKind =
  | 'decorator'
  | 'parameter'
  | 'zod-key'
  | 'dto-property'
  | 'raw-request'
  | 'header'
  | 'hook-read';

export type Finding = {
  file: string;
  line: number;
  kind: FindingKind;
  name: string;
};

export type ScanOptions = {
  roots?: readonly string[];
};

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const srcRoot = path.join(repoRoot, 'src');

export async function findTenantRequestBindings(
  options: ScanOptions = {},
): Promise<Finding[]> {
  const roots = options.roots ?? [srcRoot];
  const files = (
    await Promise.all(roots.map((root) => listSourceFiles(root)))
  ).flat();
  const findings: Finding[] = [];
  const seen = new Set<string>();

  for (const file of files) {
    const content = await readFile(file, 'utf8');
    const sourceFile = ts.createSourceFile(
      file,
      content,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    );
    const aliases = nestDecoratorAliases(sourceFile);
    const types = typeDeclarations(sourceFile);
    const schemas = zodSchemaBindings(sourceFile);
    visit(sourceFile, sourceFile, aliases, types, schemas, findings, seen);
  }

  return findings;
}

export function formatFindings(findings: Finding[]): string {
  const lines = [
    'FR-API-003: the OEM is derived from the credential, never from the request.',
    'These HTTP bindings accept a tenant identifier from the request:',
    '',
  ];

  for (const item of findings) {
    lines.push(`  ${item.file}:${item.line}  ${item.kind} '${item.name}'`);
  }

  return lines.join('\n');
}

async function listSourceFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true, recursive: true });
  const files: string[] = [];

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.ts')) {
      continue;
    }
    if (entry.name.endsWith('.spec.ts') || entry.name.endsWith('.test.ts')) {
      continue;
    }

    files.push(path.join(entry.parentPath, entry.name));
  }

  return files;
}

function nestDecoratorAliases(sourceFile: ts.SourceFile): Map<string, string> {
  const aliases = new Map<string, string>();
  for (const name of [...REQUEST_DECORATORS, ...RAW_REQUEST_DECORATORS]) {
    aliases.set(name, name);
  }

  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement)) {
      continue;
    }
    if (!ts.isStringLiteral(statement.moduleSpecifier)) {
      continue;
    }
    if (!statement.moduleSpecifier.text.startsWith('@nestjs/common')) {
      continue;
    }

    const named = statement.importClause?.namedBindings;
    if (named === undefined || !ts.isNamedImports(named)) {
      continue;
    }

    for (const specifier of named.elements) {
      const imported = (specifier.propertyName ?? specifier.name).text;
      if (
        REQUEST_DECORATORS.has(imported) ||
        RAW_REQUEST_DECORATORS.has(imported)
      ) {
        aliases.set(specifier.name.text, imported);
      }
    }
  }

  return aliases;
}

function typeDeclarations(sourceFile: ts.SourceFile): Map<string, ts.Node> {
  const types = new Map<string, ts.Node>();

  const visitDecl = (node: ts.Node): void => {
    if (
      ts.isClassDeclaration(node) ||
      ts.isInterfaceDeclaration(node) ||
      ts.isTypeAliasDeclaration(node)
    ) {
      if (node.name !== undefined) {
        types.set(node.name.text, node);
      }
    }
    ts.forEachChild(node, visitDecl);
  };

  visitDecl(sourceFile);
  return types;
}

function zodSchemaBindings(sourceFile: ts.SourceFile): Set<string> {
  const names = new Set<string>();
  let changed = true;
  while (changed) {
    changed = false;
    const visitDecl = (node: ts.Node): void => {
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
        if (
          node.initializer !== undefined &&
          isZodExpression(node.initializer, names) &&
          !names.has(node.name.text)
        ) {
          names.add(node.name.text);
          changed = true;
        }
      }
      ts.forEachChild(node, visitDecl);
    };
    visitDecl(sourceFile);
  }
  return names;
}

function visit(
  node: ts.Node,
  sourceFile: ts.SourceFile,
  aliases: Map<string, string>,
  types: Map<string, ts.Node>,
  schemas: Set<string>,
  findings: Finding[],
  seen: Set<string>,
): void {
  if (ts.isParameter(node)) {
    collectParameterFindings(node, sourceFile, aliases, types, findings, seen);
  }

  if (ts.isCallExpression(node)) {
    collectZodKeys(node, sourceFile, schemas, findings, seen, new Set());
    collectHookFindings(node, sourceFile, findings, seen);
    collectHeaderCall(node, sourceFile, findings, seen);
  }

  if (ts.isElementAccessExpression(node)) {
    collectHeaderElementAccess(node, sourceFile, findings, seen);
  }

  ts.forEachChild(node, (child) => {
    visit(child, sourceFile, aliases, types, schemas, findings, seen);
  });
}

function collectParameterFindings(
  param: ts.ParameterDeclaration,
  sourceFile: ts.SourceFile,
  aliases: Map<string, string>,
  types: Map<string, ts.Node>,
  findings: Finding[],
  seen: Set<string>,
): void {
  const decorators = getNodeDecorators(param);
  const requestDecorators = decorators.filter((decorator) => {
    const name = decoratorCalleeName(decorator);
    return (
      name !== undefined &&
      aliases.has(name) &&
      REQUEST_DECORATORS.has(aliases.get(name) ?? '')
    );
  });
  const rawDecorators = decorators.filter((decorator) => {
    const name = decoratorCalleeName(decorator);
    return (
      name !== undefined &&
      aliases.has(name) &&
      RAW_REQUEST_DECORATORS.has(aliases.get(name) ?? '')
    );
  });

  for (const decorator of rawDecorators) {
    const local = decoratorCalleeName(decorator);
    const imported = local === undefined ? 'Req' : (aliases.get(local) ?? local);
    record(findings, seen, finding(sourceFile, decorator, 'raw-request', imported));
  }

  if (requestDecorators.length === 0) {
    return;
  }

  for (const decorator of requestDecorators) {
    const arg = firstStringArgument(decorator);
    if (arg !== undefined && FORBIDDEN_NAME.test(arg)) {
      record(findings, seen, finding(sourceFile, decorator, 'decorator', arg));
    }
    if (arg !== undefined && FORBIDDEN_HEADER.test(arg)) {
      record(findings, seen, finding(sourceFile, decorator, 'header', arg));
    }
  }

  for (const name of bindingNames(param.name)) {
    if (FORBIDDEN_NAME.test(name)) {
      record(
        findings,
        seen,
        finding(sourceFile, param.name, 'parameter', name),
      );
    }
  }

  collectDtoProperties(param, sourceFile, types, findings, seen, new Set());
}

function collectDtoProperties(
  param: ts.ParameterDeclaration,
  sourceFile: ts.SourceFile,
  types: Map<string, ts.Node>,
  findings: Finding[],
  seen: Set<string>,
  walking: Set<string>,
): void {
  const typeNode = param.type;
  if (typeNode === undefined) {
    return;
  }
  collectDtoFromTypeNode(typeNode, sourceFile, types, findings, seen, walking);
}

function collectDtoFromTypeNode(
  typeNode: ts.TypeNode,
  sourceFile: ts.SourceFile,
  types: Map<string, ts.Node>,
  findings: Finding[],
  seen: Set<string>,
  walking: Set<string>,
): void {
  if (isZodInferType(typeNode)) {
    return;
  }

  if (ts.isTypeLiteralNode(typeNode)) {
    for (const member of typeNode.members) {
      const name = typeElementName(member);
      if (name !== undefined && FORBIDDEN_NAME.test(name)) {
        record(
          findings,
          seen,
          finding(sourceFile, member, 'dto-property', name),
        );
      }
    }
    return;
  }

  if (ts.isTypeReferenceNode(typeNode) && ts.isIdentifier(typeNode.typeName)) {
    const name = typeNode.typeName.text;
    if (walking.has(name)) {
      return;
    }
    walking.add(name);
    const decl = types.get(name);
    if (decl === undefined) {
      return;
    }
    collectDtoFromDeclaration(decl, sourceFile, types, findings, seen, walking);
  }
}

function collectDtoFromDeclaration(
  decl: ts.Node,
  sourceFile: ts.SourceFile,
  types: Map<string, ts.Node>,
  findings: Finding[],
  seen: Set<string>,
  walking: Set<string>,
): void {
  if (ts.isTypeAliasDeclaration(decl)) {
    collectDtoFromTypeNode(
      decl.type,
      sourceFile,
      types,
      findings,
      seen,
      walking,
    );
    return;
  }

  if (ts.isClassDeclaration(decl) || ts.isInterfaceDeclaration(decl)) {
    for (const member of decl.members) {
      const name = typeElementName(member);
      if (name !== undefined && FORBIDDEN_NAME.test(name)) {
        record(
          findings,
          seen,
          finding(sourceFile, member, 'dto-property', name),
        );
      }
    }
    if (ts.isClassDeclaration(decl)) {
      for (const ctor of decl.members) {
        if (!ts.isConstructorDeclaration(ctor)) {
          continue;
        }
        for (const param of ctor.parameters) {
          if (param.modifiers === undefined || param.modifiers.length === 0) {
            continue;
          }
          if (ts.isIdentifier(param.name) && FORBIDDEN_NAME.test(param.name.text)) {
            record(
              findings,
              seen,
              finding(sourceFile, param.name, 'dto-property', param.name.text),
            );
          }
        }
      }
    }
  }
}

function isZodInferType(typeNode: ts.TypeNode): boolean {
  if (!ts.isTypeReferenceNode(typeNode) || !ts.isQualifiedName(typeNode.typeName)) {
    return false;
  }
  return (
    ts.isIdentifier(typeNode.typeName.left) &&
    typeNode.typeName.left.text === 'z' &&
    typeNode.typeName.right.text === 'infer'
  );
}

function collectZodKeys(
  call: ts.CallExpression,
  sourceFile: ts.SourceFile,
  schemas: Set<string>,
  findings: Finding[],
  seen: Set<string>,
  walking: Set<ts.Node>,
): void {
  if (walking.has(call)) {
    return;
  }
  if (!isZodExpression(call, schemas)) {
    return;
  }
  collectZodFromExpression(call, sourceFile, schemas, findings, seen, walking);
}

function collectZodFromExpression(
  expression: ts.Expression,
  sourceFile: ts.SourceFile,
  schemas: Set<string>,
  findings: Finding[],
  seen: Set<string>,
  walking: Set<ts.Node>,
): void {
  const expr = unwrap(expression);
  if (walking.has(expr)) {
    return;
  }

  if (ts.isIdentifier(expr)) {
    if (!schemas.has(expr.text)) {
      return;
    }
    const init = initializerFor(sourceFile, expr.text);
    if (init !== undefined) {
      walking.add(expr);
      collectZodFromExpression(init, sourceFile, schemas, findings, seen, walking);
    }
    return;
  }

  if (!ts.isCallExpression(expr)) {
    return;
  }
  walking.add(expr);

  const method = callMethodName(expr);
  if (method !== undefined && (ZOD_OBJECT_METHODS.has(method) || ZOD_EXTEND_METHODS.has(method))) {
    const shape = firstObjectLiteralArgument(expr);
    if (shape !== undefined) {
      for (const property of shape.properties) {
        const name = objectLiteralKey(property);
        if (name !== undefined && FORBIDDEN_NAME.test(name)) {
          record(findings, seen, finding(sourceFile, property, 'zod-key', name));
        }
        const value = objectLiteralValue(property);
        if (value !== undefined) {
          collectZodFromExpression(
            value,
            sourceFile,
            schemas,
            findings,
            seen,
            walking,
          );
        }
      }
    } else {
      for (const arg of expr.arguments) {
        collectZodFromExpression(arg, sourceFile, schemas, findings, seen, walking);
      }
    }
  }

  if (method !== undefined && ZOD_WRAP_METHODS.has(method)) {
    for (const arg of expr.arguments) {
      if (ts.isArrayLiteralExpression(arg)) {
        for (const element of arg.elements) {
          collectZodFromExpression(
            element,
            sourceFile,
            schemas,
            findings,
            seen,
            walking,
          );
        }
      } else {
        collectZodFromExpression(arg, sourceFile, schemas, findings, seen, walking);
      }
    }
  }

  collectZodFromExpression(
    expr.expression,
    sourceFile,
    schemas,
    findings,
    seen,
    walking,
  );
}

function collectHookFindings(
  call: ts.CallExpression,
  sourceFile: ts.SourceFile,
  findings: Finding[],
  seen: Set<string>,
): void {
  if (!ts.isPropertyAccessExpression(call.expression)) {
    return;
  }
  if (call.expression.name.text !== 'addHook') {
    return;
  }
  const hookName = stringLiteralText(call.arguments[0]);
  if (hookName === undefined || !FASTIFY_HOOKS.has(hookName)) {
    return;
  }
  const callback = call.arguments[1];
  if (callback === undefined || !isFunctionLike(callback)) {
    return;
  }
  const requestParam = callback.parameters[0];
  if (requestParam === undefined) {
    return;
  }
  const requestNames = new Set(bindingNames(requestParam.name));
  scanHookNode(
    callback.body,
    sourceFile,
    requestNames,
    new Map(),
    findings,
    seen,
  );
}

function scanHookNode(
  node: ts.Node | undefined,
  sourceFile: ts.SourceFile,
  requestNames: Set<string>,
  bagAliases: Map<string, string>,
  findings: Finding[],
  seen: Set<string>,
): void {
  if (node === undefined) {
    return;
  }

  if (
    ts.isVariableDeclaration(node) &&
    ts.isIdentifier(node.name) &&
    node.initializer !== undefined
  ) {
    const bag = requestBag(node.initializer, requestNames, bagAliases);
    if (bag !== undefined) {
      bagAliases.set(node.name.text, bag);
    }
  }

  if (ts.isPropertyAccessExpression(node)) {
    const bag = requestBag(node.expression, requestNames, bagAliases);
    if (bag !== undefined && FORBIDDEN_NAME.test(node.name.text)) {
      record(
        findings,
        seen,
        finding(sourceFile, node.name, 'hook-read', node.name.text),
      );
    }
  }

  if (ts.isElementAccessExpression(node)) {
    const bag = requestBag(node.expression, requestNames, bagAliases);
    const key = stringLiteralText(node.argumentExpression);
    if (bag !== undefined && key !== undefined && FORBIDDEN_NAME.test(key)) {
      record(findings, seen, finding(sourceFile, node, 'hook-read', key));
    }
  }

  if (
    ts.isBinaryExpression(node) &&
    node.operatorToken.kind === ts.SyntaxKind.InKeyword
  ) {
    const key = stringLiteralText(node.left);
    const bag = requestBag(node.right, requestNames, bagAliases);
    if (key !== undefined && bag !== undefined && FORBIDDEN_NAME.test(key)) {
      record(findings, seen, finding(sourceFile, node.left, 'hook-read', key));
    }
  }

  if (
    ts.isVariableDeclaration(node) &&
    ts.isObjectBindingPattern(node.name) &&
    node.initializer !== undefined
  ) {
    const bag = requestBag(node.initializer, requestNames, bagAliases);
    if (bag !== undefined) {
      for (const name of bindingNames(node.name)) {
        if (FORBIDDEN_NAME.test(name)) {
          record(
            findings,
            seen,
            finding(sourceFile, node.name, 'hook-read', name),
          );
        }
      }
    }
  }

  ts.forEachChild(node, (child) => {
    scanHookNode(child, sourceFile, requestNames, bagAliases, findings, seen);
  });
}

function requestBag(
  expression: ts.Expression,
  requestNames: Set<string>,
  bagAliases: Map<string, string>,
): string | undefined {
  const inner = unwrap(expression);
  if (ts.isIdentifier(inner)) {
    return bagAliases.get(inner.text);
  }
  if (!ts.isPropertyAccessExpression(inner)) {
    return undefined;
  }
  if (!REQUEST_BAGS.has(inner.name.text)) {
    return undefined;
  }
  const receiver = unwrap(inner.expression);
  if (ts.isIdentifier(receiver) && requestNames.has(receiver.text)) {
    return inner.name.text;
  }
  return undefined;
}

function collectHeaderElementAccess(
  node: ts.ElementAccessExpression,
  sourceFile: ts.SourceFile,
  findings: Finding[],
  seen: Set<string>,
): void {
  const key = stringLiteralText(node.argumentExpression);
  if (key === undefined || !FORBIDDEN_HEADER.test(key)) {
    return;
  }
  const target = unwrap(node.expression);
  if (!isHeadersReceiver(target)) {
    return;
  }
  record(findings, seen, finding(sourceFile, node, 'header', key));
}

function collectHeaderCall(
  node: ts.CallExpression,
  sourceFile: ts.SourceFile,
  findings: Finding[],
  seen: Set<string>,
): void {
  if (node.arguments.length !== 1) {
    return;
  }
  const key = stringLiteralText(node.arguments[0]);
  if (key === undefined || !FORBIDDEN_HEADER.test(key)) {
    return;
  }
  if (!ts.isPropertyAccessExpression(node.expression)) {
    return;
  }
  const method = node.expression.name.text;
  if (method === 'header' || method === 'get') {
    if (method === 'get' && !isHeadersReceiver(node.expression.expression)) {
      return;
    }
    record(findings, seen, finding(sourceFile, node, 'header', key));
  }
}

function isHeadersReceiver(expression: ts.Expression): boolean {
  const inner = unwrap(expression);
  if (ts.isIdentifier(inner) && inner.text === 'headers') {
    return true;
  }
  if (ts.isPropertyAccessExpression(inner) && inner.name.text === 'headers') {
    return true;
  }
  return false;
}

function isZodExpression(expression: ts.Expression, schemas: Set<string>): boolean {
  const inner = unwrap(expression);
  if (ts.isIdentifier(inner)) {
    return inner.text === 'z' || inner.text === 'zod' || schemas.has(inner.text);
  }
  if (ts.isPropertyAccessExpression(inner)) {
    return isZodExpression(inner.expression, schemas);
  }
  if (ts.isCallExpression(inner)) {
    return isZodExpression(inner.expression, schemas);
  }
  if (ts.isTaggedTemplateExpression(inner)) {
    return isZodExpression(inner.tag, schemas);
  }
  return false;
}

function callMethodName(call: ts.CallExpression): string | undefined {
  const callee = unwrap(call.expression);
  if (ts.isPropertyAccessExpression(callee)) {
    return callee.name.text;
  }
  return undefined;
}

function firstObjectLiteralArgument(
  call: ts.CallExpression,
): ts.ObjectLiteralExpression | undefined {
  for (const arg of call.arguments) {
    const inner = unwrap(arg);
    if (ts.isObjectLiteralExpression(inner)) {
      return inner;
    }
  }
  return undefined;
}

function objectLiteralValue(
  property: ts.ObjectLiteralElementLike,
): ts.Expression | undefined {
  if (ts.isPropertyAssignment(property)) {
    return property.initializer;
  }
  if (ts.isShorthandPropertyAssignment(property)) {
    return property.name;
  }
  return undefined;
}

function initializerFor(
  sourceFile: ts.SourceFile,
  name: string,
): ts.Expression | undefined {
  let found: ts.Expression | undefined;
  const visitDecl = (node: ts.Node): void => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === name
    ) {
      found = node.initializer;
    }
    ts.forEachChild(node, visitDecl);
  };
  visitDecl(sourceFile);
  return found;
}

function unwrap(expression: ts.Expression): ts.Expression {
  let current = expression;
  while (true) {
    if (ts.isParenthesizedExpression(current)) {
      current = current.expression;
      continue;
    }
    if (ts.isAsExpression(current) || ts.isSatisfiesExpression(current)) {
      current = current.expression;
      continue;
    }
    if (ts.isNonNullExpression(current)) {
      current = current.expression;
      continue;
    }
    if (ts.isTypeAssertionExpression(current)) {
      current = current.expression;
      continue;
    }
    return current;
  }
}

function isFunctionLike(
  node: ts.Expression,
): node is ts.ArrowFunction | ts.FunctionExpression {
  return ts.isArrowFunction(node) || ts.isFunctionExpression(node);
}

function getNodeDecorators(node: ts.Node): readonly ts.Decorator[] {
  if (!ts.canHaveDecorators(node)) {
    return [];
  }
  return ts.getDecorators(node) ?? [];
}

function decoratorCalleeName(decorator: ts.Decorator): string | undefined {
  const expression = decorator.expression;
  if (ts.isCallExpression(expression)) {
    return identifierText(expression.expression);
  }
  return identifierText(expression);
}

function firstStringArgument(decorator: ts.Decorator): string | undefined {
  const expression = decorator.expression;
  if (!ts.isCallExpression(expression)) {
    return undefined;
  }
  return stringLiteralText(expression.arguments[0]);
}

function stringLiteralText(node: ts.Node | undefined): string | undefined {
  if (node === undefined) {
    return undefined;
  }
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return node.text;
  }
  return undefined;
}

function identifierText(expression: ts.Expression): string | undefined {
  if (ts.isIdentifier(expression)) {
    return expression.text;
  }
  return undefined;
}

function bindingNames(name: ts.BindingName): string[] {
  if (ts.isIdentifier(name)) {
    return [name.text];
  }
  if (ts.isObjectBindingPattern(name)) {
    return name.elements.flatMap((element) => bindingNames(element.name));
  }
  if (ts.isArrayBindingPattern(name)) {
    const names: string[] = [];
    for (const element of name.elements) {
      if (!ts.isOmittedExpression(element) && element.name !== undefined) {
        names.push(...bindingNames(element.name));
      }
    }
    return names;
  }
  return [];
}

function objectLiteralKey(
  property: ts.ObjectLiteralElementLike,
): string | undefined {
  if (
    ts.isPropertyAssignment(property) ||
    ts.isShorthandPropertyAssignment(property) ||
    ts.isMethodDeclaration(property)
  ) {
    return propertyNameText(property.name);
  }
  return undefined;
}

function typeElementName(member: ts.TypeElement | ts.ClassElement): string | undefined {
  if (
    ts.isPropertyDeclaration(member) ||
    ts.isPropertySignature(member) ||
    ts.isMethodDeclaration(member) ||
    ts.isMethodSignature(member)
  ) {
    return propertyNameText(member.name);
  }
  if (ts.isParameter(member) && ts.isIdentifier(member.name)) {
    return member.name.text;
  }
  return undefined;
}

function propertyNameText(name: ts.PropertyName): string | undefined {
  if (
    ts.isIdentifier(name) ||
    ts.isStringLiteral(name) ||
    ts.isNoSubstitutionTemplateLiteral(name)
  ) {
    return name.text;
  }
  if (ts.isComputedPropertyName(name) && ts.isStringLiteral(name.expression)) {
    return name.expression.text;
  }
  return undefined;
}

function finding(
  sourceFile: ts.SourceFile,
  node: ts.Node,
  kind: FindingKind,
  name: string,
): Finding {
  const { line } = sourceFile.getLineAndCharacterOfPosition(
    node.getStart(sourceFile),
  );
  return {
    file: path.relative(repoRoot, sourceFile.fileName).replaceAll('\\', '/'),
    line: line + 1,
    kind,
    name,
  };
}

function record(
  findings: Finding[],
  seen: Set<string>,
  item: Finding,
): void {
  const key = `${item.file}:${item.line}:${item.kind}:${item.name}`;
  if (seen.has(key)) {
    return;
  }
  seen.add(key);
  findings.push(item);
}

function isInvokedDirectly(): boolean {
  const argv1 = process.argv[1];
  if (argv1 === undefined) {
    return false;
  }

  return (
    path.normalize(path.resolve(argv1)) ===
    path.normalize(fileURLToPath(import.meta.url))
  );
}

if (isInvokedDirectly()) {
  const extraRoots = process.argv.slice(2);
  const findings = await findTenantRequestBindings(
    extraRoots.length === 0 ? {} : { roots: extraRoots },
  );
  if (findings.length > 0) {
    console.error(formatFindings(findings));
    process.exitCode = 1;
  }
}

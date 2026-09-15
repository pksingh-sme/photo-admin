import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as ts from 'typescript';

const FORBIDDEN_NAME = /oem|tenant/i;
const REQUEST_DECORATORS = new Set(['Query', 'Param', 'Body', 'Headers']);
const ZOD_OBJECT_METHODS = new Set(['object', 'strictObject', 'looseObject']);

type FindingKind = 'decorator' | 'parameter' | 'zod-key';

type Finding = {
  file: string;
  line: number;
  kind: FindingKind;
  name: string;
};

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const srcRoot = path.join(repoRoot, 'src');

export async function findTenantRequestBindings(): Promise<Finding[]> {
  const files = await listSourceFiles(srcRoot);
  const findings: Finding[] = [];

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
    visit(sourceFile, sourceFile, aliases, findings);
  }

  return findings;
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
  for (const name of REQUEST_DECORATORS) {
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
      if (REQUEST_DECORATORS.has(imported)) {
        aliases.set(specifier.name.text, imported);
      }
    }
  }

  return aliases;
}

function visit(
  node: ts.Node,
  sourceFile: ts.SourceFile,
  aliases: Map<string, string>,
  findings: Finding[],
): void {
  if (ts.isParameter(node)) {
    collectParameterFindings(node, sourceFile, aliases, findings);
  }

  if (ts.isCallExpression(node) && isZodObjectLikeCall(node)) {
    collectZodObjectKeys(node, sourceFile, findings);
  }

  ts.forEachChild(node, (child) => {
    visit(child, sourceFile, aliases, findings);
  });
}

function collectParameterFindings(
  param: ts.ParameterDeclaration,
  sourceFile: ts.SourceFile,
  aliases: Map<string, string>,
  findings: Finding[],
): void {
  const requestDecorators = getNodeDecorators(param).filter((decorator) => {
    const name = decoratorCalleeName(decorator);
    return name !== undefined && aliases.has(name);
  });

  if (requestDecorators.length === 0) {
    return;
  }

  for (const decorator of requestDecorators) {
    const arg = firstStringArgument(decorator);
    if (arg !== undefined && FORBIDDEN_NAME.test(arg)) {
      findings.push(finding(sourceFile, decorator, 'decorator', arg));
    }
  }

  for (const name of bindingNames(param.name)) {
    if (FORBIDDEN_NAME.test(name)) {
      findings.push(finding(sourceFile, param.name, 'parameter', name));
    }
  }
}

function collectZodObjectKeys(
  call: ts.CallExpression,
  sourceFile: ts.SourceFile,
  findings: Finding[],
): void {
  const first = call.arguments[0];
  if (first === undefined || !ts.isObjectLiteralExpression(first)) {
    return;
  }

  for (const property of first.properties) {
    const name = objectLiteralKey(property);
    if (name !== undefined && FORBIDDEN_NAME.test(name)) {
      findings.push(finding(sourceFile, property, 'zod-key', name));
    }
  }
}

function isZodObjectLikeCall(node: ts.CallExpression): boolean {
  if (!ts.isPropertyAccessExpression(node.expression)) {
    return false;
  }

  const method = node.expression.name.text;
  if (!ZOD_OBJECT_METHODS.has(method) && method !== 'extend') {
    return false;
  }

  return isZodChain(node.expression.expression);
}

function isZodChain(expression: ts.Expression): boolean {
  if (ts.isIdentifier(expression)) {
    return expression.text === 'z' || expression.text === 'zod';
  }

  if (ts.isPropertyAccessExpression(expression)) {
    return isZodChain(expression.expression);
  }

  if (ts.isCallExpression(expression)) {
    return isZodChain(expression.expression);
  }

  if (ts.isParenthesizedExpression(expression)) {
    return isZodChain(expression.expression);
  }

  return false;
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

  const first = expression.arguments[0];
  if (first === undefined) {
    return undefined;
  }
  if (ts.isStringLiteral(first) || ts.isNoSubstitutionTemplateLiteral(first)) {
    return first.text;
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

function formatFindings(findings: Finding[]): string {
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
  const findings = await findTenantRequestBindings();
  if (findings.length > 0) {
    console.error(formatFindings(findings));
    process.exitCode = 1;
  }
}

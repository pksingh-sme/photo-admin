/**
 * FR-API-003: request bodies/query/params are Zod schemas, never class DTOs.
 * The tenant-in-request scanner only sees z.object keys and decorator
 * string arguments. A class or interface is a second shape it cannot scan.
 */

const REQUEST_PARAM_DECORATORS = new Set(['Body', 'Query', 'Param']);

/** @type {import('eslint').Rule.RuleModule} */
export const zodInferRequestParamsRule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Require @Body/@Query/@Param parameters to be z.infer<typeof schema> validated by zodPipe',
    },
    schema: [],
    messages: {
      mustBeZodInfer:
        'Request parameters must be typed as z.infer<typeof schema> and validated by zodPipe(...). Class and interface DTOs hide tenant identifiers from FR-API-003.',
    },
  },
  create(context) {
    const aliases = new Map();

    return {
      Program() {
        aliases.clear();
        for (const name of REQUEST_PARAM_DECORATORS) {
          aliases.set(name, name);
        }
      },
      ImportDeclaration(node) {
        if (node.source.value !== '@nestjs/common') {
          return;
        }
        const bindings = node.specifiers;
        if (!Array.isArray(bindings)) {
          return;
        }
        for (const specifier of bindings) {
          if (specifier.type !== 'ImportSpecifier') {
            continue;
          }
          const imported = specifier.imported;
          const importedName =
            imported.type === 'Identifier' ? imported.name : imported.value;
          if (
            typeof importedName === 'string' &&
            REQUEST_PARAM_DECORATORS.has(importedName)
          ) {
            aliases.set(specifier.local.name, importedName);
          }
        }
      },
      MethodDefinition(node) {
        checkFunction(context, aliases, node.value);
      },
      PropertyDefinition(node) {
        if (
          node.value?.type === 'FunctionExpression' ||
          node.value?.type === 'ArrowFunctionExpression'
        ) {
          checkFunction(context, aliases, node.value);
        }
      },
    };
  },
};

function checkFunction(context, aliases, fn) {
  if (fn === null || fn.params === undefined) {
    return;
  }
  for (const param of fn.params) {
    if (!isRequestParam(param, aliases)) {
      continue;
    }
    if (hasZodPipe(param, aliases) && isZodInferType(param.typeAnnotation)) {
      continue;
    }
    context.report({ node: param, messageId: 'mustBeZodInfer' });
  }
}

function isRequestParam(param, aliases) {
  const decorators = param.decorators;
  if (!Array.isArray(decorators)) {
    return false;
  }
  return decorators.some((decorator) => {
    const name = decoratorCalleeName(decorator);
    return name !== undefined && aliases.has(name);
  });
}

function hasZodPipe(param, aliases) {
  const decorators = param.decorators;
  if (!Array.isArray(decorators)) {
    return false;
  }
  return decorators.some((decorator) => {
    const name = decoratorCalleeName(decorator);
    if (name === undefined || !aliases.has(name)) {
      return false;
    }
    const expression = decorator.expression;
    if (expression.type !== 'CallExpression') {
      return false;
    }
    return expression.arguments.some(isZodPipeArgument);
  });
}

function isZodPipeArgument(argument) {
  if (argument.type === 'CallExpression') {
    return identifierName(argument.callee) === 'zodPipe';
  }
  if (argument.type === 'NewExpression') {
    return identifierName(argument.callee) === 'ZodValidationPipe';
  }
  return false;
}

function isZodInferType(typeAnnotation) {
  if (typeAnnotation === undefined || typeAnnotation.type !== 'TSTypeAnnotation') {
    return false;
  }
  const typeNode = typeAnnotation.typeAnnotation;
  if (typeNode.type !== 'TSTypeReference') {
    return false;
  }
  const typeName = typeNode.typeName;
  if (typeName.type !== 'TSQualifiedName') {
    return false;
  }
  if (identifierName(typeName.left) !== 'z') {
    return false;
  }
  if (typeName.right.type !== 'Identifier' || typeName.right.name !== 'infer') {
    return false;
  }
  const typeArgs = typeNode.typeArguments?.params;
  if (!Array.isArray(typeArgs) || typeArgs.length !== 1) {
    return false;
  }
  const only = typeArgs[0];
  return only !== undefined && only.type === 'TSTypeQuery';
}

function decoratorCalleeName(decorator) {
  const expression = decorator.expression;
  if (expression.type === 'CallExpression') {
    return identifierName(expression.callee);
  }
  return identifierName(expression);
}

function identifierName(node) {
  if (node !== undefined && node.type === 'Identifier') {
    return node.name;
  }
  return undefined;
}

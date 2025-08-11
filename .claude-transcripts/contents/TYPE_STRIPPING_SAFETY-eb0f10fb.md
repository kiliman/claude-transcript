# TypeScript Type Stripping Safety Configuration

This project uses Node.js 24's native TypeScript type stripping feature, which means TypeScript code runs directly without compilation. To ensure runtime safety, we've configured both TypeScript and Biome to reject TypeScript-only syntax that requires transformation.

## TypeScript Configuration

The following settings in `tsconfig.json` help prevent transformation-requiring syntax:

- **`isolatedModules: true`** - Ensures each file can be transpiled independently
- **`verbatimModuleSyntax: true`** - Enforces explicit `type` imports/exports
- **`noEmit: true`** - TypeScript is used for type checking only
- **`experimentalDecorators: false`** - Decorators are disabled
- **`emitDecoratorMetadata: false`** - No decorator metadata

## Biome Linter Rules

The following Biome rules prevent TypeScript-only syntax:

- **`noEnum`** - Disallows TypeScript enums
- **`noConstEnum`** - Disallows const enums
- **`noNamespace`** - Disallows TypeScript namespaces
- **`noParameterProperties`** - Disallows parameter properties in constructors

## Allowed TypeScript Features

✅ Type annotations
✅ Type aliases (`type`)
✅ Interfaces
✅ Generic types
✅ Type imports/exports (with `type` keyword)

## Disallowed TypeScript Features

❌ Enums
❌ Const enums
❌ Namespaces
❌ Parameter properties
❌ Experimental decorators
❌ Non-type imports that would be erased

## Running Checks

```bash
# Type checking
npm run typecheck

# Linting (includes TypeScript-only syntax checks)
npm run lint

# Format code
npm run format
```
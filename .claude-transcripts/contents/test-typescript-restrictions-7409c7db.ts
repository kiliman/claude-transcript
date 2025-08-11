// This file tests TypeScript restrictions for Node.js type stripping compatibility

// ✅ ALLOWED: Type annotations (stripped by Node.js)
const x: number = 5
type MyType = { foo: string }
interface MyInterface { bar: number }

// ✅ ALLOWED: Type imports/exports with explicit 'type' keyword
import type { SomeType } from './types.ts'
export type { MyType }

// ❌ SHOULD ERROR: const enum (requires transformation)
const enum Color {
  Red,
  Green,
  Blue
}

// ❌ SHOULD ERROR: namespace (requires transformation)
namespace MyNamespace {
  export const value = 42
}

// ❌ SHOULD ERROR: enum (requires transformation for some uses)
enum Status {
  Active,
  Inactive
}

// ❌ SHOULD ERROR: parameter properties (requires transformation)
class MyClass {
  constructor(public name: string) {}
}

// ❌ SHOULD ERROR: experimental decorators (requires transformation)
function MyDecorator(target: any) {
  // decorator
}

@MyDecorator
class DecoratedClass {}

// ❌ SHOULD ERROR: non-type imports that would be erased
// (verbatimModuleSyntax should catch this)
import { OnlyUsedAsType } from './types.ts'
const y: OnlyUsedAsType = {}
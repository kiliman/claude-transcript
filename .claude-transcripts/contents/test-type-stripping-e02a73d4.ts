// Test file to verify TypeScript-only syntax is rejected

// ✅ ALLOWED: Type annotations (these are fine with type stripping)
const x: number = 5
type MyType = { foo: string }
interface MyInterface { bar: number }

// ❌ SHOULD ERROR: enum (Biome noEnum rule)
enum Color {
  Red,
  Green,
  Blue
}

// ❌ SHOULD ERROR: const enum (Biome noConstEnum rule)
const enum Direction {
  Up,
  Down,
  Left,
  Right
}

// ❌ SHOULD ERROR: namespace (Biome noNamespace rule)
namespace MyNamespace {
  export const value = 42
}

// ❌ SHOULD ERROR: parameter properties (requires transformation)
class MyClass {
  constructor(public name: string) {}
}

// Test uses to suppress unused warnings
console.log(x, Color.Red, Direction.Up, MyNamespace.value)
const instance = new MyClass('test')
console.log(instance.name)
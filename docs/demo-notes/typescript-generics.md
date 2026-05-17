# TypeScript Generics — Personal Notes

OK I keep getting tripped up by generics so here's what's clicking.

## The basic idea

A generic function is one that works for many types instead of one. Instead of
writing one `identity` for strings and another for numbers, you write a single
function with a type parameter:

```ts
function identity<T>(x: T): T {
  return x;
}
```

The `T` is the type parameter. When you call `identity(42)`, TypeScript infers
`T = number`. When you call `identity("hi")`, it infers `T = string`. The body of the
function has to work for any T, which is why you can't reach inside the value (you
don't know what's there).

## Constraints

Sometimes you need T to have certain properties. That's where extends comes in:

```ts
function getLength<T extends { length: number }>(x: T): number {
  return x.length;
}
```

Now `T` is constrained to types that have a `length` property. Calling `getLength(5)`
is a type error. Calling `getLength("hello")` works, and so does `getLength([1, 2])`.

## Type parameters and type arguments

The named placeholders inside the angle brackets in the declaration are type
parameters. The actual types you (or the inference engine) supply at the call site are
type arguments. So `T` is a type parameter, and the `string` in `identity<string>("hi")`
is a type argument.

## Variance

Variance is the part that took me forever. The question is: if Dog extends Animal,
is `Array<Dog>` a subtype of `Array<Animal>`?

Covariance means yes — the relationship is preserved. Most read-only structures are
covariant in their element type.

Contravariance means the relationship flips. Function parameter positions are
contravariant: `(a: Animal) => void` is a subtype of `(d: Dog) => void`, because a
function that accepts any Animal can be safely used wherever one that accepts only
Dogs is required.

Invariance means neither direction holds. Mutable arrays in some languages are
invariant in their element type for soundness reasons.

TypeScript is mostly bivariant on function parameters by default, which is unsound but
ergonomic. The strictFunctionTypes flag enforces real contravariance.

## Conditional types

Conditional types let you branch on a type:

```ts
type IsString<T> = T extends string ? true : false;
type A = IsString<"hi">;   // true
type B = IsString<42>;     // false
```

Conditional types distribute over unions: `IsString<string | number>` becomes
`IsString<string> | IsString<number>` which evaluates to `true | false` which is just
`boolean`. To prevent distribution, wrap the type parameter in a tuple:
`[T] extends [string]`.

## Mapped types

A mapped type produces a new object type by iterating over the keys of an existing
type. The classic example is Partial:

```ts
type Partial<T> = {
  [K in keyof T]?: T[K];
};
```

The `keyof T` operator gives the union of T's property keys. The `[K in ...]` syntax
maps over them. The optional modifier `?` makes every property optional.

## infer

Inside a conditional type, the infer keyword introduces a new type variable that the
compiler will solve for. Useful for extracting types from generic shapes:

```ts
type ReturnType<F> = F extends (...args: any[]) => infer R ? R : never;
```

This says: if F is a function type, capture its return type as R and return R;
otherwise return never.

## What I still trip on

Higher-kinded types — TypeScript doesn't really have them. You can't write a generic
that's parameterized over another generic. People simulate it with the
"defunctionalization" trick using a registry interface but it's awkward.

Recursive conditional types compile but the compiler will give up after a few levels.
There's a depth limit and you'll hit it eventually on anything serious.

When inference fails, the workaround is usually to add an explicit type argument or
to lift the troublesome part into its own helper with a clearer signature.

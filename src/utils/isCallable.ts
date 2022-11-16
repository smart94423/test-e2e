export function isCallable(thing: unknown): thing is Function {
  return thing instanceof Function || typeof thing === 'function'
}

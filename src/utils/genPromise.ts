export function genPromise<T>() {
  let resolve!: (value: T) => void
  let reject!: (value?: T) => void
  const promise: Promise<T> = new Promise((resolve_, reject_) => {
    resolve = resolve_
    reject = reject_
  })
  return { promise, resolve, reject }
}

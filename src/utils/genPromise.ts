export function genPromise<T = undefined>() {
  let resolve!: (value: T) => void
  let reject!: (value?: Error) => void
  const promise: Promise<T> = new Promise((resolve_, reject_) => {
    resolve = resolve_
    reject = reject_
  })
  return { promise, resolve, reject }
}

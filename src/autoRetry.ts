export { autoRetry }

import { TIMEOUT_AUTORETRY } from './TIMEOUTS'
import { sleep } from './utils'

async function autoRetry(
  test: () => void | Promise<void>,
  { timeout = TIMEOUT_AUTORETRY }: { timeout?: number } = {}
): Promise<void> {
  const period = 100
  const numberOfTries = timeout / period
  let i = 0
  while (true) {
    try {
      await test()
      return
    } catch (err) {
      i = i + 1
      if (i > numberOfTries) {
        throw err
      }
    }
    await sleep(period)
  }
}

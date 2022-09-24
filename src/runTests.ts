export { runTests }

import assert from 'assert'
import type { Browser } from 'playwright-chromium'
import { getTestInfo } from './getTestInfo'
import { logProgress } from './logProgress'

async function runTests(browser: Browser) {
  const testInfo = getTestInfo()

  const page = await browser.newPage()
  testInfo.page = page

  // Set by `test()`
  assert(testInfo.tests)

  // Set by `run()`
  assert(testInfo.beforeAll)
  assert(testInfo.afterAll)
  assert(testInfo.afterEach)
  assert(testInfo.testTimeout)

  /*
  assert(testInfo.testRun)
  await testInfo.testRun()
  */

  await testInfo.beforeAll()

  for (const { testDesc, testFn } of testInfo.tests) {
    const done = logProgress(`[test] ${testDesc}`)
    const err = await runTest(testFn, testInfo.testTimeout)
    done(!!err)
    await testInfo.afterEach(err)
  }

  await testInfo.afterAll()
  await page.close()
}

function runTest(testFn: Function, testTimeout: number): Promise<undefined | unknown> {
  let resolve!: () => void
  let reject!: (err: unknown) => void
  const promise = new Promise<void>((resolve_, reject_) => {
    resolve = resolve_
    reject = reject_
  })

  const timeout = setTimeout(() => {
    reject(new Error('[test][TIMEOUT]'))
  }, testTimeout)

  const ret: unknown = testFn()
  ;(async () => {
    try {
      await ret
      resolve()
    } catch (err) {
      reject(err)
    } finally {
      clearTimeout(timeout)
    }
  })()

  return promise
}

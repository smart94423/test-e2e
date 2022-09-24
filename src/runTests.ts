export { runTests }

import assert from 'assert'
import { getTestInfo } from './getTestInfo'
import { getBrowser } from './getBrowser'

async function runTests() {
  const testInfo = getTestInfo()

  const browser = await getBrowser()
  const page = await browser.newPage()
  testInfo.page = page

  // Set by `test()`
  assert(testInfo.tests)

  // Set by `run()`
  assert(testInfo.beforeAll)
  assert(testInfo.afterAll)
  assert(testInfo.afterEach)

  await testInfo.beforeAll()

  for (const { testDesc, testFn } of testInfo.tests) {
    try {
      await testFn()
    } catch (err) {
      console.log(`ERROR: ${testInfo.testFile} "${testDesc}"`)
      throw err
    }
    await testInfo.afterEach()
  }

  await testInfo.afterAll()
}

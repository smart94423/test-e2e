export { test }

import { assert } from './utils'
import { getCurrentTest } from './getCurrentTest'

function test(testDesc: string, testFn: () => void | Promise<void>) {
  const testInfo = getCurrentTest()
  assert(!testInfo.hasStartedRunning)
  testInfo.tests = testInfo.tests ?? []
  testInfo.tests.push({
    testDesc,
    testFn,
  })
}

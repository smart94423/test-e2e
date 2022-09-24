export { test }

import assert from 'assert'
import { getTestInfo } from './getTestInfo'

function test(testDesc: string, testFn: () => void | Promise<void>) {
  const testInfo = getTestInfo()
  assert(!testInfo.hasStartedRunning)
  testInfo.tests = testInfo.tests ?? []
  testInfo.tests.push({
    testDesc,
    testFn
  })
}

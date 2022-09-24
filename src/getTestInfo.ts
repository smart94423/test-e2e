export { getTestInfo }
export { setTestInfo }

import type { Page } from 'playwright-chromium'
import assert from 'assert'

type TestInfo = {
  testFile: string
  // testRun: () => Promise<void>
  tests?: {
    testDesc: string
    testFn: Function
  }[]
  testCmd?: string
  testTimeout?: number
  hasStartedRunning?: boolean
  beforeAll?: () => Promise<void>
  afterAll?: () => Promise<void>
  afterEach?: (err?: unknown) => void | Promise<void>
  page?: Page
}
let testInfo: null | TestInfo = null

function getTestInfo() {
  assert(testInfo)
  return testInfo
}
function setTestInfo(testInfo_: null | TestInfo) {
  testInfo = testInfo_
}

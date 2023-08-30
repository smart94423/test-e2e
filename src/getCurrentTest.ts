export { getCurrentTest }
export { getCurrentTestOptional }
export { setCurrentTest }

export { getRunInfo }
export { setRunInfo }

export { getCwd }
export { getServerUrl }

export type { TestInfo }

import type { Page } from 'playwright-chromium'
import { assert } from './utils'
import path from 'path'
import { TIMEOUT_TEST_FUNCTION } from './TIMEOUTS'

type TestInfo = {
  testFile: string
  testName: string
  // testRun: () => Promise<void>
  tests?: {
    testDesc: string
    testFn: Function
  }[]
  testOptions?: {
    doNotFailOnWarning: boolean
    testFunctionTimeout: number
    isFlaky: boolean
  }
  runInfo?: {
    cmd: string
    serverUrl: string
    doNotFailOnWarning: boolean
    testFunctionTimeout: number
    isFlaky: boolean
    isRunCommandThatTerminates: boolean
  }
  hasStartedRunning?: boolean
  skipped?: { reason: string }
  startServer?: () => Promise<void>
  terminateServer?: () => Promise<void>
  afterEach?: (hasFailed: boolean) => void
  page?: Page
}
let testInfo: null | TestInfo = null

function getCurrentTest(): TestInfo {
  if (!testInfo) throw new Error('testInfo missing')
  return testInfo
}
function getCurrentTestOptional(): null | TestInfo {
  return testInfo
}

function setCurrentTest(testFile: null | string) {
  if (testFile) {
    testInfo = {
      testFile,
      testName: getTestName(testFile),
    }
  } else {
    testInfo = null
  }
}

function getTestName(testFile: string) {
  const pathRelative = removeRootDir(testFile)
  if (testFile.includes('examples')) {
    return path.dirname(pathRelative)
  } else {
    return pathRelative
  }
}

function removeRootDir(filePath: string) {
  const rootDir = process.cwd()
  assert(filePath.startsWith(rootDir))
  return filePath.slice(rootDir.length)
}

function getRunInfo() {
  const testInfo = getCurrentTest()
  assert(testInfo.runInfo)
  return testInfo.runInfo
}

const serverUrlDefault = 'http://localhost:3000'
function setRunInfo({
  cmd,
  serverUrl = serverUrlDefault,
  additionalTimeout = 0,
  doNotFailOnWarning = false,
  isFlaky = false,
  isRunCommandThatTerminates = false,
}: {
  cmd: string
  serverUrl?: string
  additionalTimeout?: number
  doNotFailOnWarning?: boolean
  isFlaky?: boolean
  isRunCommandThatTerminates?: boolean
}) {
  const testInfo = getCurrentTest()
  const testFunctionTimeout = TIMEOUT_TEST_FUNCTION + additionalTimeout
  testInfo.runInfo = {
    cmd,
    serverUrl,
    testFunctionTimeout,
    doNotFailOnWarning,
    isFlaky,
    isRunCommandThatTerminates,
  }
}

function getCwd() {
  const { testFile } = getCurrentTest()
  const cwd = path.dirname(testFile)
  return cwd
}

function getServerUrl(): string {
  const testInfo = getCurrentTest()
  const serverUrl = testInfo.runInfo?.serverUrl!
  return serverUrl
}

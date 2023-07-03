export { getCurrentTest }
export { getCurrentTestOptional }
export { setCurrentTest }

export { getCwd }
export { getRunInfo }

export type { TestInfo }

import type { Page } from 'playwright-chromium'
import { assert } from './utils'
import path from 'path'

type TestInfo = {
  testFile: string
  testName: string
  // testRun: () => Promise<void>
  tests?: {
    testDesc: string
    testFn: Function
  }[]
  runInfo?: {
    cmd: string
    testFunctionTimeout: number
    additionalTimeout: number
    serverIsReadyMessage?: string | ((log: string) => boolean)
    serverIsReadyDelay: number
    inspect: boolean
    doNotFailOnWarning: boolean
    serverUrl: string
    isFlaky: boolean
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
  assert(testInfo)
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

function getCwd() {
  const { testFile } = getCurrentTest()
  const cwd = path.dirname(testFile)
  return cwd
}

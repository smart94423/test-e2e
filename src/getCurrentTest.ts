export { getCurrentTest }
export { getCurrentTestOptional }
export { setCurrentTest }

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
    cwd: string
    testFunctionTimeout: number
    additionalTimeout: number
    serverIsReadyMessage?: string
    serverIsReadyDelay: number
    debug: boolean
  }
  hasStartedRunning?: boolean
  skipped?: string
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

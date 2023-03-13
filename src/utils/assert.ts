export { assert }
export { assertUsage }
export { assertWarning }
export { assertInfo }
export { getProjectError }
export { errorPrefix as projectErrorPrefix }

import { projectInfo } from './projectInfo'
import { Logs } from '../Logs'
import { getCurrentTest } from '../getCurrentTest'
import { logSection } from '../logSection'
import { logError } from '../logError'
import { logFail } from '../logTestStatus'

const errorPrefix = `[${projectInfo.npmPackageName}]`
const internalErrorPrefix = `${errorPrefix}[Bug]`
const usageErrorPrefix = `${errorPrefix}[Wrong Usage]`
const warningPrefix = `${errorPrefix}[Warning]`
const infoPrefix = `${errorPrefix}[Info]`

function assert(condition: unknown, debugInfo?: unknown): asserts condition {
  if (condition) {
    return
  }

  const debugStr = (() => {
    if (!debugInfo) {
      return ''
    }
    const debugInfoSerialized = typeof debugInfo === 'string' ? debugInfo : '`' + JSON.stringify(debugInfo) + '`'
    return `Debug info (this is for the ${projectInfo.projectName} maintainers; you can ignore this): ${debugInfoSerialized}.`
  })()

  const internalError = new Error(
    [
      `${internalErrorPrefix} You stumbled upon a bug in ${projectInfo.projectName}'s source code.`,
      `Reach out at ${projectInfo.githubRepository}/issues/new and include this error stack (the error stack is usually enough to fix the problem).`,
      'A maintainer will fix the bug (usually under 24 hours).',
      `Do not hesitate to reach out as it makes ${projectInfo.projectName} more robust.`,
      debugStr,
    ].join(' ')
  )

  logFail('a bug occurred in @brillout/test-e2e', true)
  logError(internalError, 'BUG')
  logDebugInfo()
  Logs.logErrorsAndWarnings()
  Logs.flushLogs()

  throw new Error('Bug. See messages above.')
}

function assertUsage(condition: unknown, errorMessage: string): asserts condition {
  if (condition) {
    return
  }
  const whiteSpace = errorMessage.startsWith('[') ? '' : ' '
  throw new Error(`${usageErrorPrefix}${whiteSpace}${errorMessage}`)
}

function getProjectError(errorMessage: string) {
  const projectError = new Error(`${errorPrefix} ${errorMessage}`)
  return projectError
}

let loggedWarnings: Set<string> = new Set()
function assertWarning(condition: unknown, errorMessage: string, { onlyOnce }: { onlyOnce: boolean | string }): void {
  if (condition) {
    return
  }
  const msg = `${warningPrefix} ${errorMessage}`
  if (onlyOnce) {
    const key = onlyOnce === true ? msg : onlyOnce
    if (loggedWarnings.has(key)) {
      return
    } else {
      loggedWarnings.add(key)
    }
  }
  console.warn(msg)
}

function assertInfo(condition: unknown, errorMessage: string): void {
  if (condition) {
    return
  }
  console.warn(`${infoPrefix} ${errorMessage}`)
}

function logDebugInfo() {
  logSection('DEBUG INFO')
  const testInfo = getCurrentTest()
  console.log('testInfo.hasStartedRunning', testInfo.hasStartedRunning)
  console.log('testInfo.skipped', testInfo.skipped)
  console.log('testInfo.runInfo', testInfo.runInfo)
  console.log('testInfo.testFile', testInfo.testFile)
  console.log('testInfo.testName', testInfo.testName)
  console.log('process.platform', process.platform)
}

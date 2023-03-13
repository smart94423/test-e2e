export { expectError }
export const Logs = {
  add,
  flushLogs,
  logErrorsAndWarnings,
  clearLogs,
  hasFailLogs,
  logEagerly: false,
}

import { assert, ensureNewTerminalLine, isWindows } from './utils'
import pc from 'picocolors'
import { getCurrentTestOptional } from './getCurrentTest'
import { getConfig } from './getConfig'
import { logSection } from './logSection'

type LogSource =
  | 'stdout'
  | 'stderr'
  | 'Browser Error'
  | 'Browser Warning'
  | 'Browser Log'
  | 'Playwright'
  | 'run()'
  | 'run() failure'
  | 'test()'
  | 'Connection Error'
type LogEntry = {
  logSource: LogSource
  logText: string
  logTimestamp: string
  isNotFailure: boolean
  loggedAfterExit: boolean
}
let logEntries: LogEntry[] = []

function hasFailLogs(failOnWarning: boolean): boolean {
  const failLogs = getErrorLogs(failOnWarning)
  return failLogs.length > 0
}

function getErrorLogs(includeWarnings: boolean) {
  const errorLogs = logEntries.filter(({ logSource, isNotFailure, loggedAfterExit }) => {
    if (isNotFailure) {
      return false
    }
    // taskkill makes process exit with exit code `1` which makes npm emit logs on stderr
    if (loggedAfterExit && isWindows() && logSource === 'stderr') {
      return false
    }
    if (logSource === 'run() failure') {
      return true
    }
    if (includeWarnings && (logSource === 'Browser Warning' || logSource === 'stderr')) {
      return true
    }
    if (logSource === 'Browser Error') {
      return true
    }
    return false
  })
  return errorLogs
}

function clearLogs() {
  logEntries = []
}

function logErrorsAndWarnings() {
  const errorAndWarningLogs = getErrorLogs(true)
  if (errorAndWarningLogs.length === 0) return
  logSection('ERROR & WARNING LOGS')
  errorAndWarningLogs.forEach((logEntry) => printLog(logEntry))
}

function flushLogs() {
  logSection('ALL LOGS')
  logEntries.filter((logEntry) => !logEntry.loggedAfterExit).forEach((logEntry) => printLog(logEntry))
  logEntries = []
}
function add({
  logSource,
  logText,
  loggedAfterExit = false,
}: {
  logSource: LogSource
  logText: string
  loggedAfterExit?: boolean
}) {
  const logTimestamp = getTimestamp()

  const isNotFailure = (() => {
    const config = getConfig()
    if (!config.tolerateError) {
      return false
    }
    return config.tolerateError({
      logSource,
      logText,
    })
  })()

  const logEntry = {
    logSource,
    logText,
    logTimestamp,
    isNotFailure,
    loggedAfterExit,
  }
  logEntries.push(logEntry)
  if (Logs.logEagerly) {
    printLog(logEntry)
  }
}

function expectError(logFilter: (browserLog: LogEntry) => boolean) {
  const logFounds = logEntries.filter((logEntry) => {
    if (logFilter(logEntry)) {
      logEntry.isNotFailure = true
      return true
    }
    return false
  })
  //expect(logFounds.length).not.toBe(0)
  assert(logFounds.length > 0)
}

function getTimestamp() {
  const now = new Date()
  const time = now.toTimeString().split(' ')[0]
  const milliseconds = now.getTime().toString().split('').slice(-3).join('')
  const timestamp = time + '.' + milliseconds
  return timestamp
}

function printLog(logEntry: LogEntry) {
  const { logSource, logText, logTimestamp } = logEntry

  let logSourceLabel: string = colorize(logSource)

  const testInfo = getCurrentTestOptional()

  // See https://github.com/nodejs/node/issues/8033#issuecomment-388323687
  if (!ensureNewTerminalLine()) {
    console.log('')
  }

  let msg = logText
  // I don't know why but sometimes `logText` is `undefined`
  if (msg === undefined) msg = ''
  // Some logs seem have a trailing new line
  msg = msg.trim()

  let testInfoLabels = ''
  if (testInfo) {
    assert(testInfo.runInfo)
    testInfoLabels = `[${testInfo.testName}][${testInfo.runInfo.cmd}]`
  }

  console.log(`[${logTimestamp}]${testInfoLabels}[${logSourceLabel}] ${msg}`)
}

function colorize(logSource: LogSource): string {
  const { bold } = pc
  if (
    logSource === 'stderr' ||
    logSource === 'Browser Error' ||
    logSource === 'Connection Error' ||
    logSource === 'run() failure'
  ) {
    return bold(pc.red(logSource))
  }
  if (logSource === 'Browser Warning') {
    return bold(pc.yellow(logSource))
  }
  if (logSource === 'stdout' || logSource === 'Browser Log') {
    return bold(pc.blue(logSource))
  }
  if (logSource === 'Playwright') {
    return bold(pc.magenta(logSource))
  }
  if (logSource === 'run()' || logSource === 'test()') {
    return bold(pc.cyan(logSource))
  }
  assert(false)
}

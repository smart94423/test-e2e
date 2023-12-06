export { expectLog }
export const Logs = {
  add,
  flushLogs,
  logErrorsAndWarnings,
  clearLogs,
  hasFailLogs,
  logEagerly: false as false | 'all' | 'logs',
}
export type { LogSource }

import { assert, ensureNewTerminalLine, isWindows } from './utils'
import pc from '@brillout/picocolors'
import { getCurrentTestOptional } from './getCurrentTest'
import { logSection } from './logSection'
import { isTolerateError } from './Logs/isTolerateError'
import stripAnsi from 'strip-ansi'

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
  const errorLogs = logEntries.filter((logEntry) => {
    if (logEntry.isNotFailure) {
      return false
    }
    const { logSource } = logEntry
    // taskkill makes process exit with exit code `1` which makes npm emit logs on stderr
    if (logEntry.loggedAfterExit && isWindows() && logSource === 'stderr') {
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

  const logEntry = {
    logSource,
    logText,
    logTimestamp,
    isNotFailure: isTolerateError({ logSource, logText }),
    loggedAfterExit,
  }
  logEntries.push(logEntry)
  if (Logs.logEagerly) {
    let shouldLog = false
    if (Logs.logEagerly === 'all') shouldLog = true
    if (Logs.logEagerly === 'logs' && logSource !== 'Playwright') shouldLog = true
    if (shouldLog) printLog(logEntry)
  }
}

function expectLog(logText: string, logFilter?: (logEntry: LogEntry) => boolean) {
  const logsFound = logEntries.filter((logEntry) => {
    if (removeAnsi(logEntry).logText.includes(logText)) {
      logEntry.isNotFailure = true
      return true
    }
    return false
  })
  let logsFoundWithFilter = logsFound
  if (logFilter) {
    logsFoundWithFilter = logsFoundWithFilter.filter((logEntry) => logFilter(removeAnsi(logEntry)))
  }
  if (logsFoundWithFilter.length === 0) {
    if (logsFound.length === 0) {
      throw new Error(`The following log was expected but it wasn't logged: "${logText}"`)
    } else {
      throw new Error(`The following log was logged as expected, but it didn't match the logFilter() you provided`)
    }
  }
}

function removeAnsi(logEntry: LogEntry): LogEntry {
  const logEntryWithoutAnsi = {
    ...logEntry,
    logText: stripAnsi(logEntry.logText),
  }
  return logEntryWithoutAnsi
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
    assert(testInfo.runInfo, testInfo)
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

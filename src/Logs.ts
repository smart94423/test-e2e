export { expectBrowserError }
export const Logs = {
  add,
  flush,
  clear,
  getBrowserErrors,
  flushEagerly: false,
}

import { assert } from './utils'
import pc from 'picocolors'
import {getCurrentTest} from './getCurrentTest'

type LogSource =
  | 'stdout'
  | 'stderr'
  | 'Browser Error'
  | 'Browser Log'
  | 'Playwright'
  | 'run()'
  | 'Connection Error'
type LogEntry = {
  logSource: LogSource
  logText: string
  logTimestamp: string
  isExpectedError: boolean
}
let logEntries: LogEntry[] = []
let logEntriesNotPrinted: LogEntry[] = []

function getBrowserErrors() {
  return logEntries.filter(({ logSource, isExpectedError }) => logSource === 'Browser Error' && !isExpectedError)
}

function clear() {
  logEntries = []
  logEntriesNotPrinted = []
}

function flush() {
  logEntriesNotPrinted.forEach((logEntry) => printLog(logEntry))
  logEntriesNotPrinted = []
}
function add({ logSource, logText}: { logSource: LogSource; logText: string }) {
  const logTimestamp = getTimestamp()
  const logEntry = {
    logSource,
    logText,
    logTimestamp,
    isExpectedError: false,
  }
  logEntriesNotPrinted.push(logEntry)
  logEntries.push(logEntry)
  if (Logs.flushEagerly) {
    flush()
  }
}

function expectBrowserError(browserLogFilter: (browserLog: LogEntry) => boolean) {
  const found = !!logEntries.find((logEntry) => {
    if (browserLogFilter(logEntry)) {
      logEntry.isExpectedError = true
      return true
    }
    return false
  })
  //expect(found).toBe(true)
  assert(found === true)
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

  let prefix: string = colorizeLogSource(logSource)

  let msg = logText
  if (!msg) msg = '' // don't know why but sometimes `logText` is `undefined`
  if (!msg.endsWith('\n')) msg = msg + '\n'

  const testInfo = getCurrentTest()
  assert(testInfo.runInfo)

  process.stderr.write(`[${logTimestamp}][${testInfo.testName}][${testInfo.runInfo.cmd}][${prefix}] ${msg}`)
}

function colorizeLogSource(logSource: LogSource): string {
  const { bold } = pc
  if (logSource === 'stderr' || logSource === 'Browser Error') return bold(pc.red(logSource))
  if (logSource === 'stdout' || logSource === 'Browser Log') return bold(pc.blue(logSource))
  if (logSource === 'Playwright') return bold(pc.magenta(logSource))
  if (logSource === 'run()') return bold(pc.yellow(logSource))
  return logSource
}

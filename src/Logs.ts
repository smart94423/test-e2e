export { expectBrowserError }
export const Logs = {
  add,
  flush,
  clear,
  getBrowserErrors,
  flushEagerly: false,
}

import { assert } from './utils'
import { red, bold, blue } from 'kolorist'

type LogType =
  | 'stdout'
  | 'stderr'
  | 'Browser Error'
  | 'Browser Log'
  | 'Run Start'
  | 'Jest'
  | 'process'
  | 'Connection Error'
type TestContext = null | { testName: string; cmd: string }
type LogEntry = {
  logType: LogType
  logText: string
  logTimestamp: string
  testContext: TestContext
  isExpectedError: boolean
}
let logEntries: LogEntry[] = []
let logEntriesNotPrinted: LogEntry[] = []

function getBrowserErrors() {
  return logEntries.filter(({ logType, isExpectedError }) => logType === 'Browser Error' && !isExpectedError)
}

function clear() {
  logEntries = []
  logEntriesNotPrinted = []
}

function flush() {
  logEntriesNotPrinted.forEach((logEntry) => printLog(logEntry))
  logEntriesNotPrinted = []
}
function add({ logType, logText, testContext }: { logType: LogType; logText: string; testContext: TestContext }) {
  const logTimestamp = getTimestamp()
  const logEntry = {
    logType,
    logText,
    testContext,
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
  const { logType, logText, logTimestamp, testContext } = logEntry

  let prefix: string = logType
  if (logType === 'stderr' || logType === 'Browser Error') prefix = bold(red(logType))
  if (logType === 'stdout' || logType === 'Browser Log') prefix = bold(blue(logType))

  let msg = logText
  if (!msg) msg = '' // don't know why but sometimes `logText` is `undefined`
  if (!msg.endsWith('\n')) msg = msg + '\n'

  if (testContext) {
    const { testName, cmd } = testContext
    msg = `[${testName}][${cmd}] ${msg}`
  }
  process.stderr.write(`[${logTimestamp}][${prefix}]${msg}`)
}

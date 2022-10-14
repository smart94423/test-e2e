export { expectBrowserError }
export const Logs = {
  add,
  flush,
  clear,
  hasError,
  flushEagerly: false,
}

import { assert, ensureNewTerminalLine } from './utils'
import pc from 'picocolors'
import { getCurrentTestOptional } from './getCurrentTest'

type LogSource =
  | 'stdout'
  | 'stderr'
  | 'Browser Error'
  | 'Browser Warning'
  | 'Browser Log'
  | 'Playwright'
  | 'run()'
  | 'test()'
  | 'Connection Error'
type LogEntry = {
  logSource: LogSource
  logText: string
  logTimestamp: string
  isExpectedError: boolean
}
let logEntries: LogEntry[] = []
let logEntriesNotPrinted: LogEntry[] = []

function hasError(): boolean {
  const logErrors = logEntries.filter(
    ({ logSource, isExpectedError }) =>
      (logSource === 'Browser Error' || logSource === 'Browser Warning' || logSource === 'stderr') && !isExpectedError
  )
  return logErrors.length > 0
}

function clear() {
  logEntries = []
  logEntriesNotPrinted = []
}

function flush() {
  logEntriesNotPrinted.forEach((logEntry) => printLog(logEntry))
  logEntriesNotPrinted = []
}
function add({ logSource, logText }: { logSource: LogSource; logText: string }) {
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

  let logSourceLabel: string = colorize(logSource)

  const testInfo = getCurrentTestOptional()

  // See https://github.com/nodejs/node/issues/8033#issuecomment-388323687
  if (!ensureNewTerminalLine()) {
    process.stderr.write(`\n`)
  }

  let msg = logText
  // I don't know why but sometimes `logText` is `undefined`
  if (msg === undefined) msg = ''
  if (!msg.endsWith('\n')) msg = msg + '\n'

  let testInfoLabels = ''
  if (testInfo) {
    assert(testInfo.runInfo)
    testInfoLabels = `[${testInfo.testName}][${testInfo.runInfo.cmd}]`
  }

  process.stderr.write(`[${logTimestamp}]${testInfoLabels}[${logSourceLabel}] ${msg}`)
}

function colorize(logSource: LogSource): string {
  const { bold } = pc
  if (logSource === 'stderr' || logSource === 'Browser Error' || logSource === 'Connection Error')
    return bold(pc.red(logSource))
  if (logSource === 'Browser Warning') return bold(pc.yellow(logSource))
  if (logSource === 'stdout' || logSource === 'Browser Log') return bold(pc.blue(logSource))
  if (logSource === 'Playwright') return bold(pc.magenta(logSource))
  if (logSource === 'run()' || logSource === 'test()') return bold(pc.cyan(logSource))
  assert(false)
}

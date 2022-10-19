export { expectError }
export const Logs = {
  add,
  flushLogs,
  clearLogs,
  hasErrorLogs,
  flushEagerly: false,
}

import { assert, ensureNewTerminalLine } from './utils'
import pc from 'picocolors'
import { getCurrentTestOptional } from './getCurrentTest'
import { getConfig } from './getConfig'

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
}
let logEntries: LogEntry[] = []

function hasErrorLogs(onlyFailOnBrowserError: boolean = false): boolean {
  const logErrors = logEntries.filter(({ logSource, isNotFailure }) => {
    if (isNotFailure) {
      return
    }
    if (logSource === 'run() failure') {
      return true
    }
    if (!onlyFailOnBrowserError && (logSource === 'Browser Warning' || logSource === 'stderr')) {
      return true
    }
    if (logSource === 'Browser Error') {
      return true
    }
    return false
  })
  return logErrors.length > 0
}

function clearLogs() {
  logEntries = []
}

function flushLogs() {
  logEntries.forEach((logEntry) => printLog(logEntry))
  logEntries = []
}
function add({ logSource, logText }: { logSource: LogSource; logText: string }) {
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
  }
  logEntries.push(logEntry)
  if (Logs.flushEagerly) {
    flushLogs()
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

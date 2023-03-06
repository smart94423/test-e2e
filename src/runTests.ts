export { runTests }

import type { Browser } from 'playwright-chromium'
import { getCurrentTest } from './getCurrentTest'
import { Logs } from './Logs'
import { assert, assertUsage, humanizeTime, isTTY, logProgress } from './utils'
import { type FindFilter, fsWindowsBugWorkaround } from './utils'
import pc from 'picocolors'
import { abortIfGitHubAction } from './github-action'
import { logSection } from './logSection'
import { setCurrentTest } from './getCurrentTest'

import { getBrowser } from './getBrowser'
import { buildTs } from './buildTs'
import { findTestFiles } from './findTestFiles'
import { loadConfig } from './getConfig'

async function runTests(filter: null | FindFilter) {
  await loadConfig()

  const testFiles = await findTestFiles(filter)

  const browser = await getBrowser()

  for (const testFile of testFiles) {
    assert(testFile.endsWith('.ts'))
    const testFileJs = testFile.replace('.ts', '.mjs')
    const clean = await buildTs(testFile, testFileJs)
    setCurrentTest(testFile)
    try {
      await import(fsWindowsBugWorkaround(testFileJs))
    } finally {
      clean()
    }
    await runTestFile(browser)
    setCurrentTest(null)
    assert(testFileJs.endsWith('.mjs'))
  }

  await browser.close()
}

async function runTestFile(browser: Browser) {
  const testInfo = getCurrentTest()

  if (isTTY) {
    console.log()
    console.log(testInfo.testFile)
  }

  const page = await browser.newPage()
  testInfo.page = page

  // Set when user calls `skip()`
  if (testInfo.skipped) {
    logResult(false)
    assertUsage(!testInfo.runInfo, 'You cannot call `run()` after calling `skip()`')
    assertUsage(testInfo.tests === undefined, 'You cannot call `test()` after calling `skip()`')
    return
  }

  // Set when user calls `run()`
  assert(testInfo.runInfo)
  assert(testInfo.startServer)
  assert(testInfo.terminateServer)
  assert(testInfo.afterEach)

  // Set when user calls `test()`
  assert(testInfo.tests)

  const clean = async () => {
    await testInfo.terminateServer?.()
    await page.close()
  }
  const abort = async () => {
    await clean()
    abortIfGitHubAction()
  }

  // TODO: resolve a success flag instead rejecting
  try {
    await testInfo.startServer()
  } catch (err) {
    logResult(false)
    logFailureReason('during server start', false)
    logError(err)
    Logs.flushLogs()
    await abort()
    return
  }

  for (const { testDesc, testFn } of testInfo.tests) {
    Logs.add({
      logSource: 'test()',
      logText: testDesc,
    })
    const done = logProgress(`| [test] ${testDesc}`)
    let err: unknown
    try {
      await runTest(testFn, testInfo.runInfo.testFunctionTimeout)
    } catch (err_) {
      err = err_
    }
    done(!!err)
    testInfo.afterEach(!!err)
    {
      const failOnWarning = !testInfo.runInfo.doNotFailOnWarning
      const hasErrorLog = Logs.hasErrorLogs(failOnWarning)
      const isFailure = err || hasErrorLog
      if (isFailure) {
        logResult(false)
        const failureContext = 'while running the tests'
        if (err) {
          logFailureReason(failureContext, false)
          logError(err)
        } else if (hasErrorLog) {
          logFailureReason(failureContext, true, failOnWarning)
        } else {
          assert(false)
        }
        Logs.logErrors(failOnWarning)
        Logs.flushLogs()
        await abort()
        return
      }
    }
    Logs.clearLogs()
  }

  await clean()

  // Handle case that an error occured during `testInfo.terminateServer()`
  if (Logs.hasErrorLogs(true)) {
    /* TODO: implement more precise workaround
    if (isWindows()) {
      // On Windows, the sever sometimes terminates with an exit code of `1`. I don't know why.
      Logs.clearLogs()
    } else {
    */
    const failOnWarning = false
    logFailureReason('during server termination', true, failOnWarning)
    Logs.logErrors(failOnWarning)
    Logs.flushLogs()
    await abort()
    return
  }

  logResult(true)
}

function runTest(testFn: Function, testFunctionTimeout: number): Promise<undefined | unknown> {
  let resolve!: () => void
  let reject!: (err: unknown) => void
  const promise = new Promise<void>((resolve_, reject_) => {
    resolve = resolve_
    reject = reject_
  })

  const timeout = setTimeout(() => {
    reject(new Error(`[test] Timeout after ${humanizeTime(testFunctionTimeout)}`))
  }, testFunctionTimeout)

  const ret: unknown = testFn()
  ;(async () => {
    try {
      await ret
      resolve()
    } catch (err) {
      reject(err)
    } finally {
      clearTimeout(timeout)
    }
  })()

  return promise
}

function logResult(success: boolean) {
  const testInfo = getCurrentTest()
  const { PASS, FAIL, WARN } = getStatusTags()
  if (success) {
    assert(!testInfo.skipped)
    console.log(`${PASS} ${testInfo.testFile}`)
    return
  }
  if (testInfo.skipped) {
    console.log(`${WARN} ${testInfo.testFile} (${testInfo.skipped})`)
  } else {
    console.log(`${FAIL} ${testInfo.testFile}`)
  }
}

function logFailureReason(
  context: `during ${string}` | `while ${string}`,
  isErrorLog: boolean,
  failOnWarning?: boolean
) {
  const { FAIL } = getStatusTags()
  const color = (s: string) => pc.red(pc.bold(s))
  assert(
    (isErrorLog === false && failOnWarning === undefined) ||
      (isErrorLog === true && (failOnWarning === true || failOnWarning === false))
  )
  const errType = isErrorLog ? 'error' : !failOnWarning ? 'error(s)' : 'error(s)/warning(s)'
  const msg = `Test ${FAIL} because encountered ${errType} ${context}, see below.`
  console.log(color(msg))
}

function logError(err: unknown) {
  logSection('ERROR')
  console.log(err)
}

function getStatusTags() {
  const PASS = pc.bold(pc.bgGreen('PASS'))
  const FAIL = pc.bold(pc.bgRed('FAIL'))
  const WARN = pc.bold(pc.bgYellow('WARN'))
  return { PASS, FAIL, WARN }
}

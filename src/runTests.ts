export { runTests }

import type { Browser } from 'playwright-chromium'
import { getCurrentTest } from './getCurrentTest'
import { Logs } from './Logs'
import { assert, assertUsage, humanizeTime, isTTY, logProgress, isWindows } from './utils'
import pc from 'picocolors'
import { abortIfGitHubAction } from './github-action'

async function runTests(browser: Browser) {
  const testInfo = getCurrentTest()

  if (isTTY) {
    console.log()
    console.log(testInfo.testFile)
  }

  const page = await browser.newPage()
  testInfo.page = page

  // Set when user calls `skip()`
  if (testInfo.skipped) {
    logTestsResult(false)
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

  // TODO: resolve a success flag instead rejecting
  try {
    await testInfo.startServer()
  } catch (err) {
    logTestsResult(false)
    console.log(err)
    Logs.flushLogs()
    abortIfGitHubAction()
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

    const { doNotFailOnWarning } = testInfo.runInfo
    const hasErrorLog = Logs.hasErrorLogs(!doNotFailOnWarning)
    const isFailure = err || hasErrorLog
    if (isFailure) {
      logTestsResult(false)
      if (err) {
        console.log(err)
      } else if (hasErrorLog) {
        logIsFailure(false, !doNotFailOnWarning)
      } else {
        assert(false)
      }
      Logs.flushLogs()
      abortIfGitHubAction()
    } else {
      Logs.clearLogs()
    }
  }

  await testInfo.terminateServer()
  await page.close()
  // Handle case that an error occured during `terminateServer()`
  if (Logs.hasErrorLogs(true)) {
    /* TODO: implement more precise workaround
    if (isWindows()) {
      // On Windows, the sever sometimes terminates with an exit code of `1`. I don't know why.
      Logs.clearLogs()
    } else {
    */
    {
      logIsFailure(true, false)
      Logs.flushLogs()
      abortIfGitHubAction()
    }
  }

  logTestsResult(true)
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

function logTestsResult(success: boolean) {
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

function logIsFailure(isTermination: boolean, failOnWarning: boolean) {
  const { FAIL } = getStatusTags()
  console.log(
    pc.red(
      pc.bold(
        [
          `Test ${FAIL} because encountered error(s)`,
          !failOnWarning ? '' : ' and/or warning(s)',
          !isTermination ? '' : ' during termination',
          ', see logs below.',
        ].join('')
      )
    )
  )
  console.log(pc.bold('vvvv FAIL LOG(S) vvvv'))
  Logs.logErrors(failOnWarning)
}

function getStatusTags() {
  const PASS = pc.bold(pc.bgGreen('PASS'))
  const FAIL = pc.bold(pc.bgRed('FAIL'))
  const WARN = pc.bold(pc.bgYellow('WARN'))
  return { PASS, FAIL, WARN }
}

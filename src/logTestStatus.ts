export { logPass }
export { logWarn }
export { logFail }
export { logBoot }
export { hasFail }

import { getCurrentTest } from './getCurrentTest'
import { assert, isTTY } from './utils'
import pc from '@brillout/picocolors'

function logPass() {
  logStatus(false)
}
function logWarn(warning: string) {
  logStatus(false, warning)
}
function logFail(reason: string, isFinalAttempt: boolean) {
  if (isFinalAttempt) {
    logStatus(true)
  } else {
    logStatus(false, "Failed but marked as `isFlaky`; it'll be re-tried at the end.")
  }
  const { FAIL } = getStatusTags()
  const color = (s: string) => pc.red(pc.bold(s))
  const msg = `Test ${isFinalAttempt ? FAIL : 'failed'} because ${reason}, see below. [TEST_FAILURE]`
  console.log(color(msg))
}
function logStatus(isFail: boolean, warning?: string) {
  const { testFile } = getCurrentTest()
  const { PASS, FAIL, WARN } = getStatusTags()
  if (warning) {
    assert(!isFail)
    console.log(`${WARN} ${testFile} (${warning})`)
  } else if (isFail) {
    hasFailLog = true
    console.log(`${FAIL} ${testFile}`)
  } else {
    console.log(`${PASS} ${testFile}`)
  }
}
function getStatusTags() {
  const PASS = pc.bold(pc.white(pc.bgGreen(' PASS ')))
  const FAIL = pc.bold(pc.white(pc.bgRed(' FAIL ')))
  const WARN = pc.bold(pc.white(pc.bgYellow(' WARN ')))
  const BOOT = pc.bold(pc.white(pc.bgBlack(' BOOT ')))
  return { PASS, FAIL, WARN, BOOT }
}

function logBoot() {
  if (!isTTY) return
  const { testFile } = getCurrentTest()
  const { BOOT } = getStatusTags()
  console.log()
  console.log(`${BOOT} ${testFile}`)
}

let hasFailLog = false
function hasFail(): boolean {
  return hasFailLog
}

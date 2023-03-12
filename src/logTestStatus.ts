export { logPass }
export { logWarn }
export { logFail }
export { hasTestFail }

import { assert } from 'chai'
import pc from 'picocolors'
import { getCurrentTest } from './getCurrentTest'

function logPass() {
  logStatus(true)
}
function logWarn(warning: string) {
  logStatus(false, warning)
}
function logFail(reason: string) {
  hasFail = true
  logStatus(false)
  const { FAIL } = getStatusTags()
  const color = (s: string) => pc.red(pc.bold(s))
  const msg = `Test ${FAIL} because ${reason}, see below.`
  console.log(color(msg))
}
function logStatus(success: boolean, warning?: string) {
  const { testFile } = getCurrentTest()
  const { PASS, FAIL, WARN } = getStatusTags()
  if (success) {
    assert(!warning)
    console.log(`${PASS} ${testFile}`)
  } else if (warning) {
    console.log(`${WARN} ${testFile} (${warning})`)
  } else {
    console.log(`${FAIL} ${testFile}`)
  }
}
function getStatusTags() {
  const PASS = pc.bold(pc.white(pc.bgGreen(' PASS ')))
  const FAIL = pc.bold(pc.white(pc.bgRed(' FAIL ')))
  const WARN = pc.bold(pc.white(pc.bgYellow(' WARN ')))
  return { PASS, FAIL, WARN }
}

let hasFail = false
function hasTestFail(): boolean {
  return hasFail
}

export { logProgress }

import { getTestInfo } from './getTestInfo'
import { isTTY } from './utils'

const iconSuccess = '🟢'
const iconPending = '🟠'
const iconFail = '🔴'

function logProgress(text: string, isSetup?: true) {
  const prefix = getPrefix(isSetup)
  if (isTTY) {
    process.stdout.write(`${prefix}${iconPending} ${text}`)
  }
  let alreadyDone = false
  const done = (failed?: boolean) => {
    if (alreadyDone) return
    alreadyDone = true
    if (isTTY) {
      clear()
    }
    const iconDone = failed ? iconFail : iconSuccess
    process.stdout.write(`${prefix}${iconDone} ${text}\n`)
  }
  return done
}

function getPrefix(isSetup?: true) {
  if (isSetup) {
    return ''
  }
  if (!getTestInfo()) {
    return ''
  }
  return ' | '
}

function clear() {
  // @ts-ignore
  process.stdout.clearLine()
  process.stdout.cursorTo(0)
}

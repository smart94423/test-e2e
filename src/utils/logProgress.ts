export { logProgress }
export { ensureNewTerminalLine }

import { isTTY } from './isTTY'

const iconSuccess = '🟢'
const iconPending = '🟠'
const iconFail = '🔴'

let terminalLineIsEmtpy = true

function logProgress(text: string) {
  if (!isTTY) {
    const done = () => {}
    return done
  }
  process.stdout.write(`${iconPending} ${text}`)
  terminalLineIsEmtpy = false
  let alreadyDone = false
  const done = (failed?: boolean) => {
    if (alreadyDone) return
    alreadyDone = true
    clear()
    const iconDone = failed ? iconFail : iconSuccess
    process.stdout.write(`${iconDone} ${text}\n`)
    terminalLineIsEmtpy = true
  }
  return done
}

function ensureNewTerminalLine() {
  const val = terminalLineIsEmtpy
  terminalLineIsEmtpy = true
  return val
}

function clear() {
  // @ts-ignore
  process.stdout.clearLine()
  process.stdout.cursorTo(0)
}

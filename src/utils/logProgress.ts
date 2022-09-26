export { logProgress }

import { isTTY } from './isTTY'

const iconSuccess = '🟢'
const iconPending = '🟠'
const iconFail = '🔴'

function logProgress(text: string) {
  if (!isTTY) {
    const done = () => {}
    return done
  }
  process.stdout.write(`${iconPending} ${text}`)
  let alreadyDone = false
  const done = (failed?: boolean) => {
    if (alreadyDone) return
    alreadyDone = true
    clear()
    const iconDone = failed ? iconFail : iconSuccess
    process.stdout.write(`${iconDone} ${text}\n`)
  }
  return done
}

function clear() {
  // @ts-ignore
  process.stdout.clearLine()
  process.stdout.cursorTo(0)
}

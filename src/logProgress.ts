export { logProgress }

const iconPending = '🟠'
const iconDone = '🟢'
const iconFail = '🔴'

function logProgress(text: string) {
  process.stdout.write(iconPending + ' ' + text)
  return (failed?: true) => {
    clear()
    const icon = failed ? iconFail : iconDone
    process.stdout.write(icon + ' ' + text + '\n')
  }
}

function clear() {
  // @ts-ignore
  process.stdout.clearLine()
  process.stdout.cursorTo(0)
}

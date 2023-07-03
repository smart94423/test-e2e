export { runCommandShortLived }

import { exec } from 'child_process'
import { genPromise } from './genPromise'
import { humanizeTime } from './humanizeTime'

function runCommandShortLived(
  cmd: string,
  {
    swallowError = false,
    timeout = 5000,
    cwd = process.cwd(),
  }: { swallowError?: boolean; timeout?: number; cwd?: string } = {}
): Promise<string> {
  const { promise, resolve, reject } = genPromise<string>()

  const t = setTimeout(() => {
    console.error(`Command call \`${cmd}\` (${cwd}) timed out after ${humanizeTime(timeout)}`)
    reject()
  }, timeout)

  const options = { cwd }
  exec(cmd, options, (err, stdout, stderr) => {
    clearTimeout(t)
    if (err || stderr) {
      if (swallowError) {
        resolve('SWALLOWED_ERROR')
      } else {
        if (stdout) {
          console.log(stdout)
        }
        if (stderr) {
          console.error(stderr)
        }
        if (err) {
          console.error(err)
        }
        throw new Error(`Command \`${cmd}\` failed [cwd: ${cwd}]`)
      }
    } else {
      resolve(stdout)
    }
  })

  return promise
}

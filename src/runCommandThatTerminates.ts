export { runCommandThatTerminates }

import { getCwd, setRunInfo } from './getCurrentTest'
import { runCommand } from './utils'

function runCommandThatTerminates(cmd: string, { timeout = 2 * 60 * 1000 }: { timeout?: number } = {}) {
  setRunInfo({ cmd })
  const cwd = getCwd()
  runCommand(cmd, { timeout, cwd })
}

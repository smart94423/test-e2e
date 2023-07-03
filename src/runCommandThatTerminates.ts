export { runCommandThatTerminates }

import { getCwd } from './getCurrentTest'
import { runCommand } from './utils'

function runCommandThatTerminates(cmd: string, { timeout = 2 * 60 * 1000 }: { timeout?: number } = {}) {
  const cwd = getCwd()
  runCommand(cmd, { timeout, cwd })
}

export { runCommandThatTerminates }

import { getCurrentTest } from './getCurrentTest'
import { assert, runCommand } from './utils'

function runCommandThatTerminates(cmd: string, { timeout = 2 * 60 * 1000 }: { timeout?: number } = {}) {
  const runInfo = getRunInfo()
  const { cwd } = runInfo
  runCommand(cmd, { timeout, cwd })
}

function getRunInfo() {
  const testInfo = getCurrentTest()
  assert(testInfo.runInfo)
  return testInfo.runInfo
}

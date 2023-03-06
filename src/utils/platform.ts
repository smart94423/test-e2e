export { isCI }
export { isLinux }
export { isWindows }
export { isMac }

import { assert } from './assert'

function isWindows() {
  return process.platform === 'win32'
}
function isLinux() {
  return process.platform === 'linux'
}
function isMac() {
  if (process.platform === 'darwin') {
    return true
  }
  assert(isLinux() || isWindows())
  return false
}
function isCI() {
  return !!process.env.CI
}

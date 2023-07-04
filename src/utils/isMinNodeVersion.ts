export { isMinNodeVersion }

import { assert } from './assert'

function isMinNodeVersion(minNodeVersion: 14) {
  const { version } = process
  assert(version.startsWith('v'))
  const major = parseInt(version[1] + version[2], 10)
  assert(12 <= major && major <= 50)
  return major >= minNodeVersion
}

export { skip }

import { getCurrentTest } from './getCurrentTest'

function skip(reason: string) {
  const testInfo = getCurrentTest()
  testInfo.skipped = { reason }
}

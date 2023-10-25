export { logSection }

import pc from '@brillout/picocolors'

function logSection(sectionTitle: string) {
  const title = `vvvvvv ${sectionTitle} vvvvvv`
  const width = title.length
  console.log(pc.bold('v'.repeat(width)))
  console.log(pc.bold(title))
  console.log(pc.bold('v'.repeat(width)))
}

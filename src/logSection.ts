export { logSection }

import pc from 'picocolors'

function logSection(sectionTitle: string) {
  console.log(pc.bold(`vvvvvv ${sectionTitle} vvvvvv`))
}

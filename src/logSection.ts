export { logSection }

import pc from 'picocolors'

function logSection(sectionTitle: string) {
  console.log()
  console.log()
  console.log()
  console.log(pc.bold(`vvvvvv ${sectionTitle} vvvvvv`))
}

export { logSection }

import pc from 'picocolors'

function logSection(sectionTitle: string) {
  const title = `------ ${sectionTitle} ------`
  const width = title.length
  console.log(pc.bold('='.repeat(width)))
  console.log(pc.bold(title))
  console.log(pc.bold('v'.repeat(width)))
}

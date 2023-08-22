export { prepare }
export { check }
export { validate }

let optionList: string[]
const optionsKnown: string[] = []

function prepare() {
  optionList = process.argv.filter((w) => w.startsWith('--'))
}

function check(option: string): boolean {
  optionsKnown.push(option)
  const val = optionList.includes(option)
  if (val) optionList = optionList.filter((s) => s !== option)
  return val
}

function validate() {
  if (optionList.length > 0) {
    throw new Error(
      [
        // prettier-ignore
        `unknown options: ${optionList.join(' ')}`,
        `known options: ${optionsKnown.join(' ')}`,
      ].join('\n')
    )
  }
}

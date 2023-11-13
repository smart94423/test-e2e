export { fsWindowsBugWorkaround }
export { fsWindowsBugWorkaroundPrefix }

const fsWindowsBugWorkaroundPrefix = 'file://'

// https://stackoverflow.com/questions/69665780/error-err-unsupported-esm-url-scheme-only-file-and-data-urls-are-supported-by/70057245#70057245
function fsWindowsBugWorkaround(testFileJs: string): string {
  return `${fsWindowsBugWorkaroundPrefix}${testFileJs}`
}

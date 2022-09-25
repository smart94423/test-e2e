export function humanizeTime(milliseconds: number) {
  const seconds = milliseconds / 1000
  if (seconds < 120) {
    return `${round(seconds)} seconds`
  }
  const minutes = seconds / 60
  return `${round(minutes)} minutes`
}

function round(n: number) {
  return n.toFixed(1)
}

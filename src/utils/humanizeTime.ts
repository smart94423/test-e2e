export function humanizeTime(milliseconds: number) {
  const seconds = milliseconds / 1000
  if( seconds < 120 ) {
    return `${seconds} seconds`
  }
  const minutes = seconds / 60
  return `${minutes} minutes`
}

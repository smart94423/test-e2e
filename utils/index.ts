export * from './sleep'
export * from './runCommand'

export function getTestFilePath() {
  const { testPath } = expect.getState()
  return testPath
}

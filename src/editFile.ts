export { editFile }
export { editFileRevert }
export { editFileAssertReverted }

import fs from 'fs'
import path from 'path'
import { assert } from './utils'
import { getCurrentTest } from './getCurrentTest'

const filesContentOriginal: Record<string, string> = {}

function editFile(filePathRelative: string, replacer: (fileContent: string) => string) {
  const filePath = getFilePath(filePathRelative)
  const fileContent = fs.readFileSync(filePath, 'utf8')
  if (!(filePath in filesContentOriginal)) {
    filesContentOriginal[filePath] = fileContent
  }
  const fileContentNew = replacer(fileContent)
  // expect(fileContentNew).not.toBe(fileContent)
  assert(fileContentNew !== fileContent)
  fs.writeFileSync(filePath, fileContentNew)
}

function editFileRevert() {
  Object.entries(filesContentOriginal).forEach(([filePath, fileContent]) => {
    fs.writeFileSync(filePath, fileContent)
    delete filesContentOriginal[filePath]
  })
}

function editFileAssertReverted() {
  const filesDirty = Object.keys(filesContentOriginal)
  try {
    // expect(filesDirty).toEqual([])
    assert(filesDirty.length === 0)
  } catch (err) {
    editFileRevert()
    throw err
  }
  assert(filesDirty.length === 0)
}

function getFilePath(filePathRelative: string) {
  const { testFile } = getCurrentTest()
  const cwd = path.dirname(testFile)
  const filePath = require.resolve(filePathRelative, { paths: [cwd] })
  return filePath
}

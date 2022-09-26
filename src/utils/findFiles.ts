export { findFiles }
export type { FindFilter }

import glob from 'fast-glob'
import path from 'path'
import { runCommand } from './runCommand'

type FindFilter = {
  terms: string[]
  exclude: boolean
}

const cwd = process.cwd()
let gitFiles: string[]

async function findFiles(pattern: string, findFilter: null | FindFilter) {
  let files = (await glob([pattern], { ignore: ['**/node_modules/**', '**/.git/**'], cwd, dot: true }))
    .filter((filePathRelative) => applyFilter(filePathRelative, findFilter))
    .map((filePathRelative) => path.join(cwd, filePathRelative))
  files = await filterGitIgnoredFiles(files)
  return files
}

async function filterGitIgnoredFiles(files: string[]): Promise<string[]> {
  if (!gitFiles) {
    const stdout1 = await runCommand('git ls-files', { cwd })
    // Also include untracked files.
    //  - In other words, we remove git ignored files. (Staged files are tracked and listed by `$ git ls-files`.)
    //  - `git ls-files --others --exclude-standard` from https://stackoverflow.com/questions/3801321/git-list-only-untracked-files-also-custom-commands/3801554#3801554
    const stdout2 = await runCommand('git ls-files --others --exclude-standard', { cwd })
    gitFiles = [...stdout1.split('\n'), ...stdout2.split('\n')].map((filePathRelative) =>
      path.join(cwd, filePathRelative),
    )
  }
  const filesFiltered = files.filter((file) => gitFiles.includes(file))
  return filesFiltered
}

function applyFilter(filePathRelative: string, findFilter: null | FindFilter) {
  if (!findFilter) {
    return true
  }
  const { terms, exclude } = findFilter
  for (const term of terms) {
    if (!filePathRelative.includes(term) && !exclude) {
      return false
    }
    if (filePathRelative.includes(term) && exclude) {
      return false
    }
  }
  return true
}

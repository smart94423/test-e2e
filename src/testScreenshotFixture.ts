export { testScreenshotFixture }

// Reference implementation: https://playwright.dev/docs/test-snapshots

import pixelmatch from 'pixelmatch'
import { PNG, type PNGWithMetadata } from 'pngjs'
import fs from 'fs'
import path from 'path'
import { assert, sleep } from './utils'
import { getCurrentTest } from './getCurrentTest'
import { expect } from './chai/expect'

async function testScreenshotFixture(): Promise<void> {
  const { pngFixturPath, pngExpectPath, pngActualPath, pngDifferPath } = getPngPaths()
  if (!fs.existsSync(pngFixturPath)) {
    const pngActual = await takeScreenshot()
    const fileContent = PNG.sync.write(pngActual)
    fs.writeFileSync(pngFixturPath, fileContent)
    fs.writeFileSync(pngExpectPath, fileContent)
    throw new Error(
      [
        'Screenshot fixture missing. Screenshot fixture created at following paths:',
        ` - ${pngFixturPath}`,
        ` - ${pngExpectPath}`,
      ].join('\n')
    )
  }
  const pngExpect = PNG.sync.read(fs.readFileSync(pngFixturPath))
  const pngActual = await takeScreenshot()
  expect(pngExpect.width).toBe(pngActual.width)
  expect(pngExpect.height).toBe(pngActual.height)
  const { width, height } = pngExpect
  const pngDiffer = new PNG({ width, height })
  const numDiffPixels = pixelmatch(pngExpect.data, pngActual.data, pngDiffer.data, width, height, { threshold: 0.1 })
  try {
    expect(numDiffPixels).toBe(0)
  } catch (err) {
    {
      console.log('Actual image written at', pngActualPath)
      fs.writeFileSync(pngActualPath, PNG.sync.write(pngActual))
    }
    {
      console.log('Expect image written at', pngExpectPath)
      fs.writeFileSync(pngExpectPath, PNG.sync.write(pngExpect))
    }
    {
      console.log('Differ image written at', pngDifferPath)
      fs.writeFileSync(pngDifferPath, PNG.sync.write(pngDiffer))
    }
    throw err
  }
}

async function takeScreenshot(): Promise<PNGWithMetadata> {
  const { page } = getCurrentTest()
  assert(page)
  let screenshotCurr: undefined | PNGWithMetadata
  let screenshotPrev: undefined | PNGWithMetadata
  let attemps = 15
  while (attemps-- > 0) {
    screenshotPrev = screenshotCurr
    screenshotCurr = PNG.sync.read(await page.screenshot())
    if (screenshotPrev) {
      const { width, height } = screenshotCurr
      const numDiffPixels = pixelmatch(screenshotPrev.data, screenshotCurr.data, null, width, height, {
        threshold: 0,
      })
      if (numDiffPixels === 0) {
        return screenshotCurr
      }
    }
    await sleep(1000)
  }
  throw new Error("Couldn't take a stable screenshot. The UI seems to be continously changing.")
}

function getPngPaths() {
  const cwd = getTestFileDir()
  const pngFixturPath = path.join(cwd, './.test-screenshot-fixture.png')
  const pngExpectPath = path.join(cwd, './test-screenshot-expect.png')
  const pngActualPath = path.join(cwd, './test-screenshot-actual.png')
  const pngDifferPath = path.join(cwd, './test-screenshot-differ.png')

  return { pngFixturPath, pngExpectPath, pngActualPath, pngDifferPath }
}

function getTestFileDir(): string {
  const { testFile, runInfo } = getCurrentTest()
  const cwd = path.dirname(testFile)
  assert(runInfo!.cwd === cwd)
  return cwd
}

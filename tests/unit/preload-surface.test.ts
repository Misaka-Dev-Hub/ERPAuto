import { describe, expect, it } from 'vitest'
import fs from 'fs'
import path from 'path'

describe('Preload API Surface', () => {
  it('does not expose ipcRenderer in window typings', () => {
    const dtsPath = path.resolve(process.cwd(), 'src/preload/index.d.ts')
    const content = fs.readFileSync(dtsPath, 'utf-8')
    expect(content.includes('ipcRenderer:')).toBe(false)
  })
})

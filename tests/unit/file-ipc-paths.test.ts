import { describe, expect, it } from 'vitest'
import path from 'path'
import { isPathWithinAllowedRoots } from '../../src/main/ipc/file-handler'

describe('File IPC Path Guard', () => {
  it('accepts path under allowed root', () => {
    const root = path.resolve('C:/safe/root')
    const file = path.join(root, 'nested', 'file.txt')
    expect(isPathWithinAllowedRoots(file, [root])).toBe(true)
  })

  it('rejects path outside allowed roots', () => {
    const root = path.resolve('C:/safe/root')
    const outside = path.resolve('C:/other/location/file.txt')
    expect(isPathWithinAllowedRoots(outside, [root])).toBe(false)
  })
})

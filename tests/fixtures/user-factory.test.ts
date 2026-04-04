/**
 * UserFactory Unit Tests
 */

import { describe, it, expect } from 'vitest'
import { UserFactory } from './factory'

describe('UserFactory', () => {
  it('creates user with default role', () => {
    const user = UserFactory.createUser()

    expect(user.username).toMatch(/^test_user_\d+$/)
    expect(user.userType).toBe('User')
    expect(user.permissions).toEqual(['read', 'write'])
    expect(user.id).toMatch(/^USR-\d+-[a-z0-9]+$/)
  })

  it('creates admin with correct permissions', () => {
    const admin = UserFactory.createAdmin()

    expect(admin.userType).toBe('Admin')
    expect(admin.permissions).toEqual(['read', 'write', 'delete', 'admin'])
    expect(admin.id).toMatch(/^USR-\d+-[a-z0-9]+$/)
  })

  it('generates unique IDs', () => {
    const id1 = UserFactory.createAdmin().id
    const id2 = UserFactory.createUser().id
    const id3 = UserFactory.createGuest().id

    expect(id1).not.toBe(id2)
    expect(id2).not.toBe(id3)
    expect(id1).not.toBe(id3)
  })
})

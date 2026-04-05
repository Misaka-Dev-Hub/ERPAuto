/**
 * UserFactory Unit Tests
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { UserFactory } from './factory'

describe('UserFactory', () => {
  beforeEach(() => {
    // Reset ID counter to ensure test isolation
    ;(UserFactory as any).idCounter = 0
  })

  it('creates user with default role', () => {
    const user = UserFactory.createUser()

    expect(user.username).toMatch(/^test_user_\d+$/)
    expect(user.userType).toBe('User')
    expect(user.permissions).toEqual(['read', 'write'])
    expect(user.id).toBeTypeOf('number')
  })

  it('creates admin with correct permissions', () => {
    const admin = UserFactory.createAdmin()

    expect(admin.userType).toBe('Admin')
    expect(admin.permissions).toEqual(['read', 'write', 'delete', 'admin'])
    expect(admin.id).toBeTypeOf('number')
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

/**
 * ConfigFactory and DatabaseFactory Unit Tests
 */

import { describe, it, expect } from 'vitest'
import { ConfigFactory, DatabaseFactory } from './factory'

describe('ConfigFactory', () => {
  it('creates ERP config with default values', () => {
    const config = ConfigFactory.createErpConfig()

    expect(config.url).toBe('https://test-erp.example.com')
    expect(config.username).toBe('test_user')
    expect(config.password).toBe('test_password')
  })

  it('applies overrides to ERP config', () => {
    const config = ConfigFactory.createErpConfig({
      url: 'https://custom-erp.example.com',
      username: 'admin',
      password: 'secret123'
    })

    expect(config.url).toBe('https://custom-erp.example.com')
    expect(config.username).toBe('admin')
    expect(config.password).toBe('secret123')
  })
})

describe('DatabaseFactory', () => {
  it('creates MySQL config with default values', () => {
    const config = DatabaseFactory.createDatabaseConfig('mysql')

    expect(config.type).toBe('mysql')
    expect(config.host).toBe('localhost')
    expect(config.port).toBe(3306)
    expect(config.database).toBe('test_db')
    expect(config.username).toBe('test_user')
    expect(config.password).toBe('test_password')
  })

  it('creates SQL Server config with correct port', () => {
    const config = DatabaseFactory.createDatabaseConfig('sqlserver')

    expect(config.type).toBe('sqlserver')
    expect(config.host).toBe('localhost')
    expect(config.port).toBe(1433)
    expect(config.database).toBe('test_db')
    expect(config.username).toBe('test_user')
    expect(config.password).toBe('test_password')
  })

  it('applies overrides to database config', () => {
    const config = DatabaseFactory.createDatabaseConfig('mysql', {
      host: '192.168.1.100',
      port: 3307,
      database: 'production_db',
      username: 'prod_user',
      password: 'prod_password'
    })

    expect(config.type).toBe('mysql')
    expect(config.host).toBe('192.168.1.100')
    expect(config.port).toBe(3307)
    expect(config.database).toBe('production_db')
    expect(config.username).toBe('prod_user')
    expect(config.password).toBe('prod_password')
  })
})

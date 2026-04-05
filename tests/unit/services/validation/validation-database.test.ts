import { describe, it, expect, beforeEach, vi } from 'vitest'

// Capture construction params and connect calls for each DB adapter
let lastMysqlOpts: any = null
let mysqlConnectCalled = false
let lastSqlServerOpts: any = null
let sqlServerConnectCalled = false
let lastPgOpts: any = null
let pgConnectCalled = false

let currentDbType: string = 'mysql'
const currentDbConfig: any = {
  database: {
    mysql: { host: 'db', port: 3306, username: 'user', password: 'pass', database: 'erp' },
    sqlserver: {
      server: 'srv',
      port: 1433,
      username: 'user',
      password: 'pass',
      database: 'erp',
      trustServerCertificate: true
    },
    postgresql: {
      host: 'localhost',
      port: 5432,
      username: 'user',
      password: 'pass',
      database: 'erp'
    }
  }
}

// mysql mock
vi.doMock('../../../../src/main/services/database/mysql', () => {
  return {
    MySqlService: class {
      constructor(opts: any) {
        lastMysqlOpts = opts
      }
      connect = vi.fn().mockImplementation(function () {
        mysqlConnectCalled = true
        return Promise.resolve(undefined)
      })
    }
  }
})

// sqlserver mock
vi.doMock('../../../../src/main/services/database/sql-server', () => {
  return {
    SqlServerService: class {
      constructor(opts: any) {
        lastSqlServerOpts = opts
      }
      connect = vi.fn().mockImplementation(function () {
        sqlServerConnectCalled = true
        return Promise.resolve(undefined)
      })
    }
  }
})

// postgresql mock
vi.doMock('../../../../src/main/services/database/postgresql', () => {
  return {
    PostgreSqlService: class {
      constructor(opts: any) {
        lastPgOpts = opts
      }
      connect = vi.fn().mockImplementation(function () {
        pgConnectCalled = true
        return Promise.resolve(undefined)
      })
    }
  }
})

// Config mock to drive database type
vi.doMock('../../../../src/main/services/config/config-manager', () => {
  return {
    ConfigManager: {
      getInstance: () => ({
        getDatabaseType: () => currentDbType,
        getConfig: () => currentDbConfig
      })
    }
  }
})

describe('ValidationDatabaseService', () => {
  beforeEach(() => {
    lastMysqlOpts = null
    mysqlConnectCalled = false
    lastSqlServerOpts = null
    sqlServerConnectCalled = false
    lastPgOpts = null
    pgConnectCalled = false
  })

  describe('createValidationDatabaseService', () => {
    it('creates mysql service with correct config and connects', async () => {
      currentDbType = 'mysql'
      const mod = await import('../../../../src/main/services/validation/validation-database')
      const svc = await mod.createValidationDatabaseService()
      expect(svc).toBeDefined()
      expect(lastMysqlOpts.host).toBe('db')
      expect(mysqlConnectCalled).toBe(true)
    })

    it('creates sqlserver service when dbType is sqlserver', async () => {
      currentDbType = 'sqlserver'
      const mod = await import('../../../../src/main/services/validation/validation-database')
      const svc = await mod.createValidationDatabaseService()
      expect(lastSqlServerOpts.server).toBe('srv')
      expect(sqlServerConnectCalled).toBe(true)
    })

    it('creates postgresql service when dbType is postgresql', async () => {
      currentDbType = 'postgresql'
      const mod = await import('../../../../src/main/services/validation/validation-database')
      const svc = await mod.createValidationDatabaseService()
      expect(lastPgOpts.host).toBe('localhost')
      expect(pgConnectCalled).toBe(true)
    })
  })

  describe('getValidationTableName', () => {
    it('returns table name unchanged for mysql', async () => {
      currentDbType = 'mysql'
      const mod = await import('../../../../src/main/services/validation/validation-database')
      expect(mod.getValidationTableName('MaterialsToBeDeleted')).toBe('MaterialsToBeDeleted')
    })

    it('converts schema_table to [schema].[table] for sqlserver', async () => {
      currentDbType = 'sqlserver'
      const mod = await import('../../../../src/main/services/validation/validation-database')
      expect(mod.getValidationTableName('dbo_Materials')).toBe('[dbo].[Materials]')
    })

    it('wraps nameless table in [dbo].[name] for sqlserver', async () => {
      currentDbType = 'sqlserver'
      const mod = await import('../../../../src/main/services/validation/validation-database')
      expect(mod.getValidationTableName('Materials')).toBe('[dbo].[Materials]')
    })

    it('converts schema_table to "schema"."table" for postgresql', async () => {
      currentDbType = 'postgresql'
      const mod = await import('../../../../src/main/services/validation/validation-database')
      expect(mod.getValidationTableName('public_Materials')).toBe('"public"."Materials"')
    })

    it('wraps nameless table in "public"."name" for postgresql', async () => {
      currentDbType = 'postgresql'
      const mod = await import('../../../../src/main/services/validation/validation-database')
      expect(mod.getValidationTableName('Materials')).toBe('"public"."Materials"')
    })
  })
})

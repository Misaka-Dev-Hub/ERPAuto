/**
 * SQL Dialect Factory
 *
 * Creates the appropriate SqlDialect implementation based on database type.
 */

import type { DatabaseType } from '@types/database.types'
import type { SqlDialect } from '@types/sql-dialect.types'

import { MySqlDialect } from './mysql-dialect'
import { PostgreSqlDialect } from './postgresql-dialect'
import { SqlServerDialect } from './sqlserver-dialect'

export { MySqlDialect } from './mysql-dialect'
export { PostgreSqlDialect } from './postgresql-dialect'
export { SqlServerDialect } from './sqlserver-dialect'

export function createDialect(type: DatabaseType): SqlDialect {
  switch (type) {
    case 'sqlserver':
      return new SqlServerDialect()
    case 'postgresql':
      return new PostgreSqlDialect()
    default:
      return new MySqlDialect()
  }
}

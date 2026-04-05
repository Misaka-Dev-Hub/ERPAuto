/**
 * Test Fixtures Type Definitions
 *
 * Type definitions for test fixture factories and test data generation.
 * Reuses business types from src/main/types where possible.
 */

import type { UserInfo, UserSession } from '../../src/main/types/user.types'
import type { ErpConfig } from '../../src/main/types/erp.types'
import type {
  DatabaseConfig,
  MySqlConfig,
  SqlServerConfig
} from '../../src/main/types/database.types'
import type { FullConfig } from '../../src/main/types/config.schema'

/**
 * Material item in an order
 *
 * Represents a single material line item in production order data.
 */
export interface Material {
  /** Row index in the order table (1-based) */
  index: number
  /** Material code/identifier */
  code: string
  /** Material name/description */
  description: string
  /** Material specification */
  specification?: string | null
  /** Material model/type */
  model?: string | null
  /** Drawing number */
  drawingNumber?: string | null
  /** Material grade/quality */
  grade?: string | null
  /** Planned quantity */
  quantity: number
  /** Unit of measure */
  unit: string
  /** Required date */
  requiredDate: string
  /** Issuing warehouse */
  warehouse: string
  /** Unit usage amount */
  unitUsage: number
  /** Cumulative outbound quantity */
  outboundQuantity: number
}

/**
 * Production order interface
 *
 * Represents a complete production order with header info and material items.
 */
export interface Order {
  /** Order unique identifier */
  id: string
  /** Production order number */
  orderNumber: string
  /** Production ID (product code) */
  productionId: string
  /** Product name */
  productName: string
  /** Product specification */
  productSpec?: string | null
  /** Planned quantity for the order */
  plannedQuantity: number
  /** Unit of measure */
  unit: string
  /** Required delivery date */
  requiredDate: string
  /** Production department */
  department: string
  /** Materials in this order */
  items: Material[]
  /** Creator of the order */
  creator?: string | null
  /** Printer of the order */
  printer?: string | null
  /** Print date */
  printDate?: string | null
}

/**
 * User fixture for test data generation
 *
 * Simplified user data for creating test users.
 */
export interface TestUser {
  /** User ID (matches UserInfo.id: number) */
  id: number
  /** Username for login */
  username: string
  /** User type/role */
  userType: 'Admin' | 'User'
  /** User permissions (optional) */
  permissions?: string[]
  /** Create time (optional) */
  createTime?: Date
}

/**
 * ERP configuration for testing
 *
 * Test fixture configuration for ERP system connection.
 */
export interface TestErpConfig {
  /** ERP system URL */
  url: string
  /** ERP username */
  username: string
  /** ERP password */
  password: string
  /** Headless browser mode (optional) */
  headless?: boolean
}

/**
 * Database configuration for testing
 *
 * Simplified database configuration for test fixtures.
 */
export interface TestDatabaseConfig {
  /** Database type */
  type: 'mysql' | 'sqlserver'
  /** Database host/server */
  host: string
  /** Database port */
  port: number
  /** Database name */
  database: string
  /** Database username */
  username: string
  /** Database password */
  password: string
  /** Character set (MySQL only, optional) */
  charset?: string
  /** Driver (SQL Server only, optional) */
  driver?: string
  /** Trust server certificate (SQL Server only, optional) */
  trustServerCertificate?: boolean
}

/**
 * Complete test configuration
 *
 * Full application configuration for test environments.
 */
export interface TestConfig {
  /** ERP system configuration */
  erp: TestErpConfig
  /** Database configuration */
  database: TestDatabaseConfig
  /** Path configuration */
  paths: {
    /** Data directory path */
    dataDir: string
    /** Default output file path */
    defaultOutput: string
    /** Validation output file path */
    validationOutput: string
  }
}

/**
 * Excel file fixture metadata
 *
 * Information about generated Excel test fixtures.
 */
export interface ExcelFixture {
  /** File path */
  filePath: string
  /** Order number in the fixture */
  orderNumber: string
  /** Production ID in the fixture */
  productionId: string
  /** Number of material items */
  materialCount: number
  /** Whether the fixture has empty orders */
  hasEmptyOrders: boolean
}

/**
 * Test data factory options
 *
 * Options for customizing generated test data.
 */
export interface FactoryOptions {
  /** Number of materials to generate (default: 3) */
  materialCount?: number
  /** Include optional fields (default: true) */
  includeOptional?: boolean
  /** Generate empty orders (default: false) */
  emptyOrders?: boolean
  /** Custom order number (default: auto-generated) */
  orderNumber?: string
  /** Custom production ID (default: auto-generated) */
  seed?: number
}

/**
 * Validation result for test data
 *
 * Result of validating generated test data against expected schema.
 */
export interface ValidationResult {
  /** Whether validation passed */
  isValid: boolean
  /** Error messages if validation failed */
  errors: string[]
  /** Warning messages */
  warnings: string[]
}

// Re-export business types for convenience
export type {
  UserInfo,
  UserSession,
  ErpConfig,
  DatabaseConfig,
  MySqlConfig,
  SqlServerConfig,
  FullConfig
}

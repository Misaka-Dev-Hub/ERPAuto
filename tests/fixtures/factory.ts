/**
 * Test Fixture Factory
 *
 * Factory class for generating test data with consistent structure.
 */

import type { TestUser, Order, Material, TestErpConfig, TestDatabaseConfig } from './types'
import type { ExtractorResult, ImportResult } from '../../src/main/types/extractor.types'
import type { CleanerResult, OrderCleanDetail } from '../../src/main/types/cleaner.types'
import type { AuditEntry } from '../../src/main/types/audit.types'
import { AuditAction, AuditStatus } from '../../src/main/types/audit.types'
import type { UpdateRelease } from '../../src/main/types/update.types'
import type { ValidationResult } from '../../src/main/types/validation.types'
import { ValidationError, VALIDATION_ERROR_CODES } from '../../src/main/types/errors'

/**
 * User Factory - generates test user data
 *
 * Creates users with role-based permissions and unique IDs.
 */
export class UserFactory {
  /**
   * Create a user with specified role
   *
   * @param role - User role ('admin', 'user', or 'guest')
   * @param overrides - Optional field overrides
   * @returns Generated test user
   */
  static createUser(
    role: 'admin' | 'user' | 'guest' = 'user',
    overrides?: Partial<TestUser>
  ): TestUser {
    const user: TestUser = {
      id: UserFactory.generateId(),
      username: `test_${role}_${Date.now()}`,
      userType: UserFactory.getUserTypeFromRole(role),
      permissions: UserFactory.getPermissionsForRole(role),
      ...overrides
    }
    return user
  }

  /**
   * Create an admin user
   *
   * @param overrides - Optional field overrides
   * @returns Admin test user
   */
  static createAdmin(overrides?: Partial<TestUser>): TestUser {
    return UserFactory.createUser('admin', overrides)
  }

  /**
   * Create a regular user
   *
   * @param overrides - Optional field overrides
   * @returns Regular test user
   */
  static createUserDefault(overrides?: Partial<TestUser>): TestUser {
    return UserFactory.createUser('user', overrides)
  }

  /**
   * Create a guest user
   *
   * @param overrides - Optional field overrides
   * @returns Guest test user
   */
  static createGuest(overrides?: Partial<TestUser>): TestUser {
    return UserFactory.createUser('guest', overrides)
  }

  /**
   * Generate unique user ID
   *
   * @returns Unique numeric ID
   */
  private static idCounter = 0

  private static generateId(): number {
    return ++UserFactory.idCounter
  }

  /**
   * Get permissions for a role
   *
   * @param role - User role
   * @returns Array of permission strings
   */
  private static getPermissionsForRole(role: string): string[] {
    return (
      {
        admin: ['read', 'write', 'delete', 'admin'],
        user: ['read', 'write'],
        guest: ['read']
      }[role] || []
    )
  }

  /**
   * Convert role string to UserType
   *
   * @param role - Role string
   * @returns UserType ('Admin' or 'User')
   */
  private static getUserTypeFromRole(role: string): 'Admin' | 'User' {
    return role === 'admin' ? 'Admin' : 'User'
  }
}

/**
 * Order Factory
 *
 * Creates Order fixtures with auto-generated unique identifiers.
 */
export class OrderFactory {
  /**
   * Create a new Order fixture
   *
   * @param overrides - Optional overrides to customize the order
   * @returns A new Order instance
   *
   * @example
   * // Basic order with auto-generated values
   * const order = OrderFactory.createOrder()
   *
   * @example
   * // Order with custom order number
   * const order = OrderFactory.createOrder({ orderNumber: 'SC202501001' })
   *
   * @example
   * // Order with materials
   * const materials = [MaterialFactory.createMaterial()]
   * const order = OrderFactory.createOrder({ items: materials })
   */
  static createOrder(overrides?: Partial<Order>): Order {
    const timestamp = Date.now()
    return {
      id: `ORD-${timestamp}`,
      orderNumber: `SC${timestamp.toString().substr(-8)}`,
      productionId: `PROD-${timestamp}`,
      productName: 'Test Product',
      productSpec: null,
      plannedQuantity: 100,
      unit: '件',
      requiredDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      department: 'Test Department',
      items: [],
      creator: null,
      printer: null,
      printDate: null,
      ...overrides
    }
  }

  /**
   * Create multiple orders
   *
   * @param count - Number of orders to create
   * @param overrides - Optional overrides applied to all orders
   * @returns Array of Order instances
   */
  static createOrders(count: number, overrides?: Partial<Order>): Order[] {
    return Array.from({ length: count }, () => this.createOrder(overrides))
  }
}

/**
 * Material Factory
 *
 * Creates Material fixtures with auto-generated unique codes.
 */
export class MaterialFactory {
  /**
   * Create a new Material fixture
   *
   * @param overrides - Optional overrides to customize the material
   * @returns A new Material instance
   *
   * @example
   * // Basic material with auto-generated code
   * const material = MaterialFactory.createMaterial()
   *
   * @example
   * // Material with custom code
   * const material = MaterialFactory.createMaterial({ code: 'M001' })
   *
   * @example
   * // Material with specific quantity
   * const material = MaterialFactory.createMaterial({ quantity: 50, unit: 'kg' })
   */
  static createMaterial(overrides?: Partial<Material>): Material {
    const timestamp = Date.now()
    return {
      index: 1,
      code: `TEST_MAT_${Math.random().toString(36).substr(2, 6).toUpperCase()}`,
      description: 'Test Material',
      specification: null,
      model: null,
      drawingNumber: null,
      grade: null,
      quantity: 10,
      unit: '件',
      requiredDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      warehouse: 'Test Warehouse',
      unitUsage: 1.0,
      outboundQuantity: 0,
      ...overrides
    }
  }

  /**
   * Create multiple materials with unique codes
   *
   * @param count - Number of materials to create
   * @param overrides - Optional overrides applied to all materials
   * @returns Array of Material instances
   */
  static createMaterials(count: number, overrides?: Partial<Material>): Material[] {
    return Array.from({ length: count }, (_, index) => {
      const material = this.createMaterial(overrides)
      material.index = index + 1
      return material
    })
  }
}

/**
 * Config Factory
 *
 * Creates ERP configuration fixtures for testing.
 */
export class ConfigFactory {
  /**
   * Create an ERP configuration fixture
   *
   * @param overrides - Optional overrides to customize the configuration
   * @returns A new TestErpConfig instance
   *
   * @example
   * // Basic config with default values
   * const config = ConfigFactory.createErpConfig()
   *
   * @example
   * // Config with custom URL
   * const config = ConfigFactory.createErpConfig({ url: 'https://custom-erp.example.com' })
   *
   * @example
   * // Config with custom credentials
   * const config = ConfigFactory.createErpConfig({ username: 'admin', password: 'secret' })
   */
  static createErpConfig(overrides?: Partial<TestErpConfig>): TestErpConfig {
    return {
      url: 'https://test-erp.example.com',
      username: 'test_user',
      password: 'test_password',
      ...overrides
    }
  }
}

/**
 * Database Factory
 *
 * Creates database configuration fixtures for testing.
 */
export class DatabaseFactory {
  /**
   * Create a database configuration fixture
   *
   * @param type - Database type ('mysql' or 'sqlserver'), defaults to 'mysql'
   * @param overrides - Optional overrides to customize the configuration
   * @returns A new TestDatabaseConfig instance
   *
   * @example
   * // MySQL config with default values
   * const config = DatabaseFactory.createDatabaseConfig()
   *
   * @example
   * // SQL Server config
   * const config = DatabaseFactory.createDatabaseConfig('sqlserver')
   *
   * @example
   * // MySQL config with custom host
   * const config = DatabaseFactory.createDatabaseConfig('mysql', { host: '192.168.1.100' })
   */
  static createDatabaseConfig(
    type: 'mysql' | 'sqlserver' = 'mysql',
    overrides?: Partial<TestDatabaseConfig>
  ): TestDatabaseConfig {
    return {
      type,
      host: 'localhost',
      port: type === 'mysql' ? 3306 : 1433,
      database: 'test_db',
      username: 'test_user',
      password: 'test_password',
      ...overrides
    }
  }
}

/**
 * Extract Result Factory
 *
 * Creates ExtractorResult fixtures for testing data extraction.
 */
export class ExtractResultFactory {
  /**
   * Create an extract result fixture
   *
   * @param overrides - Optional overrides to customize the result
   * @returns A new ExtractorResult instance
   *
   * @example
   * // Basic extract result
   * const result = ExtractResultFactory.createExtractResult()
   *
   * @example
   * // Result with errors
   * const result = ExtractResultFactory.createExtractResult({ errors: ['Network timeout'] })
   */
  static createExtractResult(overrides?: Partial<ExtractorResult>): ExtractorResult {
    const timestamp = Date.now()
    return {
      downloadedFiles: [`download_${timestamp}.xlsx`],
      mergedFile: `merged_${timestamp}.xlsx`,
      recordCount: 100,
      errors: [],
      orderRecordCounts: [{ orderNumber: `SC${timestamp}`, recordCount: 100 }],
      ...overrides
    }
  }

  /**
   * Create an import result fixture
   *
   * @param overrides - Optional overrides
   * @returns A new ImportResult instance
   */
  static createImportResult(overrides?: Partial<ImportResult>): ImportResult {
    return {
      success: true,
      recordsRead: 100,
      recordsDeleted: 5,
      recordsImported: 95,
      uniqueSourceNumbers: 10,
      errors: [],
      ...overrides
    }
  }
}

/**
 * Cleaner Result Factory
 *
 * Creates CleanerResult fixtures for testing material cleanup.
 */
export class CleanerResultFactory {
  /**
   * Create a cleaner result fixture
   *
   * @param overrides - Optional overrides to customize the result
   * @returns A new CleanerResult instance
   *
   * @example
   * // Basic cleaner result
   * const result = CleanerResultFactory.createCleanerResult()
   *
   * @example
   * // Result with retries
   * const result = CleanerResultFactory.createCleanerResult({ retriedOrders: 2, successfulRetries: 1 })
   */
  static createCleanerResult(overrides?: Partial<CleanerResult>): CleanerResult {
    return {
      ordersProcessed: 5,
      materialsDeleted: 20,
      materialsSkipped: 2,
      errors: [],
      details: [],
      retriedOrders: 0,
      successfulRetries: 0,
      ...overrides
    }
  }

  /**
   * Create an order clean detail fixture
   *
   * @param overrides - Optional overrides
   * @returns A new OrderCleanDetail instance
   */
  static createOrderCleanDetail(overrides?: Partial<OrderCleanDetail>): OrderCleanDetail {
    return {
      orderNumber: `SC${Date.now()}`,
      materialsDeleted: 5,
      materialsSkipped: 0,
      errors: [],
      skippedMaterials: [],
      retryCount: 0,
      ...overrides
    }
  }
}

/**
 * Audit Log Factory
 *
 * Creates AuditEntry fixtures for testing audit logging.
 */
export class AuditLogFactory {
  /**
   * Create an audit log entry fixture
   *
   * @param action - Audit action type
   * @param status - Audit status
   * @param overrides - Optional overrides
   * @returns A new AuditEntry instance
   *
   * @example
   * // Successful login audit
   * const entry = AuditLogFactory.createAuditLog(AuditAction.LOGIN, AuditStatus.SUCCESS)
   *
   * @example
   * // Failed extract audit
   * const entry = AuditLogFactory.createAuditLog(AuditAction.EXTRACT, AuditStatus.FAILURE, { resource: 'Order SC123' })
   */
  static createAuditLog(
    action: AuditAction = AuditAction.LOGIN,
    status: AuditStatus = AuditStatus.SUCCESS,
    overrides?: Partial<AuditEntry>
  ): AuditEntry {
    return {
      timestamp: new Date().toISOString(),
      action,
      userId: 'USR-001',
      username: 'test_user',
      computerName: 'TEST-PC',
      appVersion: '1.0.0',
      resource: 'test-resource',
      status,
      metadata: {},
      ...overrides
    }
  }
}

/**
 * Update Release Factory
 *
 * Creates UpdateRelease fixtures for testing update mechanisms.
 */
export class UpdateReleaseFactory {
  /**
   * Create an update release fixture
   *
   * @param channel - Release channel ('stable' or 'preview')
   * @param overrides - Optional overrides
   * @returns A new UpdateRelease instance
   *
   * @example
   * // Stable release
   * const release = UpdateReleaseFactory.createUpdateRelease('stable')
   *
   * @example
   * // Preview release with custom version
   * const release = UpdateReleaseFactory.createUpdateRelease('preview', { version: '2.0.0-beta.1' })
   */
  static createUpdateRelease(
    channel: 'stable' | 'preview' = 'stable',
    overrides?: Partial<UpdateRelease>
  ): UpdateRelease {
    return {
      version: '1.0.0',
      channel,
      artifactKey: `erputo-${channel}-v1.0.0.exe`,
      sha256: 'abc123def456',
      size: 52428800,
      publishedAt: new Date().toISOString(),
      changelogKey: 'CHANGELOG.md',
      ...overrides
    }
  }
}

/**
 * Production Input Factory
 *
 * Creates ValidationResult fixtures for testing validation.
 */
export class ProductionInputFactory {
  /**
   * Create a validation result fixture
   *
   * @param overrides - Optional overrides
   * @returns A new ValidationResult instance
   *
   * @example
   * // Basic validation result
   * const result = ProductionInputFactory.createValidationResult()
   *
   * @example
   * // Marked for deletion
   * const result = ProductionInputFactory.createValidationResult({ isMarkedForDeletion: true })
   */
  static createValidationResult(overrides?: Partial<ValidationResult>): ValidationResult {
    return {
      materialName: 'Test Material',
      materialCode: `MAT-${Date.now()}`,
      specification: 'Standard Spec',
      model: 'Model-A',
      managerName: 'Test Manager',
      isMarkedForDeletion: false,
      ...overrides
    }
  }
}

/**
 * Validation Error Factory
 *
 * Creates ValidationError fixtures for testing error handling.
 */
export class ValidationErrorFactory {
  /**
   * Create a validation error fixture
   *
   * @param message - Error message
   * @param code - Error code
   * @param overrides - Optional overrides
   * @returns A new ValidationError instance
   *
   * @example
   * // Basic validation error
   * const error = ValidationErrorFactory.createValidationError('Invalid input')
   *
   * @example
   * // Error with specific code
   * const error = ValidationErrorFactory.createValidationError(
   *   'Missing required field',
   *   'VAL_MISSING_REQUIRED'
   * )
   */
  static createValidationError(
    message: string = 'Validation failed',
    code: (typeof VALIDATION_ERROR_CODES)[keyof typeof VALIDATION_ERROR_CODES] = VALIDATION_ERROR_CODES.INVALID_INPUT,
    cause?: Error
  ): ValidationError {
    return new ValidationError(message, code, cause)
  }
}

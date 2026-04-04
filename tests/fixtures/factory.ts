/**
 * Test Fixture Factory
 *
 * Factory class for generating test data with consistent structure.
 */

import type { TestUser, Order, Material } from './types'

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
   * @returns Unique ID string in format USR-{timestamp}-{random}
   */
  private static generateId(): string {
    return `USR-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`
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

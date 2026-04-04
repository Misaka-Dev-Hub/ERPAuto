# Test Factory 使用指南

Test Factory 提供测试数据工厂类，确保测试数据一致性和可维护性。

## 快速开始

```typescript
import { UserFactory, OrderFactory, MaterialFactory } from '@/tests/fixtures/factory'

const admin = UserFactory.createAdmin()
const user = UserFactory.createUserDefault()
const order = OrderFactory.createOrder()
const material = MaterialFactory.createMaterial()
```

## 工厂方法示例

### UserFactory

```typescript
// 创建管理员
const admin = UserFactory.createAdmin()
// { id: 'USR-...', userType: 'Admin', permissions: ['read', 'write', 'delete', 'admin'] }

// 创建普通用户
const user = UserFactory.createUserDefault()
// 创建访客
const guest = UserFactory.createGuest()
// 自定义字段
const custom = UserFactory.createUser('user', {
  username: 'custom_user',
  permissions: ['read', 'write', 'custom']
})
```

### OrderFactory

```typescript
// 基础订单
const order = OrderFactory.createOrder()
// { id: 'ORD-..., orderNumber: 'SC...', plannedQuantity: 100 }

// 批量创建
const orders = OrderFactory.createOrders(5)
// 自定义字段
const customOrder = OrderFactory.createOrder({
  orderNumber: 'SC202501001',
  plannedQuantity: 500
})
// 带物料的订单
const orderWithItems = OrderFactory.createOrder({
  items: MaterialFactory.createMaterials(3)
})
// 批量创建相同配置
const batch = OrderFactory.createOrders(10, { productName: 'Batch Product' })
```

### MaterialFactory

```typescript
// 基础物料
const material = MaterialFactory.createMaterial()
// { code: 'TEST_MAT_XXX', description: 'Test Material', quantity: 10 }

// 批量创建
const materials = MaterialFactory.createMaterials(5)
// 自定义字段
const custom = MaterialFactory.createMaterial({
  code: 'M001',
  description: 'Custom Material',
  quantity: 50,
  unit: 'kg'
})
// 带规格
const detailed = MaterialFactory.createMaterial({
  code: 'M002',
  specification: '10x2000x3000',
  grade: 'Q235'
})
```

## 常见用例模式

### 模式 1：自定义字段覆盖

```typescript
// 测试导出权限
const exportUser = UserFactory.createUserDefault({
  permissions: ['read', 'export']
})

// 测试大订单
const largeOrder = OrderFactory.createOrder({
  plannedQuantity: 10000,
  items: MaterialFactory.createMaterials(20)
})
```

### 模式 2：批量创建关联数据

```typescript
const user = UserFactory.createUserDefault()
const orders = OrderFactory.createOrders(3, { creator: user.username })
```

### 模式 3：测试边界条件

```typescript
const emptyOrder = OrderFactory.createOrder({ items: [] })
const zeroOrder = OrderFactory.createOrder({ plannedQuantity: 0 })
const readOnlyUser = UserFactory.createGuest()
```

## 反模式警告

### ❌ 避免在工厂中验证业务逻辑

```typescript
// 错误
const user = UserFactory.createAdmin({ permissions: [] })

// 正确：验证在测试中
const admin = UserFactory.createAdmin()
expect(admin.permissions).toContain('admin')
```

### ❌ 避免硬编码 ID

```typescript
// 错误
const order = OrderFactory.createOrder({ id: 'ORD-FIXED-123' })

// 正确
const order = OrderFactory.createOrder()
```

### ❌ 避免混合工厂职责

```typescript
// 错误
const order = OrderFactory.createOrder({
  items: MaterialFactory.createMaterials(10).map((m) => ({
    ...m,
    quantity: m.quantity * Math.random()
  }))
})

// 正确
const order = OrderFactory.createOrder()
const materials = MaterialFactory.createMaterials(10)
```

## 迁移指南

**之前（硬编码）：**

```typescript
const user = {
  id: 'USR-123',
  username: 'test_user',
  userType: 'User' as const,
  permissions: ['read', 'write']
}
```

**之后（使用工厂）：**

```typescript
const user = UserFactory.createUserDefault({ username: 'test_user' })
```

**迁移步骤：**

1. 识别硬编码 - 查找测试中的字面量对象
2. 选择工厂 - UserFactory / OrderFactory / MaterialFactory
3. 替换调用 - 用 `createXxx()` 替换字面量
4. 保留必要覆盖

**示例：**

```typescript
// 之前
const user = {
  id: 'USR-1',
  username: 'admin_test',
  userType: 'Admin' as const,
  permissions: ['read', 'write', 'delete', 'admin']
}

// 之后
const user = UserFactory.createAdmin({ username: 'admin_test' })
```

---

**提示**：更多 API 细节查看 `tests/fixtures/factory.ts` 源码。

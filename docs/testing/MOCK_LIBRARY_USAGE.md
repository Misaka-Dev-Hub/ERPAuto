# Mock Library 使用指南

ERPAuto 测试框架提供的 Mock 工厂函数，帮助你快速创建类型安全的测试替身。

## 快速开始

```typescript
import { createMockLogger, createMockConfigManager } from '@/tests/mocks'

const mockLogger = createMockLogger()
const mockConfig = createMockConfigManager({
  logging: { level: 'debug', auditRetention: 30, appRetention: 14 }
})
```

## Logger Mock

```typescript
const mockLogger = createMockLogger()
mockLogger.info('test')
expect(mockLogger.info).toHaveBeenCalledWith('test')

// 预设行为
const mockLogger = createMockLogger({
  error: vi.fn(() => console.log('logged'))
})

// Child logger
const child = mockLogger.child('OrderService')
```

## ConfigManager Mock

```typescript
const mockConfig = createMockConfigManager({
  logging: { level: 'debug' },
  erp: { url: 'https://test.local' }
})

expect(mockConfig.getConfig().logging.level).toBe('debug')
mockConfig.updateConfig.mockResolvedValue({ success: true })
```

## ERP Auth Mock

```typescript
const mockAuth = createMockErpAuthService({ isLoggedIn: true })
expect(mockAuth.isActive()).toBe(true)

mockAuth.login.mockRejectedValue(new Error('Auth failed'))
await expect(mockAuth.login()).rejects.toThrow()
```

## Playwright Mock

```typescript
const mockPage = createMockPage()
mockPage.goto.mockResolvedValue(undefined)

const mockLocator = createMockLocator()
mockLocator.fill.mockResolvedValue(undefined)
mockLocator.click.mockResolvedValue(undefined)
```

## 常见模式

### 1. Stubbing - 预设返回值

```typescript
mockConfig.getConfig.mockReturnValue({ logging: { level: 'debug' } })
mockConfig.updateConfig.mockResolvedValue({ success: true })
```

### 2. Spying - 跟踪调用

```typescript
service.doWork(mockLogger)
expect(mockLogger.info).toHaveBeenCalledWith('Work started')
```

### 3. Behavior Preset - 预设行为

```typescript
mockAuth.login.mockRejectedValue(new Error('Auth failed'))
await expect(mockAuth.login()).rejects.toThrow()
```

## 反模式

### ❌ 复杂条件逻辑

```typescript
// 错误
mockConfig.getConfig.mockImplementation(() => {
  if (condition) return configA
  else return configB
})

// 正确
mockConfig.getConfig.mockReturnValue(fixedConfig)
```

### ❌ 真实网络调用

```typescript
// 错误
mockPage.goto.mockImplementation(async (url) => {
  await fetch(url)
})

// 正确
mockPage.goto.mockResolvedValue(undefined)
```

### ❌ 过度 Mock

```typescript
// 错误：Mock 每个方法
createMockLogger({
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
  verbose: vi.fn(),
  child: vi.fn()
})

// 正确：只覆盖需要的
createMockLogger()
createMockLogger({ error: vi.fn() })
```

## 迁移指南

### vi.mock() → createMockXxx()

**旧方式**:

```typescript
vi.mock('./logger', () => ({
  createLogger: vi.fn(() => ({ info: vi.fn() }))
}))
```

**新方式**:

```typescript
import { createMockLogger } from '@/tests/mocks'
const logger = createMockLogger()
```

**优势**: 类型安全、预设默认值、统一维护

### 手写 Mock → 工厂函数

**旧方式**:

```typescript
const mock = { getConfig: vi.fn(), updateConfig: vi.fn() }
```

**新方式**:

```typescript
const mock = createMockConfigManager()
```

**优势**: 不遗漏方法、配置自动合并

## 最佳实践

1. 优先使用工厂函数
2. 只 Mock 依赖，不 Mock 被测试类本身
3. 保持 Mock 简单
4. 用命名和注释说明 Mock 目的

## 完整示例

```typescript
import { describe, it, expect } from 'vitest'
import { createMockLogger, createMockConfigManager } from '@/tests/mocks'

describe('OrderService', () => {
  it('should process order', () => {
    const logger = createMockLogger()
    const config = createMockConfigManager({
      extraction: { batchSize: 100 }
    })

    const service = new OrderService(logger, config)
    service.processOrder('ORD-001')

    expect(logger.info).toHaveBeenCalledWith('Processing: ORD-001')
    expect(config.getConfig).toHaveBeenCalled()
  })
})
```

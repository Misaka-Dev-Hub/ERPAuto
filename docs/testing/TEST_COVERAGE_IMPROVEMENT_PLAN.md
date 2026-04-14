# ERPAuto 测试覆盖率提升计划

## 1. 执行摘要

### 1.1 当前状态评估

| 指标               | 当前值 | 目标值 | 差距    |
| ------------------ | ------ | ------ | ------- |
| **总体行覆盖率**   | 11.36% | 70%    | -58.64% |
| **总体函数覆盖率** | 21.29% | 70%    | -48.71% |
| **总体分支覆盖率** | 10.08% | 60%    | -49.92% |
| **测试文件总数**   | 54     | 100+   | -46+    |

**关键模块覆盖率差距：**

| 模块                                     | 当前覆盖率 | 要求阈值 | 优先级        |
| ---------------------------------------- | ---------- | -------- | ------------- |
| ERP 服务 (`src/main/services/erp/**`)    | 11.68%     | 80%      | P0            |
| 更新服务 (`src/main/services/update/**`) | 42.45%     | 80%      | P0            |
| 数据库服务                               | 17.24%     | 70%      | P1            |
| 配置管理                                 | 20.56%     | 70%      | P1            |
| 日志服务                                 | 70.67%     | 70%      | P2 (已达标的) |

### 1.2 提升目标

**阶段性目标：**

- **Phase 1 (4 周)**：ERP 服务达到 60%，更新服务达到 70%
- **Phase 2 (4 周)**：数据库服务达到 60%，配置管理达到 60%
- **Phase 3 (4 周)**：所有关键模块达到目标阈值，总体覆盖率达到 70%

**最终目标：**

- 全局覆盖率：70% 行 / 70% 函数 / 60% 分支
- ERP 服务：80% 行 / 80% 函数 / 70% 分支
- 更新服务：80% 行 / 80% 函数 / 70% 分支

### 1.3 时间线估算

| 阶段     | 持续时间  | 里程碑                 |
| -------- | --------- | ---------------------- |
| Phase 1  | 4 周      | ERP 核心服务测试完成   |
| Phase 2  | 4 周      | 数据层与配置层测试完成 |
| Phase 3  | 4 周      | 集成测试与 E2E 补全    |
| 缓冲期   | 2 周      | 修复与优化             |
| **总计** | **14 周** | **达到目标覆盖率**     |

---

## 2. 分阶段提升计划

### Phase 1: ERP 核心服务测试攻坚（第 1-4 周）

**目标：** ERP 服务覆盖率从 11.68% 提升至 60%

**工作内容：**

| 模块                   | 文件数 | 新增测试数 | 优先级 |
| ---------------------- | ------ | ---------- | ------ |
| `erp-auth.ts`          | 1      | 15         | P0     |
| `extractor.ts`         | 1      | 20         | P0     |
| `extractor-core.ts`    | 1      | 15         | P0     |
| `cleaner.ts`           | 1      | 12         | P0     |
| `ErpBrowserManager.ts` | 1      | 10         | P1     |
| `order-resolver.ts`    | 1      | 8          | P1     |
| `page-diagnostics.ts`  | 1      | 6          | P2     |
| `erp-error-context.ts` | 1      | 5          | P2     |
| `locators.ts`          | 1      | 8          | P1     |

**预计投入：** 80-100 小时

**成功标准：**

- [ ] ERP 服务行覆盖率 ≥ 60%
- [ ] ERP 服务函数覆盖率 ≥ 70%
- [ ] 新增测试文件：9 个
- [ ] 所有 P0 模块有完整测试覆盖

---

### Phase 2: 数据层与配置层测试（第 5-8 周）

**目标：** 数据库服务与配置管理覆盖率达标

**工作内容：**

#### 2.1 数据库服务（17.24% → 60%）

| 模块                                           | 文件数 | 新增测试数 | 优先级 |
| ---------------------------------------------- | ------ | ---------- | ------ |
| `mysql.ts` / `sql-server.ts` / `postgresql.ts` | 3      | 18         | P0     |
| `data-source.ts`                               | 1      | 8          | P0     |
| `data-importer.ts`                             | 1      | 10         | P0     |
| DAO 层文件                                     | 4      | 16         | P1     |
| Repository 层                                  | 2      | 8          | P1     |
| 数据库实体                                     | 2      | 6          | P2     |

#### 2.2 配置管理（20.56% → 60%）

| 模块                | 文件数 | 新增测试数 | 优先级 |
| ------------------- | ------ | ---------- | ------ |
| `config-manager.ts` | 1      | 20         | P0     |
| 配置 Schema 验证    | 1      | 10         | P1     |

#### 2.3 用户服务（新增）

| 模块                         | 文件数 | 新增测试数 | 优先级 |
| ---------------------------- | ------ | ---------- | ------ |
| `session-manager.ts`         | 1      | 8          | P1     |
| `user-erp-config-service.ts` | 1      | 10         | P1     |
| `bip-users-dao.ts`           | 1      | 6          | P2     |

**预计投入：** 100-120 小时

**成功标准：**

- [ ] 数据库服务行覆盖率 ≥ 60%
- [ ] 配置管理行覆盖率 ≥ 60%
- [ ] 新增测试文件：15 个
- [ ] 所有数据库方言有完整测试

---

### Phase 3: 更新服务与其他模块补全（第 9-12 周）

**目标：** 更新服务达到 80%，其他服务达到 70%

**工作内容：**

#### 3.1 更新服务（42.45% → 80%）

| 模块                         | 文件数 | 新增测试数 | 优先级 |
| ---------------------------- | ------ | ---------- | ------ |
| `update-service.ts`          | 1      | 15         | P0     |
| `update-catalog-service.ts`  | 1      | 12         | P0     |
| `update-installer.ts`        | 1      | 10         | P0     |
| `update-storage-client.ts`   | 1      | 10         | P0     |
| `update-status-publisher.ts` | 1      | 6          | P1     |
| `update-support.ts`          | 1      | 5          | P1     |
| `update-utils.ts`            | 1      | 5          | P2     |

#### 3.2 其他关键服务

| 模块                       | 文件数 | 新增测试数 | 优先级 |
| -------------------------- | ------ | ---------- | ------ |
| 验证服务 (`validation/**`) | 3      | 15         | P1     |
| 清理服务 (`cleaner/**`)    | 2      | 10         | P1     |
| Excel 服务                 | 2      | 8          | P2     |
| 报告生成                   | 1      | 6          | P2     |
| Playwright 浏览器服务      | 2      | 10         | P1     |
| RustFS 服务                | 2      | 8          | P2     |

**预计投入：** 100-120 小时

**成功标准：**

- [ ] 更新服务行覆盖率 ≥ 80%
- [ ] 更新服务函数覆盖率 ≥ 80%
- [ ] 新增测试文件：17 个
- [ ] 所有 P0/P1 模块覆盖率达标

---

### Phase 4: 集成测试与 E2E 强化（第 13-14 周）

**目标：** 强化集成测试与端到端测试

**工作内容：**

#### 4.1 集成测试扩展（7 → 20 个）

| 测试场景                   | 优先级 | 描述                   |
| -------------------------- | ------ | ---------------------- |
| ERP 登录 + 提取完整流程    | P0     | 验证认证与数据提取集成 |
| 数据库事务完整流程         | P0     | 验证 TypeORM 事务边界  |
| 配置热加载与验证           | P1     | 验证配置更新传播       |
| 更新检查 + 下载 + 安装流程 | P0     | 验证更新完整链路       |
| 日志异步写入与轮转         | P1     | 验证日志系统           |
| 用户会话切换流程           | P1     | 验证多用户场景         |
| Excel 导入导出完整流程     | P2     | 验证文件处理链         |

#### 4.2 E2E 测试扩展（3 → 15 个）

| 用户旅程             | 优先级 | 描述                             |
| -------------------- | ------ | -------------------------------- |
| 管理员完整工作流程   | P0     | 登录 → 提取 → 清理 → 验证 → 登出 |
| 普通用户数据提取流程 | P0     | 登录 → 提取 → 查看结果           |
| Guest 只读访问流程   | P1     | 登录 → 查看历史记录              |
| 配置管理流程         | P1     | 修改配置 → 保存 → 验证生效       |
| 自动更新流程         | P0     | 检查更新 → 下载 → 安装 → 重启    |
| 错误恢复流程         | P1     | 断网重连、会话过期恢复           |
| 批量处理流程         | P1     | 大批量订单处理性能验证           |

**预计投入：** 60-80 小时

**成功标准：**

- [ ] 集成测试文件：20 个
- [ ] E2E 测试文件：15 个
- [ ] 关键用户旅程 100% 覆盖
- [ ] 整体覆盖率达到 70%

---

## 3. 逐模块测试计划

### 3.1 ERP 服务模块

#### 3.1.1 `erp-auth.ts` (P0)

**当前覆盖率：** < 20%  
**目标覆盖率：** 80%

| 测试场景            | 测试类型 | Mock 对象                       | 预期结果            |
| ------------------- | -------- | ------------------------------- | ------------------- |
| 成功登录流程        | 单元     | Playwright Browser/Context/Page | 返回有效 ErpSession |
| 登录失败 - 网络错误 | 单元     | Playwright + 模拟网络错误       | 抛出连接错误        |
| 登录失败 - 凭证错误 | 单元     | Page + 模拟错误消息             | 抛出认证错误        |
| 会话复用 - 已登录   | 单元     | Session Mock                    | 直接返回现有会话    |
| 登出流程            | 单元     | Browser/Context Mock            | 资源正确释放        |
| 会话超时检测        | 单元     | Page + 超时 Mock                | 返回未登录状态      |
| 页面元素定位失败    | 单元     | Page + Selector 失败            | 抛出元素未找到错误  |
| SSL 证书错误处理    | 集成     | 真实 Browser + 自签名证书       | 成功建立连接        |

**预计测试数：** 15

---

#### 3.1.2 `extractor.ts` (P0)

**当前覆盖率：** ~30%  
**目标覆盖率：** 80%

| 测试场景       | 测试类型 | Mock 对象                  | 预期结果             |
| -------------- | -------- | -------------------------- | -------------------- |
| 单订单提取成功 | 单元     | ErpAuthService + Page      | 返回 ExtractorResult |
| 批量订单提取   | 单元     | ErpAuthService + 循环 Mock | 正确分批处理         |
| 订单号无效处理 | 单元     | Page + 错误响应            | 记录错误，继续处理   |
| 下载文件合并   | 单元     | ExcelJS + fs Mock          | 生成合并文件         |
| 数据库持久化   | 集成     | DatabaseService Mock       | 记录成功导入         |
| 并发限制控制   | 单元     | 信号量 Mock                | 不超过并发上限       |
| 提取中断恢复   | 集成     | 模拟中断 + 恢复            | 从断点继续           |
| 结果统计准确性 | 单元     | 完整 Mock 链               | 统计数字准确         |

**预计测试数：** 20

---

#### 3.1.3 `extractor-core.ts` (P0)

**当前覆盖率：** < 10%  
**目标覆盖率：** 80%

| 测试场景         | 测试类型 | Mock 对象        | 预期结果     |
| ---------------- | -------- | ---------------- | ------------ |
| 页面导航到列表页 | 单元     | Page + Frame     | 成功导航     |
| 订单号输入       | 单元     | Locator Mock     | 正确填充     |
| 查询按钮点击     | 单元     | Locator Mock     | 触发查询     |
| 表格数据解析     | 单元     | Table Locator    | 返回物料列表 |
| 分页处理         | 单元     | Page + 多页 Mock | 遍历所有页   |
| 下载按钮点击     | 单元     | Locator + Dialog | 触发下载     |
| 下载完成等待     | 单元     | fs + 文件事件    | 文件落地     |
| 错误弹窗检测     | 单元     | Page + 错误元素  | 捕获错误消息 |

**预计测试数：** 15

---

#### 3.1.4 `cleaner.ts` (P0)

**当前覆盖率：** ~25%  
**目标覆盖率：** 80%

| 测试场景         | 测试类型 | Mock 对象          | 预期结果     |
| ---------------- | -------- | ------------------ | ------------ |
| 单物料删除成功   | 单元     | Page + Locator     | 删除成功     |
| 批量物料删除     | 单元     | 循环删除 Mock      | 全部删除     |
| 物料不存在处理   | 单元     | Page + 空结果      | 跳过并记录   |
| 删除按钮失效处理 | 单元     | Locator + disabled | 跳过该物料   |
| 干运行模式       | 单元     | 不执行实际删除     | 返回预览结果 |
| 并发控制         | 单元     | 信号量 Mock        | 限制并发数   |
| 错误重试机制     | 集成     | 失败→成功 Mock     | 重试成功     |
| 删除结果统计     | 单元     | 完整 Mock 链       | 统计准确     |

**预计测试数：** 12

---

### 3.2 数据库服务模块

#### 3.2.1 数据库连接服务 (P0)

**文件：** `mysql.ts`, `sql-server.ts`, `postgresql.ts`

**当前覆盖率：** ~20%  
**目标覆盖率：** 70%

| 测试场景            | 测试类型 | Mock 对象               | 预期结果     |
| ------------------- | -------- | ----------------------- | ------------ |
| MySQL 连接成功      | 单元     | mysql2 Pool Mock        | 返回连接实例 |
| SQL Server 连接成功 | 单元     | mssql Connection Mock   | 返回连接实例 |
| PostgreSQL 连接成功 | 单元     | pg Pool Mock            | 返回连接实例 |
| 连接失败处理        | 单元     | 模拟连接拒绝            | 抛出错误     |
| 查询执行成功        | 集成     | 数据库 Mock + 返回结果  | 正确返回数据 |
| 事务提交            | 集成     | Transaction Mock        | 成功提交     |
| 事务回滚            | 集成     | Transaction Mock + 错误 | 正确回滚     |
| 连接池释放          | 单元     | Pool Mock               | 正确关闭     |

**预计测试数：** 18 (3 个数据库 × 6 场景)

---

#### 3.2.2 数据源管理 (P0)

**文件：** `data-source.ts`

**当前覆盖率：** < 10%  
**目标覆盖率：** 70%

| 测试场景        | 测试类型 | Mock 对象       | 预期结果       |
| --------------- | -------- | --------------- | -------------- |
| TypeORM 初始化  | 单元     | DataSource Mock | 成功初始化     |
| 数据源销毁      | 单元     | DataSource Mock | 正确释放       |
| Repository 获取 | 单元     | Repository Mock | 返回对应仓库   |
| 实体注册验证    | 单元     | Entity Mock     | 所有实体已注册 |
| 多次初始化防护  | 单元     | 状态检查 Mock   | 不重复初始化   |

**预计测试数：** 8

---

#### 3.2.3 数据导入器 (P0)

**文件：** `data-importer.ts`

**当前覆盖率：** < 15%  
**目标覆盖率：** 70%

| 测试场景       | 测试类型 | Mock 对象                | 预期结果     |
| -------------- | -------- | ------------------------ | ------------ |
| Excel 读取成功 | 集成     | ExcelJS + 测试文件       | 解析数据结构 |
| 数据验证通过   | 单元     | Schema 验证 Mock         | 数据合法     |
| 数据验证失败   | 单元     | Schema 验证 Mock         | 抛出验证错误 |
| 批量插入       | 集成     | Repository Mock          | 正确分批插入 |
| 重复数据处理   | 单元     | Repository + exists 检查 | 跳过或更新   |
| 插入失败回滚   | 集成     | Transaction Mock + 错误  | 全部回滚     |
| 导入进度追踪   | 单元     | EventEmitter Mock        | 发送进度事件 |
| 导入结果统计   | 单元     | 完整 Mock 链             | 统计准确     |

**预计测试数：** 10

---

### 3.3 配置管理模块

#### 3.3.1 `config-manager.ts` (P0)

**当前覆盖率：** ~25%  
**目标覆盖率：** 70%

| 测试场景         | 测试类型 | Mock 对象            | 预期结果     |
| ---------------- | -------- | -------------------- | ------------ |
| 配置文件加载成功 | 单元     | fs + yaml Mock       | 返回有效配置 |
| 配置文件不存在   | 单元     | fs Mock + 不存在     | 使用默认配置 |
| 配置文件格式错误 | 单元     | yaml Mock + 解析失败 | 抛出解析错误 |
| Zod 验证失败     | 单元     | 无效配置数据         | 抛出验证错误 |
| 配置更新         | 单元     | fs + yaml Mock       | 文件正确写入 |
| 重置为默认值     | 单元     | 完整 Mock 链         | 恢复默认     |
| 导出为 YAML      | 单元     | yaml.stringify Mock  | 格式正确     |
| 数据库类型切换   | 单元     | 状态 Mock            | 返回正确配置 |
| 日志配置应用     | 集成     | Winston Mock         | 日志级别生效 |
| 审计配置应用     | 集成     | AuditLogger Mock     | 审计配置生效 |
| 单例模式验证     | 单元     | 多次 getInstance     | 返回同一实例 |
| 并发读取安全     | 集成     | 并发 Mock + 竞争     | 数据一致     |

**预计测试数：** 20

---

### 3.4 更新服务模块

#### 3.4.1 `update-service.ts` (P0)

**当前覆盖率：** ~50%  
**目标覆盖率：** 80%

| 测试场景            | 测试类型 | Mock 对象                 | 预期结果     |
| ------------------- | -------- | ------------------------- | ------------ |
| 服务初始化          | 单元     | ConfigManager + 依赖 Mock | 服务就绪     |
| 获取更新状态        | 单元     | 状态 Mock                 | 返回当前状态 |
| 获取更新目录        | 单元     | CatalogService Mock       | 返回目录结构 |
| 检查更新 - 有新版本 | 集成     | S3Client Mock + 新版本    | 返回更新列表 |
| 检查更新 - 无新版本 | 集成     | S3Client Mock + 最新版    | 返回空列表   |
| 下载更新 - 成功     | 集成     | S3Client + fs Mock        | 文件下载成功 |
| 下载更新 - 失败     | 集成     | S3Client + 网络错误       | 抛出错误     |
| 校验 SHA256 - 通过  | 单元     | crypto Mock               | 校验通过     |
| 校验 SHA256 - 失败  | 单元     | crypto Mock + 不匹配      | 抛出校验错误 |
| 安装更新            | 集成     | child_process Mock        | 启动安装器   |
| 用户权限检查        | 单元     | UserType Mock             | 正确过滤     |
| 定期自动检查        | 集成     | setInterval Mock          | 按时检查     |

**预计测试数：** 15

---

#### 3.4.2 `update-catalog-service.ts` (P0)

**当前覆盖率：** ~40%  
**目标覆盖率：** 80%

| 测试场景     | 测试类型 | Mock 对象          | 预期结果     |
| ------------ | -------- | ------------------ | ------------ |
| 构建更新目录 | 单元     | StorageClient Mock | 返回分类目录 |
| 稳定版过滤   | 单元     | UserType + 目录    | 只看 stable  |
| 管理员全访问 | 单元     | AdminType + 目录   | 看全部通道   |
| 更新历史记录 | 单元     | Repository Mock    | 返回历史记录 |
| 限制记录数量 | 单元     | 数据截断           | 不超过上限   |

**预计测试数：** 12

---

#### 3.4.3 `update-storage-client.ts` (P0)

**当前覆盖率：** ~35%  
**目标覆盖率：** 80%

| 测试场景        | 测试类型 | Mock 对象           | 预期结果       |
| --------------- | -------- | ------------------- | -------------- |
| S3 客户端初始化 | 单元     | AWS SDK Mock        | 客户端创建成功 |
| 列出更新包      | 单元     | S3 listObjects Mock | 返回对象列表   |
| 下载文件        | 单元     | S3 getObject Mock   | 返回文件流     |
| 下载失败处理    | 单元     | S3 + 网络错误       | 抛出错误       |
| 计算 SHA256     | 单元     | crypto Mock         | 哈希值正确     |
| 重试机制        | 集成     | 失败→成功 Mock      | 重试成功       |

**预计测试数：** 10

---

## 4. 测试类别实施指南

### 4.1 单元测试

**适用范围：**

- 服务类（Service）的业务逻辑
- 工具函数（Utility Functions）
- 数据处理函数
- 类型转换函数

**Mock 策略：**

```typescript
// 使用现有 Mock 库
import {
  createMockLogger,
  createMockConfigManager,
  createMockErpAuthService,
  createMockDatabaseService,
  createMockDataSource,
  createMockRepository
} from '@/tests/mocks'

// 示例：ERP Auth 测试
describe('ErpAuthService', () => {
  const mockConfig = { url: 'https://test.com', username: 'test', password: 'test' }
  const mockPage = createMockPage() // 来自 mocks/index.ts

  it('should login successfully', async () => {
    mockPage.goto.mockResolvedValue(undefined)
    mockPage.waitForSelector.mockResolvedValue(undefined)

    const authService = new ErpAuthService(mockConfig)
    // 注入 mock (需要构造函数支持或使用 vi.mock)
    const session = await authService.login()

    expect(session.isLoggedIn).toBe(true)
  })
})
```

**测试覆盖重点：**

1. **正常路径：** 主要业务流程成功执行
2. **异常路径：** 错误处理、回滚、重试
3. **边界条件：** 空输入、极大值、极小值
4. **分支覆盖：** if/else、switch/case 所有分支

---

### 4.2 集成测试

**适用范围：**

- 多服务协作场景
- 数据库事务边界
- 文件系统交互
- 外部服务调用（需 Stub）

**测试模式：**

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { DatabaseService } from '@/main/services/database'
import { ConfigManager } from '@/main/services/config'

describe('Database + Config Integration', () => {
  let db: DatabaseService
  let configManager: ConfigManager

  beforeEach(async () => {
    // 使用内存数据库或测试配置
    configManager = ConfigManager.getInstance()
    db = new DatabaseService(configManager)
    await db.connect()
  })

  afterEach(async () => {
    await db.disconnect()
  })

  it('should persist and retrieve data', async () => {
    // 实际数据库操作
    await db.query('INSERT INTO ...')
    const result = await db.query('SELECT ...')

    expect(result.rows).toHaveLength(1)
  })
})
```

**集成测试清单：**

| 集成场景        | 涉及模块                    | 预期时间 |
| --------------- | --------------------------- | -------- |
| ERP 登录 + 提取 | ErpAuth + Extractor         | < 5s     |
| 数据库事务      | DataSource + Repository     | < 2s     |
| 配置更新传播    | ConfigManager + Logger      | < 1s     |
| 文件导入导出    | ExcelParser + fs            | < 3s     |
| 更新下载校验    | UpdateService + S3 + crypto | < 10s    |

---

### 4.3 E2E 测试

**适用范围：**

- 完整用户旅程
- UI 交互验证
- 真实浏览器行为
- 跨进程通信

**Playwright 测试模式：**

```typescript
import { test, expect } from '@playwright/test'

test('complete extraction workflow', async ({ page }) => {
  // 1. 导航到登录页
  await page.goto('http://localhost:5173/login')

  // 2. 登录
  await page.getByPlaceholder('用户名').fill('admin')
  await page.getByPlaceholder('密码').fill('admin123')
  await page.getByRole('button', { name: '登录' }).click()

  // 3. 等待跳转
  await expect(page).toHaveURL(/dashboard/)

  // 4. 进入提取页面
  await page.getByText('数据提取').click()

  // 5. 输入订单号
  await page.getByPlaceholder('请输入订单号').fill('SC202601001')

  // 6. 开始提取
  await page.getByRole('button', { name: '开始提取' }).click()

  // 7. 等待完成
  await expect(page.getByText('提取完成')).toBeVisible({ timeout: 30000 })

  // 8. 验证结果
  await expect(page.getByText('记录数：')).toBeVisible()
})
```

**E2E 测试关键场景：**

| 用户旅程         | 步骤数 | 预期时间 | 优先级 |
| ---------------- | ------ | -------- | ------ |
| 管理员完整工作流 | 15     | < 60s    | P0     |
| 普通用户提取     | 8      | < 45s    | P0     |
| 配置管理         | 10     | < 30s    | P1     |
| 自动更新         | 8      | < 90s    | P0     |
| 错误恢复         | 6      | < 40s    | P1     |

---

## 5. 资源与工作量估算

### 5.1 人员配置建议

| 角色           | 人数     | 职责                    |
| -------------- | -------- | ----------------------- |
| 测试开发工程师 | 2 人     | 单元测试、集成测试编写  |
| 全栈工程师     | 1 人     | E2E 测试、Mock 基础设施 |
| 代码审查员     | 1 人     | 测试代码质量审查        |
| **总计**       | **4 人** | **14 周完成**           |

**单人模式调整：**

若只有 1 人负责，时间调整为：

- 周投入：20-25 小时
- 总周期：20-24 周
- 优先级：P0 → P1 → P2

---

### 5.2 工作量分解

| 阶段     | 任务              | 估算小时         |
| -------- | ----------------- | ---------------- |
| Phase 1  | ERP 服务单元测试  | 80-100           |
|          | Mock 基础设施优化 | 10-15            |
| Phase 2  | 数据库单元测试    | 60-80            |
|          | 配置单元测试      | 20-30            |
|          | 集成测试          | 20-30            |
| Phase 3  | 更新服务测试      | 60-80            |
|          | 其他服务测试      | 40-50            |
| Phase 4  | E2E 测试          | 40-60            |
|          | 覆盖率优化        | 20-30            |
| **总计** |                   | **350-475 小时** |

---

### 5.3 风险因素

| 风险                        | 可能性 | 影响 | 缓解措施                 |
| --------------------------- | ------ | ---- | ------------------------ |
| Playwright 浏览器兼容性问题 | 中     | 高   | 提前验证浏览器版本       |
| 数据库连接不稳定            | 低     | 中   | 使用内存数据库或容器     |
| Mock 与实现不同步           | 高     | 中   | 定期同步，添加类型检查   |
| 测试维护成本过高            | 中     | 中   | 使用工厂模式，避免硬编码 |
| 覆盖率工具性能影响          | 低     | 低   | CI 中仅对变更文件检查    |

---

## 6. 成功度量标准

### 6.1 覆盖率指标

| 里程碑       | 总体行覆盖率 | ERP 服务 | 更新服务 | 数据库  |
| ------------ | ------------ | -------- | -------- | ------- |
| Phase 1 完成 | 25%          | 60%      | 50%      | 25%     |
| Phase 2 完成 | 45%          | 65%      | 60%      | 60%     |
| Phase 3 完成 | 65%          | 75%      | 80%      | 65%     |
| Phase 4 完成 | **70%**      | **80%**  | **80%**  | **70%** |

---

### 6.2 测试数量目标

| 类型           | 当前   | Phase 1 | Phase 2 | Phase 3 | Phase 4 |
| -------------- | ------ | ------- | ------- | ------- | ------- |
| 单元测试文件   | 40     | 50      | 60      | 75      | 85      |
| 集成测试文件   | 7      | 8       | 12      | 15      | 20      |
| E2E 测试文件   | 3      | 3       | 3       | 5       | 15      |
| **总测试文件** | **50** | **61**  | **75**  | **95**  | **120** |

---

### 6.3 质量门禁

**每个 PR 必须满足：**

1. **新增代码覆盖率 ≥ 80%** (使用 `vitest --coverage --changed`)
2. **无测试失败**
3. **测试执行时间 < 30s** (单元测试) / < 120s (集成) / < 5min (E2E)
4. **无 Mock 滥用** (真实逻辑必须有真实测试)

**CI/CD 检查：**

```yaml
# GitHub Actions 示例
- name: Test & Coverage
  run: |
    npm run test:coverage
    # 检查覆盖率阈值
    npx vitest --coverage --thresholds
    # 生成报告
    npx vitest --coverage --reporter=html
    # 上传覆盖率
    uses: codecov/codecov-action@v4
```

---

## 7. 立即行动项（本周）

### 7.1 优先级 P0 - 必须完成

| 任务                             | 负责人 | 截止日期 | 状态 |
| -------------------------------- | ------ | -------- | ---- |
| 创建 ERP Auth 测试文件框架       | -      | Day 2    | ☐    |
| 创建 Extractor Core 测试文件框架 | -      | Day 3    | ☐    |
| 扩展现有 Mock 库支持新增场景     | -      | Day 4    | ☐    |
| 运行首次覆盖率基准测试           | -      | Day 1    | ☐    |

### 7.2 优先级 P1 - 建议完成

| 任务                       | 负责人 | 截止日期 | 状态 |
| -------------------------- | ------ | -------- | ---- |
| 整理现有测试文件结构       | -      | Day 3    | ☐    |
| 创建测试模板和最佳实践文档 | -      | Day 5    | ☐    |
| 设置覆盖率 CI 报告         | -      | Day 5    | ☐    |

### 7.3 技术准备清单

```bash
# 1. 安装覆盖率报告工具
npm install --save-dev @vitest/coverage-v8

# 2. 运行基准测试
npm run test:coverage

# 3. 查看 HTML 报告
npm run test:coverage
# 打开 coverage/index.html

# 4. 按文件查看详细覆盖率
npx vitest --coverage --reporter=verbose
```

### 7.4 第一个 Sprint 目标（Week 1-2）

**目标：ERP Auth 测试完成 50%**

- [ ] `tests/unit/services/erp/erp-auth.test.ts` 创建
- [ ] 成功登录场景测试（3 个）
- [ ] 失败场景测试（5 个）
- [ ] 会话管理测试（3 个）
- [ ] Mock 优化支持 Page 生命周期事件
- [ ] 运行测试，覆盖率 ≥ 40%

---

## 附录

### A. 现有测试资源

| 资源      | 路径                         | 状态               |
| --------- | ---------------------------- | ------------------ |
| 测试设置  | `tests/setup.ts`             | 完整 Electron Mock |
| 测试工厂  | `tests/fixtures/factory.ts`  | 8 个工厂类         |
| Mock 库   | `tests/mocks/index.ts`       | 15+ Mock 函数      |
| 测试文档  | `docs/TEST_FACTORY_USAGE.md` | 工厂使用指南       |
| Mock 文档 | `docs/MOCK_LIBRARY_USAGE.md` | Mock 使用指南      |

### B. 推荐测试工具

| 工具                   | 用途          |
| ---------------------- | ------------- |
| `vitest`               | 单元测试框架  |
| `@playwright/test`     | E2E 测试框架  |
| `@vitest/coverage-v8`  | V8 覆盖率引擎 |
| `vitest-html-reporter` | HTML 报告生成 |

### C. 相关文件

- `vitest.config.ts` - Vitest 配置与覆盖率阈值
- `package.json` - 测试脚本定义
- `.github/workflows/test.yml` - CI 测试工作流

---

**文档版本：** 1.0  
**创建日期：** 2026-04-05  
**最后更新：** 2026-04-05  
**维护者：** ERPAuto 开发团队

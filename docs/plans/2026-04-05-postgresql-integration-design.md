# PostgreSQL 集成设计文档

**日期:** 2026-04-05
**状态:** 已批准
**分支:** dev-logging

## 目标

将 PostgreSQL 作为第三种可选数据库类型集成到 ERPAuto 中，与现有 MySQL、SQL Server 并列。通过引入 SqlDialect 抽象层，统一管理三种数据库的 SQL 方言差异，同时重构现有 DAO 层消除散落的 `isSqlServer` 判断。

## 背景

- PostgreSQL 数据库已通过 SSMA 从 SQL Server 迁移完成，表结构、schema 组织、列名完全一致
- 连接信息：`postgresql://admin:***@192.168.31.83:5432/postgres`，数据库 `CompanyDB`
- 共 15 个 schema、151 张表，`dbo` schema 包含 ERPAuto 直接使用的表

## 方案：抽象数据库方言层

### 1. SqlDialect 接口

新建 `src/main/types/sql-dialect.types.ts`：

```typescript
export interface SqlDialect {
  readonly dbType: DatabaseType

  // 表名引用
  quoteTableName(schema: string, table: string): string

  // 参数占位符
  param(index: number): string
  params(count: number): string

  // SQL 函数
  currentTimestamp(): string

  // UPSERT
  upsert(p: {
    table: string
    keyColumns: string[]
    valueColumns: string[]
    placeholderCount: number
    startParamIndex: number
  }): string

  // 分页
  paginate(p: {
    sql: string
    limit: number
    offset?: number
    paramIndex: number
  }): { sql: string; paramIndex: number }

  // 批量限制
  maxBatchRows(columnsPerRow: number): number
}
```

### 2. 三种方言实现

新建 `src/main/services/database/dialects/` 目录：

| 文件 | 数据库 | param(n) | quoteTableName | currentTimestamp | upsert | paginate |
|------|--------|----------|---------------|-----------------|--------|----------|
| `mysql-dialect.ts` | MySQL | `?` | `dbo_Table` | `NOW()` | `ON DUPLICATE KEY` | `LIMIT x OFFSET y` |
| `sqlserver-dialect.ts` | SQL Server | `@p{n}` | `[dbo].[Table]` | `GETDATE()` | `MERGE` | `OFFSET/FETCH` |
| `postgresql-dialect.ts` | PostgreSQL | `${n+1}` | `"dbo"."Table"` | `CURRENT_TIMESTAMP` | `ON CONFLICT` | `LIMIT x OFFSET y` |

方言工厂 `dialects/index.ts`：
```typescript
export function createDialect(type: DatabaseType): SqlDialect
```

### 3. DAO 层重构

每个 DAO 新增 `dialect` 成员，替代原有的 `getTableName()`、`buildPlaceholders()` 和所有 `isSqlServer` 分支：

**删除：**
- `getTableName()` 私有方法
- `buildPlaceholders()` 私有方法
- 所有 `isSqlServer` 局部变量和条件分支
- `*_CONFIG` 中的 `TABLE_NAME_SQLSERVER` / `TABLE_NAME_MYSQL` → 合并为 `TABLE_SCHEMA` + `TABLE_NAME`

**新增：**
- `private dialect: SqlDialect | null = null`
- `private getDialect(): SqlDialect`

**涉及 DAO：**
- `DiscreteMaterialPlanDAO` — 占位符、表名、批量大小
- `MaterialsToBeDeletedDAO` — 占位符、表名、MERGE/ON DUPLICATE KEY → `upsert()`
- `MaterialsTypeToBeDeletedDAO` — 同上
- `ExtractorOperationHistoryDAO` — 占位符、表名、GETDATE()/NOW() → `currentTimestamp()`、分页 → `paginate()`

### 4. PostgreSQL 服务层

新建 `src/main/services/database/postgresql.ts`：
- 使用 `pg` 驱动，`Pool` 连接池
- 实现 `IDatabaseService` 接口
- `query()` 直接传递参数数组给 `pg`
- `transaction()` 使用 `client.query('BEGIN/COMMIT/ROLLBACK')`

### 5. 工厂、配置、TypeORM

**database/index.ts：** `create()` 新增 `'postgresql'` 分支，新增 `createPostgreSqlConfig()`

**database.types.ts：** `DatabaseType` 扩展为 `'mysql' | 'sqlserver' | 'postgresql'`，新增 `PostgreSqlConfig`

**data-source.ts：** TypeORM `type` 映射新增 `'postgres'`

**config.template.yaml：** 新增 `postgresql` 配置段

**package.json：** 新增 `pg` 依赖

## 改动范围

| 层 | 文件 | 动作 |
|---|---|---|
| 类型 | `types/database.types.ts` | 修改 |
| 方言 | `database/dialects/index.ts` | 新建 |
| 方言 | `database/dialects/mysql-dialect.ts` | 新建 |
| 方言 | `database/dialects/sqlserver-dialect.ts` | 新建 |
| 方言 | `database/dialects/postgresql-dialect.ts` | 新建 |
| 服务 | `database/postgresql.ts` | 新建 |
| 工厂 | `database/index.ts` | 修改 |
| TypeORM | `database/data-source.ts` | 修改 |
| DAO | `database/discrete-material-plan-dao.ts` | 重构 |
| DAO | `database/materials-to-be-deleted-dao.ts` | 重构 |
| DAO | `database/materials-type-to-be-deleted-dao.ts` | 重构 |
| DAO | `database/extractor-operation-history-dao.ts` | 重构 |
| 配置 | `config.template.yaml` | 修改 |
| 依赖 | `package.json` | 修改 |

共 **4 个新文件 + 10 个修改文件**。

## 不在范围内

- IPC 处理器新增（前端暂不需要直接切换 PostgreSQL）
- Entity/Repository 的 TypeScript 类型适配（TypeORM 内部处理方言差异）
- 数据迁移工具
- 前端 UI 变更

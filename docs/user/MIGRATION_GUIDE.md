# BIPUsers 表 ERP 参数迁移指南

## 概述

本次迁移将 ERP 配置参数（`ERP_URL`, `ERP_USERNAME`, `ERP_PASSWORD`）从 `.env` 文件迁移到 `dbo_BIPUsers` 数据库表中，实现每个用户独立的 ERP 配置。

## 迁移步骤

### 步骤 1：连接到 MySQL 数据库

使用你喜欢的 MySQL 客户端工具连接：

**方式 A: MySQL 命令行**

```bash
mysql -h 192.168.31.83 -P 3306 -u remote_user -p'3.1415926Beeke' BLD_DB
```

**方式 B: MySQL Workbench / Navicat / DBeaver**

- Host: `192.168.31.83`
- Port: `3306`
- Username: `remote_user`
- Password: `3.1415926Beeke`
- Database: `BLD_DB`

### 步骤 2：执行迁移 SQL

运行以下 SQL 脚本添加新字段：

```sql
-- ============================================
-- BIPUsers 表迁移：添加 ERP 参数字段
-- ============================================

USE BLD_DB;

-- 1. 添加 ERP_URL 字段
ALTER TABLE dbo_BIPUsers ADD COLUMN IF NOT EXISTS ERP_URL VARCHAR(500) NULL COMMENT 'ERP 系统 URL';

-- 2. 添加 ERP_Username 字段
ALTER TABLE dbo_BIPUsers ADD COLUMN IF NOT EXISTS ERP_Username VARCHAR(255) NULL COMMENT 'ERP 用户名';

-- 3. 添加 ERP_Password 字段
ALTER TABLE dbo_BIPUsers ADD COLUMN IF NOT EXISTS ERP_Password VARCHAR(255) NULL COMMENT 'ERP 密码';

-- 4. 验证字段已添加
DESCRIBE dbo_BIPUsers;
```

**注意：** 如果你的 MySQL 版本不支持 `ADD COLUMN IF NOT EXISTS`，请使用：

```sql
USE BLD_DB;

ALTER TABLE dbo_BIPUsers ADD COLUMN ERP_URL VARCHAR(500) NULL COMMENT 'ERP 系统 URL';
ALTER TABLE dbo_BIPUsers ADD COLUMN ERP_Username VARCHAR(255) NULL COMMENT 'ERP 用户名';
ALTER TABLE dbo_BIPUsers ADD COLUMN ERP_Password VARCHAR(255) NULL COMMENT 'ERP 密码';
```

### 步骤 3：初始化 ERP 配置

将所有现有用户的 ERP 配置设置为当前 `.env` 中的值：

```sql
-- 更新所有用户的 ERP 配置
UPDATE dbo_BIPUsers
SET
  ERP_URL = 'https://68.11.34.30:8082/',
  ERP_Username = '在这里填写你的 ERP 用户名',
  ERP_Password = '在这里填写你的 ERP 密码'
WHERE ERP_URL IS NULL OR ERP_URL = '';
```

**请将上面的占位符替换为实际的 ERP 凭证！**

### 步骤 4：验证迁移结果

```sql
-- 检查所有用户的 ERP 配置
SELECT
  UserName,
  UserType,
  ERP_URL,
  ERP_Username,
  CreateTime
FROM dbo_BIPUsers
ORDER BY UserName;
```

## 迁移后配置

### 更新 .env 文件（可选）

迁移完成后，`.env` 文件中的 ERP 配置将不再使用，但为了向后兼容可以保留：

```bash
# ERP 配置（已废弃，仅用于向后兼容）
# ERP_URL=https://68.11.34.30:8082/
# ERP_USERNAME=your_username
# ERP_PASSWORD=your_password
```

### 在应用中配置用户 ERP 参数

迁移完成后，每个用户可以通过应用界面配置自己的 ERP 参数：

1. 登录应用
2. 进入设置页面
3. 配置个人 ERP 连接信息
4. 测试连接
5. 保存

## 故障排除

### 问题 1：字段已存在错误

```
Error: Duplicate column name 'ERP_URL'
```

**解决方案：** 字段已经存在，跳过添加步骤，直接执行步骤 3 初始化数据。

### 问题 2：连接被拒绝

```
Error: Access denied for user 'remote_user'@'%'
```

**解决方案：** 检查数据库用户权限，确保 `remote_user` 有 `ALTER` 和 `UPDATE` 权限。

### 问题 3：连接超时

```
Error: connect ETIMEDOUT
```

**解决方案：**

- 检查网络连接
- 确认 MySQL 服务器正在运行
- 检查防火墙设置

## 回滚方案

如果需要回滚，可以删除新增的字段：

```sql
-- ⚠️ 警告：这将永久删除 ERP 配置数据
ALTER TABLE dbo_BIPUsers DROP COLUMN ERP_URL;
ALTER TABLE dbo_BIPUsers DROP COLUMN ERP_Username;
ALTER TABLE dbo_BIPUsers DROP COLUMN ERP_Password;
```

## 完成确认

迁移完成后，请确认以下事项：

- [ ] 三个新字段已成功添加到 `dbo_BIPUsers` 表
- [ ] 所有现有用户的 ERP 配置已初始化
- [ ] 应用程序可以正常启动
- [ ] 数据提取和物料清理功能正常工作

---

**迁移脚本文件：**

- `src/main/services/user/migration/add-erp-params-to-bipusers-mysql.sql` - 完整 SQL 脚本
- `src/main/services/user/migration/run-migration.ts` - TypeScript 自动迁移脚本（需要网络访问）

**创建时间：** 2026-03-05

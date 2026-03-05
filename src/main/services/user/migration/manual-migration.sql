-- ============================================
-- BIPUsers 表迁移：添加 ERP 参数字段
-- 数据库：MySQL
-- 目标数据库：BLD_DB
-- ============================================
-- 使用说明：
-- 1. 在 MySQL Workbench / Navicat / DBeaver 中打开此文件
-- 2. 连接到数据库 192.168.31.83:3306/BLD_DB
-- 3. 执行全部 SQL 语句
-- ============================================

-- 切换到目标数据库
USE BLD_DB;

-- ============================================
-- 步骤 1: 添加新字段
-- ============================================

-- 添加 ERP_URL 字段（如果不存在）
-- 注意：如果 MySQL 版本不支持 ADD COLUMN IF NOT EXISTS，请移除 IF NOT EXISTS
ALTER TABLE dbo_BIPUsers 
ADD COLUMN ERP_URL VARCHAR(500) NULL COMMENT 'ERP 系统 URL';

-- 添加 ERP_Username 字段
ALTER TABLE dbo_BIPUsers 
ADD COLUMN ERP_Username VARCHAR(255) NULL COMMENT 'ERP 用户名';

-- 添加 ERP_Password 字段
ALTER TABLE dbo_BIPUsers 
ADD COLUMN ERP_Password VARCHAR(255) NULL COMMENT 'ERP 密码';

-- ============================================
-- 步骤 2: 验证字段已添加
-- ============================================

-- 显示表结构，确认新字段已添加
SELECT '字段添加验证' AS step;
DESCRIBE dbo_BIPUsers;

-- 或者使用以下查询确认新字段
SELECT 
  COLUMN_NAME AS '字段名',
  DATA_TYPE AS '数据类型',
  CHARACTER_MAXIMUM_LENGTH AS '最大长度',
  IS_NULLABLE AS '允许 NULL',
  COLUMN_COMMENT AS '注释'
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = 'BLD_DB'
  AND TABLE_NAME = 'dbo_BIPUsers'
  AND COLUMN_NAME IN ('ERP_URL', 'ERP_Username', 'ERP_Password')
ORDER BY COLUMN_NAME;

-- ============================================
-- 步骤 3: 初始化 ERP 配置
-- 注意：请根据实际情况修改下面的配置值！
-- ============================================

SELECT '=== 请修改下面的 ERP 配置值 ===' AS notice;
SELECT '当前数据库中的用户:' AS notice;
SELECT UserName, UserType, ComputerName FROM dbo_BIPUsers ORDER BY UserName;

-- 更新所有用户的 ERP 配置
-- ⚠️ 请修改下面的配置值为你实际的 ERP 凭证！
UPDATE dbo_BIPUsers 
SET 
  ERP_URL = 'https://68.11.34.30:8082/',        -- 修改为你的 ERP 系统 URL
  ERP_Username = 'your_erp_username',            -- 修改为你的 ERP 用户名
  ERP_Password = 'your_erp_password'             -- 修改为你的 ERP 密码
WHERE ERP_URL IS NULL OR ERP_URL = '';

-- 显示更新后的结果
SELECT 
  '更新后的 ERP 配置' AS notice,
  UserName,
  ERP_URL,
  ERP_Username
FROM dbo_BIPUsers
ORDER BY UserName;

-- ============================================
-- 步骤 4: 完成确认
-- ============================================

SELECT '================================' AS '';
SELECT '迁移完成！' AS message;
SELECT '================================' AS '';
SELECT '请确认：' AS notice;
SELECT '1. 所有用户都有 ERP_URL 配置' AS check1;
SELECT '2. ERP_URL 格式正确' AS check2;
SELECT '3. ERP 用户名和密码正确' AS check3;
SELECT '================================' AS '';

-- 统计信息
SELECT 
  COUNT(*) AS total_users,
  COUNT(ERP_URL) AS users_with_erp_url,
  COUNT(ERP_Username) AS users_with_erp_username
FROM dbo_BIPUsers;

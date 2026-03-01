# ERPAuto 用户指南

## 目录

1. [简介](#简介)
2. [安装指南](#安装指南)
3. [配置说明](#配置说明)
4. [使用指南](#使用指南)
5. [数据库设置](#数据库设置)
6. [常见问题](#常见问题)

---

## 简介

ERPAuto 是一个专为 ERP 系统设计的自动化工具，主要功能包括：

- **数据提取**：自动从 ERP 系统批量下载物料计划数据为 Excel 文件
- **物料清理**：自动删除指定订单的物料代码
- **数据库存储**：支持将提取的数据存储到 MySQL 或 SQL Server 数据库

---

## 安装指南

### 系统要求

- **操作系统**：Windows 10/11, macOS 10.15+, Linux
- **内存**：至少 4GB RAM
- **Node.js**：版本 18 或更高

### 安装步骤

1. **下载应用**
   - 从发布页面下载对应系统的安装包
   - Windows: `ERPAuto-Setup-x.x.x.exe`
   - macOS: `ERPAuto-x.x.x.dmg`
   - Linux: `ERPAuto-x.x.x.AppImage`

2. **安装**
   - Windows: 运行安装程序，按照提示完成安装
   - macOS: 将应用拖拽到 Applications 文件夹
   - Linux: 赋予执行权限后运行

3. **首次运行**
   - 启动应用
   - 首次运行需要先配置 ERP 连接信息

---

## 配置说明

### ERP 连接配置

应用需要配置 ERP 系统的连接信息。在主界面点击「设置」->「ERP 配置」：

| 配置项  | 说明           | 示例                          |
| ------- | -------------- | ----------------------------- |
| ERP URL | ERP 系统地址   | `https://192.168.1.100:8082/` |
| 用户名  | ERP 登录用户名 | `admin`                       |
| 密码    | ERP 登录密码   | `******`                      |

### 数据库配置（可选）

如需将提取的数据存储到数据库，需要配置数据库连接：

**MySQL 配置：**

| 配置项   | 默认值      | 说明             |
| -------- | ----------- | ---------------- |
| 主机     | `localhost` | MySQL 服务器地址 |
| 端口     | `3306`      | MySQL 端口       |
| 用户名   | `root`      | 数据库用户名     |
| 密码     | -           | 数据库密码       |
| 数据库名 | `erpauto`   | 数据库名称       |

**SQL Server 配置：**

| 配置项   | 默认值      | 说明               |
| -------- | ----------- | ------------------ |
| 服务器   | `localhost` | SQL Server 地址    |
| 端口     | `1433`      | SQL Server 端口    |
| 用户名   | `sa`        | 登录用户名         |
| 密码     | -           | 登录密码           |
| 数据库   | `erpauto`   | 数据库名称         |
| 加密     | `false`     | 是否启用 SSL 加密  |
| 信任证书 | `true`      | 是否信任服务器证书 |

---

## 使用指南

### 数据提取功能

**使用场景：** 从 ERP 系统批量下载多个订单的物料计划数据。

**操作步骤：**

1. 进入「数据提取」页面
2. 在左侧输入框中输入订单号，每行一个：
   ```
   SC70202602120085
   SC70202602120120
   SC70202602120137
   ```
3. 设置批量大小（建议 100-500）
4. 点击「开始提取」
5. 等待提取完成，查看结果统计

**提取结果说明：**

- **下载文件数**：成功下载的 Excel 文件数量
- **记录数**：提取的总记录数
- **错误数**：失败的订单数量

### 物料清理功能

**使用场景：** 删除指定订单中的特定物料代码。

**操作步骤：**

1. 进入「物料清理」页面
2. 输入订单号（每行一个）
3. 输入要删除的物料代码（每行一个）
4. **重要**：首次使用建议勾选「干运行模式」
5. 点击「开始清理」
6. 查看清理结果

**干运行模式：**

- 勾选后，系统仅预览将要删除的数据，不实际执行删除
- 建议先用干运行模式确认数据正确
- 确认无误后，取消勾选执行实际删除

**清理结果说明：**

- **处理订单数**：成功处理的订单数量
- **删除物料数**：实际删除的物料数量
- **跳过物料数**：未找到或跳过的物料数量
- **订单详情**：每个订单的详细处理结果

---

## 数据库设置

### MySQL 数据库初始化

```sql
CREATE DATABASE IF NOT EXISTS erpauto CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE erpauto;

-- 创建物料数据表
CREATE TABLE IF NOT EXISTS material_data (
    id INT AUTO_INCREMENT PRIMARY KEY,
    order_number VARCHAR(50) NOT NULL,
    material_code VARCHAR(100) NOT NULL,
    material_name VARCHAR(255),
    quantity DECIMAL(10, 2),
    unit VARCHAR(20),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_order (order_number),
    INDEX idx_material (material_code)
);
```

### SQL Server 数据库初始化

```sql
CREATE DATABASE erpauto;
GO

USE erpauto;
GO

-- 创建物料数据表
CREATE TABLE material_data (
    id INT IDENTITY(1,1) PRIMARY KEY,
    order_number NVARCHAR(50) NOT NULL,
    material_code NVARCHAR(100) NOT NULL,
    material_name NVARCHAR(255),
    quantity DECIMAL(10, 2),
    unit NVARCHAR(20),
    created_at DATETIME DEFAULT GETDATE()
);
GO

CREATE INDEX idx_order ON material_data(order_number);
CREATE INDEX idx_material ON material_data(material_code);
GO
```

---

## 常见问题

### 1. 无法登录 ERP 系统

**问题描述：** 点击登录后提示认证失败

**解决方法：**

1. 确认用户名和密码正确
2. 检查 ERP 系统是否可访问
3. 确认账号有足够权限

### 2. 提取时卡在加载中

**问题描述：** 点击提取后一直显示加载中

**解决方法：**

1. 检查网络连接
2. 减少批量大小
3. 确认 ERP 系统运行正常
4. 刷新页面后重试

### 3. 物料清理无数据

**问题描述：** 清理时显示没有可删除的数据

**解决方法：**

1. 确认订单号正确
2. 确认物料代码在该订单中存在
3. 先用干运行模式查看是否有匹配数据

### 4. 数据库连接失败

**问题描述：** 无法连接到数据库

**解决方法：**

1. 确认数据库服务已启动
2. 检查数据库配置信息
3. 确认防火墙允许数据库端口
4. 测试数据库连接：

   ```bash
   # MySQL
   mysql -h localhost -u root -p

   # SQL Server
   sqlcmd -S localhost -U sa
   ```

### 5. 应用闪退

**问题描述：** 应用启动后立即关闭

**解决方法：**

1. 查看日志文件获取错误信息
2. 重新安装应用
3. 确认系统满足最低要求
4. 尝试以管理员身份运行

---

## 技术支持

如有其他问题，请联系技术支持团队或提交 Issue。

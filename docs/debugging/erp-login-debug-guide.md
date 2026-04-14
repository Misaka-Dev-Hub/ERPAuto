# ERP 登录调试工具使用说明

## 目的

用于人工调试 ERP 登录流程，定位主界面特征元素，以便优化登录成功的判定逻辑。

## 前置准备

### 1. 配置 ERP 登录信息

编辑 `src/main/tools/erp-login-debug.ts` 文件，修改以下配置：

```typescript
const ERP_CONFIG = {
  url: 'https://your-erp-server.com', // ← 修改为你的 ERP 地址
  username: 'your_username', // ← 修改为你的用户名
  password: 'your_password' // ← 修改为你的密码
}
```

### 2. 确保 tsx 已安装

如果运行时报错提示找不到 `tsx`，请安装：

```bash
npm install -g tsx
# 或作为项目依赖
npm install --save-dev tsx
```

## 使用方法

### 方式一：使用 npm 脚本（推荐）

```bash
npm run debug:erp-login
```

### 方式二：直接运行

```bash
npx tsx src/main/tools/erp-login-debug.ts
```

## 调试流程

### 步骤 1：启动脚本

运行命令后，脚本会显示配置信息并等待你确认：

```
============================================================
ERP 登录调试工具
============================================================
目标 URL: https://your-erp-server.com
用户名：your_username
密码： ***
============================================================

操作步骤：
1. 浏览器将自动打开并尝试登录
2. 如果登录失败，请检查配置或手动重试
3. 登录成功后，会自动暂停并打开开发者工具
4. 使用元素选择器定位主界面特征元素
5. 记录元素选择器，按 Ctrl+C 退出脚本

按 Enter 键开始...
```

### 步骤 2：自动登录

脚本会自动执行：

- 打开浏览器
- 导航到登录页面
- 输入用户名和密码
- 点击登录按钮
- 处理强制登录确认对话框（如果有）

### 步骤 3：人工元素定位

登录成功后，脚本会暂停并显示：

```
============================================================
✓ 登录成功！
============================================================

现在进入调试模式，请进行以下操作：

1. 按 F12 打开浏览器开发者工具
2. 使用元素选择器 (Ctrl+Shift+C) 点击主界面特征元素
3. 在 Elements 面板中右键元素 → Copy → Copy selector
4. 或者使用 Playwright Inspector:
   - 在控制台输入：await page.pause()
   - 使用 Inspector 的元素选择工具

建议定位的特征元素：
- 主界面顶部导航栏
- 侧边菜单栏
- 主内容区域的唯一标识
- 用户信息显示区域
- 任何登录后独有的界面元素

============================================================
```

### 步骤 4：记录元素选择器

在开发者工具中：

1. **使用元素选择器** (Ctrl+Shift+C) 点击界面元素
2. **在 Elements 面板** 查看元素 HTML
3. **右键元素** → Copy → 选择以下之一：
   - `Copy selector` - CSS 选择器
   - `Copy XPath` - XPath 路径
   - `Copy JS path` - JavaScript 路径

### 步骤 5：更新 locators.ts

将找到的元素选择器添加到 `src/main/services/erp/locators.ts`：

```typescript
export const ERP_LOCATORS = {
  // ... 现有配置 ...

  // 新增：主界面特征元素（用于登录成功判定）
  mainPage: {
    topNavigationBar: '#top-nav', // 顶部导航栏
    sideMenu: '.side-menu', // 侧边菜单
    userProfile: '.user-profile', // 用户信息
    welcomeMessage: 'internal:has-text="欢迎"' // 欢迎消息
  }
}
```

### 步骤 6：退出脚本

按 `Ctrl+C` 终止脚本，浏览器会在 5 秒后自动关闭。

## Playwright Inspector 使用技巧

### 开启 Inspector

在脚本暂停时，在浏览器控制台输入：

```javascript
await page.pause()
```

会打开 Playwright Inspector，提供：

- 元素选择器
- 实时 locator 测试
- 代码生成

### 测试 Locator

在 Inspector 控制台测试 locator 是否有效：

```javascript
// 测试 CSS 选择器
await page.locator('#top-nav').count()

// 测试 role-based 选择器
await page.getByRole('navigation').count()

// 测试文本选择器
await page.getByText('欢迎').count()
```

如果返回数量 > 0，说明选择器有效。

## 推荐的特征元素

选择登录成功判定元素时，优先选择：

1. **唯一性** - 只在登录后出现
2. **稳定性** - 不易随版本变更
3. **易定位** - 有明确的 id、class 或文本

### 推荐元素示例

| 元素类型     | 选择器示例              | 说明                   |
| ------------ | ----------------------- | ---------------------- |
| 顶部导航栏   | `#top-nav`              | 登录后才会显示的主导航 |
| 用户菜单     | `.user-menu`            | 显示当前用户名的菜单   |
| 欢迎消息     | `text=欢迎`             | 包含用户名的欢迎语     |
| 工作台标题   | `h1:has-text("工作台")` | 主界面标题             |
| 功能模块网格 | `.module-grid`          | 功能模块入口区域       |

## 常见问题

### Q: 登录失败，提示找不到元素

**A**: 检查以下几点：

1. ERP URL 是否正确
2. 用户名密码是否正确
3. 网络连接是否正常
4. ERP 系统是否可访问
5. 是否需要验证码（如果 ERP 有验证码，需要手动输入）

### Q: 登录后没有暂停

**A**: 检查控制台输出，可能登录流程中抛出了异常。查看错误信息并修复。

### Q: 如何调试特定页面？

**A**: 修改脚本中的登录后逻辑，导航到特定页面：

```typescript
// 登录后导航到特定页面
await page.goto(`${ERP_CONFIG.url}/yonbip/sc`)
await page.waitForTimeout(3000)
```

### Q: 如何保存调试会话？

**A**: Playwright 支持录制 trace：

```typescript
await context.tracing.start({ screenshots: true, snapshots: true })
// ... 操作 ...
await context.tracing.stop({ path: 'trace.zip' })
```

然后使用 `npx playwright show-trace trace.zip` 查看。

## 下一步

找到稳定的主界面元素后，修改以下文件优化登录判定：

1. **更新 locators.ts** - 添加主界面元素定位器
2. **修改 erp-auth.ts** - 在登录成功后等待主界面元素
3. **更新测试** - 验证新的登录判定逻辑

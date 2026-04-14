# ERP 登录调试工具 - 快速参考

## 创建的文件

### 1. 调试脚本

**路径**: `src/main/tools/erp-login-debug.ts`

用途：人工调试 ERP 登录流程，定位主界面特征元素

### 2. 使用文档

**路径**: `docs/erp-login-debug-guide.md`

详细的调试工具使用说明

### 3. package.json 更新

添加了新的 npm 脚本和依赖：

- `debug:erp-login` - 运行调试脚本
- `debug:config-path` - 运行配置路径调试（已有）
- `tsx` - TypeScript 执行器依赖

## 快速开始

### 步骤 1：配置登录信息

编辑 `src/main/tools/erp-login-debug.ts` 第 19-23 行：

```typescript
const ERP_CONFIG = {
  url: 'https://your-erp-server.com', // ← 修改
  username: 'your_username', // ← 修改
  password: 'your_password' // ← 修改
}
```

### 步骤 2：运行调试

```bash
npm run debug:erp-login
```

### 步骤 3：定位元素

登录成功后：

1. 按 **F12** 打开开发者工具
2. 按 **Ctrl+Shift+C** 启用元素选择器
3. 点击主界面特征元素
4. 右键 → Copy → Copy selector

### 步骤 4：更新定位器

将找到的元素添加到 `src/main/services/erp/locators.ts`：

```typescript
export const ERP_LOCATORS = {
  // ... 现有配置 ...

  // 新增：主界面特征元素
  mainPage: {
    // 在此添加找到的元素
    topNav: '#top-nav',
    userMenu: '.user-menu'
  }
}
```

## 脚本功能

### 自动执行

- ✅ 启动浏览器（可见窗口，非无头模式）
- ✅ 导航到登录页面
- ✅ 输入用户名和密码
- ✅ 点击登录按钮
- ✅ 处理强制登录确认对话框

### 调试支持

- ✅ 登录成功后自动暂停
- ✅ 保持浏览器打开
- ✅ 支持 F12 开发者工具
- ✅ 支持 Playwright Inspector

### 安全特性

- ✅ 密码显示为星号
- ✅ 需要按 Enter 确认后才开始
- ✅ 退出前 5 秒缓冲时间

## 常用命令

```bash
# 运行调试脚本
npm run debug:erp-login

# 或使用 npx 直接运行
npx tsx src/main/tools/erp-login-debug.ts

# 查看帮助
npx tsx --help
```

## 调试技巧

### 测试 Locator 有效性

在浏览器控制台（登录后暂停时）：

```javascript
// 测试 CSS 选择器
await page.locator('#top-nav').count()

// 测试文本选择器
await page.getByText('欢迎').isVisible()

// 测试 role 选择器
await page.getByRole('navigation').count()
```

返回值 > 0 或 true 表示选择器有效。

### 查看元素详细信息

```javascript
// 获取元素 HTML
const element = await page.$('#top-nav')
console.log(await element.innerHTML())

// 获取元素属性
console.log(await element.getAttributes())
```

### 截图保存

```javascript
// 全屏截图
await page.screenshot({ path: 'login-success.png' })

// 元素截图
const element = await page.$('#top-nav')
await element.screenshot({ path: 'top-nav.png' })
```

## 推荐的特征元素

选择登录成功判定元素的标准：

| 标准       | 说明           | 示例                |
| ---------- | -------------- | ------------------- |
| **唯一性** | 只在登录后出现 | 用户菜单、工作台    |
| **稳定性** | 不易随版本变更 | ID 选择器优于 class |
| **易定位** | 有明确的标识   | 有 id、独特文本     |

### 推荐元素类型

1. **顶部导航栏** - `#top-nav`, `.navbar`
2. **用户信息区域** - `.user-info`, `.user-menu`
3. **欢迎消息** - 包含用户名的文本
4. **功能模块入口** - 主界面的模块网格
5. **侧边菜单栏** - `.sidebar`, `.menu`

## 故障排查

### 问题：脚本启动后立即退出

**原因**: tsx 未安装

**解决**:

```bash
npm install
```

### 问题：找不到用户名/密码输入框

**原因**:

1. ERP URL 不正确
2. 页面结构已变更
3. 登录页面加载超时

**解决**:

1. 检查 ERP_CONFIG.url 是否正确
2. 手动打开 URL 确认页面结构
3. 增加 timeout 值（第 25 行）

### 问题：登录后没有暂停

**原因**: 登录流程抛出异常

**解决**: 查看控制台错误信息，检查：

- 网络连接
- ERP 系统可用性
- 用户名密码正确性

### 问题：无法定位元素

**原因**:

1. 元素在 iframe 中
2. 元素动态加载
3. 选择器不正确

**解决**:

1. 检查元素是否在嵌套 iframe 中
2. 增加等待时间 `await page.waitForTimeout(2000)`
3. 使用更具体的选择器

## 下一步

找到稳定的主界面元素后：

1. **更新 locators.ts**
   - 添加 `mainPage` 配置节
   - 定义登录成功判定元素

2. **修改 erp-auth.ts**
   - 在 `login()` 方法末尾
   - 等待主界面元素出现
   - 作为登录成功的最终判定

3. **验证修改**
   - 重新运行调试脚本
   - 确认新的判定逻辑有效
   - 更新相关文档

## 相关文件

| 文件                                | 用途       |
| ----------------------------------- | ---------- |
| `src/main/tools/erp-login-debug.ts` | 调试脚本   |
| `src/main/services/erp/locators.ts` | 元素定位器 |
| `src/main/services/erp/erp-auth.ts` | 登录服务   |
| `docs/erp-login-debug-guide.md`     | 详细文档   |

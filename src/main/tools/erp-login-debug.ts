/**
 * ERP 登录调试脚本
 *
 * 用途：人工调试 ERP 登录流程，定位主界面特征元素
 * 使用方式：
 *   1. 修改下方的 ERP_CONFIG 配置（URL、用户名、密码）
 *   2. 运行：npx ts-node src/main/tools/erp-login-debug.ts
 *   3. 登录后会自动暂停，打开 Playwright Inspector 进行元素定位
 *   4. 在 Inspector 中点击主界面元素，获取选择器
 *   5. 将找到的元素选择器添加到 locators.ts
 *
 * 调试模式说明：
 *   - headless: false - 显示浏览器窗口
 *   - slowMo: 100 - 放慢操作速度便于观察
 *   - debugger 语句会暂停执行，打开开发者工具
 */

import { chromium } from 'playwright'
import _path from 'path'

// ==================== 配置区域 ====================
const ERP_CONFIG = {
  url: 'https://68.11.34.30:8082/', // ← 修改为你的 ERP 地址
  username: 'BLDpengqiangqiang', // ← 修改为你的用户名
  password: 'Cqbld123456.' // ← 修改为你的密码
}

// 调试配置
const DEBUG_CONFIG = {
  headless: false, // 必须为 false，需要看到浏览器
  slowMo: 100, // 操作间隔（毫秒）
  timeout: 60000 // 超时时间（毫秒）
}
// ================================================

async function debugErpLogin(): Promise<void> {
  console.log('='.repeat(60))
  console.log('ERP 登录调试工具')
  console.log('='.repeat(60))
  console.log('目标 URL:', ERP_CONFIG.url)
  console.log('用户名:', ERP_CONFIG.username)
  console.log('密码:', '***'.repeat(ERP_CONFIG.password.length))
  console.log('='.repeat(60))
  console.log()
  console.log('操作步骤：')
  console.log('1. 浏览器将自动打开并尝试登录')
  console.log('2. 如果登录失败，请检查配置或手动重试')
  console.log('3. 登录成功后，会自动暂停并打开开发者工具')
  console.log('4. 使用元素选择器定位主界面特征元素')
  console.log('5. 记录元素选择器，按 Ctrl+C 退出脚本')
  console.log()
  console.log('按 Enter 键开始...')

  // 等待用户确认
  await new Promise<void>((resolve) => {
    process.stdin.resume()
    process.stdin.once('data', () => {
      process.stdin.pause()
      resolve()
    })
  })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let browser: any = null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let context: any = null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let page: any = null

  try {
    console.log('\n正在启动浏览器...')

    // 启动浏览器（带调试配置）
    browser = await chromium.launch({
      headless: DEBUG_CONFIG.headless,
      slowMo: DEBUG_CONFIG.slowMo,
      args: ['--ignore-certificate-errors', '--ignore-ssl-errors', '--disable-web-security']
    })

    context = await browser.newContext({
      acceptDownloads: true,
      viewport: { width: 1920, height: 1080 },
      ignoreHTTPSErrors: true,
      javaScriptEnabled: true
    })

    page = await context.newPage()

    // 启用详细的控制台日志
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    page.on('console', (msg: any) => {
      console.log(`[Page Console] ${msg.type()}: ${msg.text()}`)
    })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    page.on('pageerror', (error: any) => {
      console.error(`[Page Error] ${error.message}`)
    })

    // 导航到登录页面
    const loginUrl = `${ERP_CONFIG.url}/yonbip/resources/uap/rbac/login/main/index.html`
    console.log(`正在加载登录页面：${loginUrl}`)
    await page.goto(loginUrl, { timeout: DEBUG_CONFIG.timeout })
    await page.waitForLoadState('domcontentloaded')
    console.log('登录页面已加载')

    // 等待并定位登录表单 iframe
    console.log('等待登录表单...')
    await page.waitForSelector('#forwardFrame', { state: 'attached', timeout: 15000 })
    const frameLocator = page.locator('#forwardFrame')
    const contentFrame = await frameLocator.contentFrame()

    if (!contentFrame) {
      throw new Error('无法访问 forwardFrame 内容框架')
    }

    const mainFrame = contentFrame
    console.log('登录表单框架已就绪')

    // 填充用户名
    console.log('正在输入用户名...')
    try {
      const usernameInput = mainFrame.getByRole('textbox', { name: '用户名' })
      await usernameInput.waitFor({ state: 'visible', timeout: 5000 })
      await usernameInput.fill(ERP_CONFIG.username)
      console.log('用户名已输入')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (e: any) {
      console.error('找不到用户名输入框:', e.message)
      throw new Error('找不到用户名输入框，请检查页面结构是否改变')
    }

    // 填充密码
    console.log('正在输入密码...')
    try {
      const passwordInput = mainFrame.getByRole('textbox', { name: '密码' })
      await passwordInput.waitFor({ state: 'visible', timeout: 5000 })
      await passwordInput.fill(ERP_CONFIG.password)
      console.log('密码已输入')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (e: any) {
      console.error('找不到密码输入框:', e.message)
      throw new Error('找不到密码输入框，请检查页面结构是否改变')
    }
    await page.pause()
    // 点击登录按钮
    console.log('正在点击登录按钮...')
    try {
      const loginButton = mainFrame.getByRole('button', { name: '登录' })
      await loginButton.waitFor({ state: 'visible', timeout: 5000 })
      await loginButton.click()
      console.log('已点击登录按钮')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (e: any) {
      console.error('找不到登录按钮:', e.message)
      throw new Error('找不到登录按钮，请检查页面结构是否改变')
    }

    // 等待页面加载
    console.log('等待登录响应...')
    await page.waitForLoadState('domcontentloaded', { timeout: 10000 })
    await page.waitForTimeout(2000) // 额外等待，确保页面完全加载

    // 处理强制登录确认对话框
    try {
      const confirmBtn = mainFrame.getByRole('button', { name: '确定' })
      const count = await confirmBtn.count()
      if (count > 0) {
        console.log('检测到强制登录确认对话框，正在确认...')
        await confirmBtn.first().click()
        await page.waitForTimeout(2000)
        console.log('已确认强制登录')
      } else {
        console.log('普通登录，无需确认')
      }
    } catch {
      console.log('未检测到确认对话框')
    }

    // ==================== 登录成功，进入调试模式 ====================
    console.log()
    console.log('='.repeat(60))
    console.log('✓ 登录成功！')
    console.log('='.repeat(60))
    console.log()
    console.log('现在进入调试模式，请进行以下操作：')
    console.log()
    console.log('1. 按 F12 打开浏览器开发者工具')
    console.log('2. 使用元素选择器 (Ctrl+Shift+C) 点击主界面特征元素')
    console.log('3. 在 Elements 面板中右键元素 → Copy → Copy selector')
    console.log('4. 或者使用 Playwright Inspector:')
    console.log('   - 在控制台输入: await page.pause()')
    console.log('   - 使用 Inspector 的元素选择工具')
    console.log()
    console.log('建议定位的特征元素：')
    console.log('- 主界面顶部导航栏')
    console.log('- 侧边菜单栏')
    console.log('- 主内容区域的唯一标识')
    console.log('- 用户信息显示区域')
    console.log('- 任何登录后独有的界面元素')
    console.log()
    console.log('按 Ctrl+C 退出脚本')
    console.log('='.repeat(60))

    // 保持浏览器打开，等待用户调试
    // 使用 pause 可以让用户手动恢复或使用 Inspector
    await page.pause()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (error: any) {
    console.error()
    console.error('='.repeat(60))
    console.error('错误:', error.message)
    console.error('='.repeat(60))
    console.error()
    console.error('调试提示：')
    console.error('1. 检查 ERP_CONFIG 配置是否正确')
    console.error('2. 检查网络连接')
    console.error('3. 确认 ERP 系统可访问')
    console.error('4. 如果是元素找不到，可能需要更新 locators.ts')
  } finally {
    // 清理资源（给用户时间保存信息）
    console.log()
    console.log('等待 5 秒后关闭浏览器...')
    await new Promise((resolve) => setTimeout(resolve, 5000))

    if (context) {
      await context.close()
    }
    if (browser) {
      await browser.close()
    }
    console.log('浏览器已关闭')
    process.exit(0)
  }
}

// 运行调试脚本
debugErpLogin().catch((err) => {
  console.error('脚本执行失败:', err)
  process.exit(1)
})

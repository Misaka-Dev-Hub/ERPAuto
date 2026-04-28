import type { FrameLocator, Locator, Page } from 'playwright'
import type { ErpSession } from '../../../types/erp.types'
import { ERP_LOCATORS } from '../locators'
import { capturePageContext } from '../erp-error-context'
import type { QueryResultRow } from './types'

type CleanerLogger = {
  debug: (message: string, meta?: Record<string, unknown>) => void
  info: (message: string, meta?: Record<string, unknown>) => void
  warn: (message: string, meta?: Record<string, unknown>) => void
  error: (message: string, meta?: Record<string, unknown>) => void
  verbose: (message: string, meta?: Record<string, unknown>) => void
}

export interface DetailOpenOptions {
  orderNumber?: string
  orderIndex?: number
  orderPosition?: string
  workerId?: number
}

export interface PageStateSnapshotOptions extends DetailOpenOptions {
  level?: 'info' | 'warn' | 'error' | 'debug'
  elapsedMs?: number
}

type LogPageStateSnapshot = (
  page: Page,
  step: string,
  options?: PageStateSnapshotOptions
) => Promise<unknown>

export class CleanerNavigation {
  constructor(
    private readonly log: CleanerLogger,
    private readonly logPageStateSnapshot: LogPageStateSnapshot
  ) {}

  async navigateToCleanerPage(
    session: ErpSession
  ): Promise<{ popupPage: Page; workFrame: FrameLocator }> {
    const { page, mainFrame } = session
    const navStartTime = Date.now()

    this.log.info('开始导航到清理页面', {
      sessionAvailable: !!session,
      hasPage: !!page,
      hasMainFrame: !!mainFrame
    })

    this.log.debug('[导航 Step 1] 准备点击菜单图标')
    await mainFrame.locator('i').first().click()
    this.log.debug('[导航 Step 1 完成] 菜单图标已点击', {
      elapsedMs: Date.now() - navStartTime
    })

    this.log.debug('[导航 Step 2] 等待弹出窗口并点击菜单项')
    const popupPromise = page.waitForEvent('popup')
    await mainFrame.getByTitle('离散生产订单维护', { exact: true }).first().click()
    const popupPage = await popupPromise
    this.log.debug('[导航 Step 2 完成] 弹出窗口已打开', {
      elapsedMs: Date.now() - navStartTime,
      popupOpened: !!popupPage
    })
    await this.logPageStateSnapshot(popupPage, 'nav.popup_opened', {
      level: 'info',
      elapsedMs: Date.now() - navStartTime
    })

    this.log.debug('[导航 Step 3] 获取 forwardFrame 框架')
    const forwardFrameLocator = popupPage.locator('#forwardFrame')
    const fFrame = forwardFrameLocator.contentFrame()
    this.log.debug('[导航 Step 3 完成] forwardFrame 已获取', {
      elapsedMs: Date.now() - navStartTime,
      frameExists: !!fFrame
    })

    if (!fFrame) {
      this.log.error('[导航失败] forwardFrame 为空', {
        elapsedMs: Date.now() - navStartTime,
        pageUrl: popupPage.url(),
        contextData: await capturePageContext(
          popupPage,
          undefined,
          'nav.forwardFrame',
          undefined,
          undefined,
          'nav_forward_frame'
        )
      })
      throw new Error('无法访问弹出窗口的 forwardFrame')
    }

    this.log.debug('[导航 Step 4] 等待并获取 mainiframe 内部框架', { timeout: 30000 })
    const innerFrameLocator = fFrame.locator('#mainiframe')
    await innerFrameLocator.waitFor({ state: 'visible', timeout: 30000 })
    const workFrame = innerFrameLocator.contentFrame()
    this.log.debug('[导航 Step 4 完成] 内部工作框架已获取', {
      elapsedMs: Date.now() - navStartTime,
      frameExists: !!workFrame
    })

    if (!workFrame) {
      this.log.error('[导航失败] workFrame 为空', {
        elapsedMs: Date.now() - navStartTime,
        pageUrl: popupPage.url(),
        contextData: await capturePageContext(
          popupPage,
          undefined,
          'nav.workFrame',
          undefined,
          undefined,
          'nav_work_frame'
        )
      })
      throw new Error('无法访问内部工作框架')
    }

    this.log.debug('[导航 Step 5] 等待页面就绪标志', {
      selector: '#hot-key-head_list',
      timeout: 30000
    })
    await workFrame.locator('#hot-key-head_list').waitFor({ state: 'visible', timeout: 30000 })
    const totalNavTime = Date.now() - navStartTime
    await this.logPageStateSnapshot(popupPage, 'nav.cleaner_page_ready', {
      level: 'info',
      elapsedMs: totalNavTime
    })
    this.log.info('[导航完成] 已导航到清理页面', {
      totalNavTimeMs: totalNavTime,
      isSlow: totalNavTime > 5000
    })

    return { popupPage, workFrame }
  }

  async setupQueryInterface(innerFrame: FrameLocator, popupPage: Page): Promise<void> {
    const setupStartTime = Date.now()
    this.log.debug('[查询界面设置开始] 准备配置查询界面')
    await this.logPageStateSnapshot(popupPage, 'query.setup.start', {
      level: 'debug',
      elapsedMs: 0
    })

    this.log.debug('[查询设置 Step 1] 点击搜索图标')
    await innerFrame.locator('.search-name-wrapper > .iconfont').click()
    this.log.debug('[查询设置 Step 1 完成] 搜索图标已点击', {
      elapsedMs: Date.now() - setupStartTime
    })

    this.log.debug('[查询设置 Step 2] 选择订单号查询模式')
    await innerFrame.getByText('订单号查询').click()
    this.log.debug('[查询设置 Step 2 完成] 已切换到订单号查询', {
      elapsedMs: Date.now() - setupStartTime
    })

    this.log.debug('[查询设置 Step 3] 切换到全部标签页')
    await innerFrame.getByRole('tab', { name: '全部' }).click()
    this.log.debug('[查询设置 Step 3 完成] 已全部标签页激活', {
      elapsedMs: Date.now() - setupStartTime
    })

    this.log.debug('[查询设置 Step 4] 设置查询数量限制为 5000')
    const inputEl = innerFrame.locator('#rc_select_0')
    await inputEl.fill('5000')
    await inputEl.press('Enter')
    const totalSetupTime = Date.now() - setupStartTime
    await this.logPageStateSnapshot(popupPage, 'query.setup.ready', {
      level: 'info',
      elapsedMs: totalSetupTime
    })
    this.log.debug('[查询设置完成] 查询界面配置完毕', {
      totalSetupTimeMs: totalSetupTime,
      queryLimit: 5000,
      isSlow: totalSetupTime > 2000
    })
  }

  async queryOrders(
    workFrame: FrameLocator,
    popupPage: Page,
    orderNumbers: string[]
  ): Promise<void> {
    const queryStartTime = Date.now()
    this.log.debug('[订单查询开始]', {
      orderCount: orderNumbers.length,
      orderNumbers: orderNumbers
        .slice(0, 5)
        .concat(orderNumbers.length > 5 ? [`... (${orderNumbers.length - 5} more)`] : []),
      isPreview: orderNumbers.length > 5
    })
    await this.logPageStateSnapshot(popupPage, 'query.before_submit', {
      level: 'debug',
      elapsedMs: 0
    })

    const textbox = workFrame.getByRole('textbox', { name: '生产订单号' })
    this.log.debug('[订单查询] 准备填入订单号')
    await textbox.fill(orderNumbers.join(','))
    this.log.debug('[订单查询] 订单号已填入', {
      elapsedMs: Date.now() - queryStartTime,
      charCount: orderNumbers.join(',').length
    })

    this.log.debug('[订单查询] 点击搜索按钮')
    await workFrame.locator('.search-component-searchBtn').click()
    this.log.info('[订单查询完成] 查询请求已发送', {
      elapsedMs: Date.now() - queryStartTime,
      orderCount: orderNumbers.length
    })
    await this.logPageStateSnapshot(popupPage, 'query.after_submit', {
      level: 'info',
      elapsedMs: Date.now() - queryStartTime
    })
  }

  async collectQueryResultRows(
    workFrame: FrameLocator,
    popupPage: Page
  ): Promise<QueryResultRow[]> {
    const collectStartTime = Date.now()
    this.log.debug('[查询结果收集开始] 准备读取查询结果表格')

    const rows = workFrame.locator('tbody tr')
    const rowCount = await rows.count()
    this.log.debug('[查询结果收集] 检测到表格行数', { rowCount })

    const result: QueryResultRow[] = []
    let validOrderCount = 0
    let invalidOrderCount = 0

    for (let rowIndex = 0; rowIndex < rowCount; rowIndex++) {
      const row = rows.nth(rowIndex)
      const orderNumber = await this.extractOrderNumberFromQueryRow(row)
      if (!this.isOrderNumber(orderNumber)) {
        invalidOrderCount++
        if (invalidOrderCount <= 3) {
          this.log.warn('[查询结果] 跳过无效订单号行', { rowIndex, extractedValue: orderNumber })
        }
        continue
      }
      validOrderCount++
      result.push({ rowIndex, orderNumber })
    }

    const totalCollectTime = Date.now() - collectStartTime
    await this.logPageStateSnapshot(popupPage, 'query.results.collected', {
      level: 'info',
      elapsedMs: totalCollectTime
    })
    this.log.info('[查询结果收集完成]', {
      totalRowsScanned: rowCount,
      validOrderCount,
      invalidOrderCount,
      elapsedMs: totalCollectTime,
      isSlow: totalCollectTime > 3000
    })

    return result
  }

  async openDetailPageFromRow(
    workFrame: FrameLocator,
    popupPage: Page,
    rowIndex: number,
    options?: DetailOpenOptions
  ): Promise<Page> {
    const openStartTime = Date.now()
    const row = workFrame.locator('tbody tr').nth(rowIndex)
    await row.waitFor({ state: 'visible', timeout: 15000 })
    this.log.info('[NAV_EVENT] 准备从查询结果打开详情页', {
      step: 'detail.open.from_query_row',
      rowIndex,
      orderNumber: options?.orderNumber,
      orderIndex: options?.orderIndex,
      orderPosition: options?.orderPosition,
      workerId: options?.workerId
    })
    await this.logPageStateSnapshot(popupPage, 'detail.open.from_query_row.before_click', {
      level: 'debug',
      orderNumber: options?.orderNumber,
      orderIndex: options?.orderIndex,
      orderPosition: options?.orderPosition,
      workerId: options?.workerId,
      elapsedMs: Date.now() - openStartTime
    })

    const moreButton = row.locator('a.row-more').first()
    await moreButton.scrollIntoViewIfNeeded()

    const detailPagePromise = popupPage.waitForEvent('popup')
    await moreButton.click()
    await this.clickMaterialPlanMenu(workFrame, popupPage, options)

    const detailPage = await detailPagePromise
    this.log.info('[POPUP_EVENT] 详情页弹窗已创建', {
      step: 'detail.popup.opened',
      rowIndex,
      orderNumber: options?.orderNumber,
      orderIndex: options?.orderIndex,
      orderPosition: options?.orderPosition,
      workerId: options?.workerId,
      popupUrl: detailPage.url(),
      elapsedMs: Date.now() - openStartTime
    })
    await this.logPageStateSnapshot(detailPage, 'detail.popup.opened', {
      level: 'info',
      orderNumber: options?.orderNumber,
      orderIndex: options?.orderIndex,
      orderPosition: options?.orderPosition,
      workerId: options?.workerId,
      elapsedMs: Date.now() - openStartTime
    })
    return detailPage
  }

  async openDetailPageFromCurrentQuery(
    workFrame: FrameLocator,
    popupPage: Page,
    orderNumber?: string
  ): Promise<Page> {
    const openStartTime = Date.now()
    const firstRow = workFrame.locator('tbody tr').first()
    await firstRow.waitFor({ state: 'visible', timeout: 10000 })
    this.log.info('[NAV_EVENT] 准备从当前查询结果打开详情页', {
      step: 'detail.open.from_current_query',
      orderNumber
    })
    await this.logPageStateSnapshot(popupPage, 'detail.open.from_current_query.before_click', {
      level: 'debug',
      orderNumber,
      elapsedMs: Date.now() - openStartTime
    })

    const moreButton = firstRow.locator('a.row-more').first()
    const detailPagePromise = popupPage.waitForEvent('popup')
    await moreButton.click()
    await this.clickMaterialPlanMenu(workFrame, popupPage, { orderNumber })

    const detailPage = await detailPagePromise
    this.log.info('[POPUP_EVENT] 详情页弹窗已创建', {
      step: 'detail.popup.opened.retry',
      orderNumber,
      popupUrl: detailPage.url(),
      elapsedMs: Date.now() - openStartTime
    })
    await this.logPageStateSnapshot(detailPage, 'detail.popup.opened.retry', {
      level: 'info',
      orderNumber,
      elapsedMs: Date.now() - openStartTime
    })
    return detailPage
  }

  async waitForLoading(frame: FrameLocator): Promise<void> {
    const loadingLocator = frame
      .locator('div')
      .filter({ hasText: ERP_LOCATORS.extractor.loadingText })
      .nth(1)

    try {
      await loadingLocator.waitFor({ state: 'visible', timeout: 3000 })
      await loadingLocator.waitFor({ state: 'hidden', timeout: 60000 })
    } catch {
      // Loading completed quickly or never appeared
    }
  }

  private async extractOrderNumberFromQueryRow(row: Locator): Promise<string> {
    try {
      const cell = row.locator('td[colkey="vbillcode"]')
      const codeLink = cell.locator('.code-detail-link').first()
      const linkCount = await codeLink.count()

      this.log.verbose('[提取订单号] 尝试从行提取订单号', {
        hasLink: linkCount > 0,
        extractionMethod: linkCount > 0 ? 'link' : 'cellText'
      })

      const rawValue = linkCount > 0 ? await codeLink.innerText() : await cell.innerText()
      const value = rawValue.trim()
      const match = value.match(/SC\d{14}/)
      const extracted = match ? match[0] : value

      this.log.verbose('[提取订单号完成]', {
        rawValue,
        extracted,
        matched: !!match
      })

      return extracted
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      this.log.warn('[提取订单号失败] 提取过程发生错误', {
        error: message,
        fallback: 'empty string'
      })
      return ''
    }
  }

  private async clickMaterialPlanMenu(
    workFrame: FrameLocator,
    popupPage: Page,
    options?: DetailOpenOptions
  ): Promise<void> {
    const candidates = [
      workFrame.locator('li:visible, a:visible, span:visible, div:visible').filter({
        hasText: /^备料计划$/
      }),
      workFrame.getByRole('menuitem', { name: '备料计划' }),
      workFrame.getByText('备料计划', { exact: true }),
      workFrame.getByText('备料计划')
    ]

    for (const candidate of candidates) {
      const target = candidate.last()
      try {
        await target.waitFor({ state: 'visible', timeout: 2000 })
        this.log.info('[NAV_EVENT] 点击备料计划菜单', {
          step: 'detail.menu.material_plan',
          orderNumber: options?.orderNumber,
          orderIndex: options?.orderIndex,
          orderPosition: options?.orderPosition,
          workerId: options?.workerId
        })
        await target.click()
        await this.logPageStateSnapshot(popupPage, 'detail.menu.material_plan.clicked', {
          level: 'debug',
          orderNumber: options?.orderNumber,
          orderIndex: options?.orderIndex,
          orderPosition: options?.orderPosition,
          workerId: options?.workerId
        })
        return
      } catch {
        // Try next locator candidate
      }
    }

    this.log.error('Failed to locate material plan menu item', {
      selectorsAttempted: candidates.length
    })
    throw new Error('无法定位”备料计划”菜单项（可能菜单结构已变化）')
  }

  private isOrderNumber(value: string): boolean {
    return /^SC\d{14}$/.test(value)
  }
}

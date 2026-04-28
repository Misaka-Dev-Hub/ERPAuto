import type { BrowserContext, FrameLocator, Locator, Page } from 'playwright'
import {
  DeletionOutcome,
  type CleanerProgress,
  type OrderCleanDetail
} from '../../../types/cleaner.types'
import { capturePageContext } from '../erp-error-context'
import { capturePageState } from '../page-state'
import type { MaterialDeletionVerifier } from './material-deletion-verifier'
import { getSkipReason, shouldDeleteMaterial } from './rules'
import type { ProgressState } from './types'
import { delay } from './utils'

type CleanerLogger = {
  debug: (message: string, meta?: Record<string, unknown>) => void
  info: (message: string, meta?: Record<string, unknown>) => void
  warn: (message: string, meta?: Record<string, unknown>) => void
  error: (message: string, meta?: Record<string, unknown>) => void
  verbose: (message: string, meta?: Record<string, unknown>) => void
}

export class CleanerOrderDetailProcessor {
  constructor(
    private readonly log: CleanerLogger,
    private readonly deletionVerifier: MaterialDeletionVerifier,
    private readonly getBrowserContext: () => BrowserContext | undefined
  ) {}

  async processDetailPage(params: {
    detailPage: Page
    deleteSet: Set<string>
    dryRun: boolean
    progressState: ProgressState
    expectedOrderNumber?: string
    onProgress?: (message: string, progress?: number, extra?: Partial<CleanerProgress>) => void
  }): Promise<OrderCleanDetail> {
    const { detailPage, deleteSet, dryRun, progressState, expectedOrderNumber, onProgress } = params
    const processStartTime = Date.now()

    this.log.info('[ORDER_START] 开始处理订单', {
      orderIndex: progressState.ordersStarted,
      orderPosition: `${progressState.ordersStarted + 1}/${progressState.totalOrders}`,
      orderNumber: expectedOrderNumber,
      phase: 'starting',
      elapsedMs: Date.now() - processStartTime
    })

    this.log.info('[订单详情处理开始]', {
      expectedOrderNumber,
      dryRun,
      deleteSetSize: deleteSet.size,
      ordersStarted: progressState.ordersStarted,
      ordersCompleted: progressState.ordersCompleted,
      totalOrders: progressState.totalOrders
    })

    let detailCount = 0
    const detail: OrderCleanDetail = {
      orderNumber: expectedOrderNumber || 'UNKNOWN',
      materialsDeleted: 0,
      materialsSkipped: 0,
      errors: [],
      skippedMaterials: [],
      deletedMaterials: [],
      retryCount: 0,
      retryAttempts: [],
      retriedAt: undefined,
      retrySuccess: false,
      materialsFailed: 0,
      failedMaterials: [],
      uncertainDeletions: 0
    }

    try {
      await this.logPageStateSnapshot(detailPage, 'detail.page.opened', {
        level: 'debug',
        orderNumber: expectedOrderNumber,
        orderIndex: progressState.ordersStarted,
        orderPosition: `${progressState.ordersStarted + 1}/${progressState.totalOrders}`,
        elapsedMs: Date.now() - processStartTime
      })

      this.log.debug('[详情页面 Step 1] 准备访问 forwardFrame')
      await this.ensureNotRedirectedToLoginPage(
        detailPage,
        'detail.step1.forwardFrame',
        expectedOrderNumber,
        progressState,
        Date.now() - processStartTime
      )
      const detailMainFrame = detailPage.locator('#forwardFrame')
      const dFrame = await detailMainFrame.contentFrame()

      if (!dFrame) {
        const pageState = await this.logPageStateSnapshot(detailPage, 'detail.step1.forwardFrame', {
          level: 'error',
          orderNumber: expectedOrderNumber,
          orderIndex: progressState.ordersStarted,
          orderPosition: `${progressState.ordersStarted + 1}/${progressState.totalOrders}`,
          elapsedMs: Date.now() - processStartTime,
          includeFrameHierarchy: true,
          includeBodyTextPreview: true
        })
        const errorMsg = '无法访问详情页面的 forwardFrame'
        this.log.error('[DETAIL_PAGE_INVALID] 详情页未建立', {
          failureKind: 'forward_frame_missing',
          ...pageState,
          contextData: await capturePageContext(
            detailPage,
            undefined,
            'processDetail.forwardFrame',
            expectedOrderNumber,
            undefined,
            'process_detail_forward_frame'
          )
        })
        throw new Error(errorMsg)
      }
      this.log.debug('[详情页面 Step 1 完成] forwardFrame 已获取', {
        elapsedMs: Date.now() - processStartTime
      })

      this.log.debug('[详情页面 Step 2] 等待并获取 mainiframe 内部框架', { timeout: 30000 })
      await this.ensureNotRedirectedToLoginPage(
        detailPage,
        'detail.step2.mainiframe',
        expectedOrderNumber,
        progressState,
        Date.now() - processStartTime
      )
      const detailInnerLocator = dFrame.locator('#mainiframe')
      try {
        await detailInnerLocator.waitFor({ state: 'visible', timeout: 30000 })
      } catch (error) {
        const pageState = await this.logPageStateSnapshot(detailPage, 'detail.step2.mainiframe', {
          level: 'error',
          orderNumber: expectedOrderNumber,
          orderIndex: progressState.ordersStarted,
          orderPosition: `${progressState.ordersStarted + 1}/${progressState.totalOrders}`,
          elapsedMs: Date.now() - processStartTime,
          includeFrameHierarchy: true,
          includeBodyTextPreview: true
        })
        this.log.error('[DETAIL_PAGE_TIMEOUT] 详情页等待超时', {
          failureKind: pageState.isCasLoginRedirect ? 'redirected_to_cas' : 'mainiframe_missing',
          ...pageState,
          error: error instanceof Error ? error.message : String(error)
        })
        throw error
      }
      const detailInnerFrame = await detailInnerLocator.contentFrame()

      if (!detailInnerFrame) {
        const pageState = await this.logPageStateSnapshot(
          detailPage,
          'detail.step2.detailInnerFrame',
          {
            level: 'error',
            orderNumber: expectedOrderNumber,
            orderIndex: progressState.ordersStarted,
            orderPosition: `${progressState.ordersStarted + 1}/${progressState.totalOrders}`,
            elapsedMs: Date.now() - processStartTime,
            includeFrameHierarchy: true,
            includeBodyTextPreview: true
          }
        )
        const errorMsg = '无法访问详情页面的内部框架'
        this.log.error('[DETAIL_PAGE_INVALID] 详情页未建立', {
          failureKind: 'mainiframe_missing',
          ...pageState,
          contextData: await capturePageContext(
            detailPage,
            undefined,
            'processDetail.detailInnerFrame',
            expectedOrderNumber,
            undefined,
            'process_detail_inner_frame'
          )
        })
        throw new Error(errorMsg)
      }
      this.log.debug('[详情页面 Step 2 完成] 内部框架已获取', {
        elapsedMs: Date.now() - processStartTime
      })

      this.log.debug('[详情页面 Step 3] 等待页面标题显示', {
        selector: '离散备料计划维护',
        timeout: 30000
      })
      await this.ensureNotRedirectedToLoginPage(
        detailPage,
        'detail.step3.header',
        expectedOrderNumber,
        progressState,
        Date.now() - processStartTime
      )
      try {
        await detailInnerFrame.getByText(/^离散备料计划维护：/).waitFor({
          state: 'visible',
          timeout: 30000
        })
      } catch (error) {
        const pageState = await this.logPageStateSnapshot(detailPage, 'detail.step3.header', {
          level: 'error',
          orderNumber: expectedOrderNumber,
          orderIndex: progressState.ordersStarted,
          orderPosition: `${progressState.ordersStarted + 1}/${progressState.totalOrders}`,
          elapsedMs: Date.now() - processStartTime,
          includeFrameHierarchy: true,
          includeBodyTextPreview: true
        })
        this.log.error('[DETAIL_PAGE_TIMEOUT] 详情页等待超时', {
          failureKind: pageState.isCasLoginRedirect ? 'redirected_to_cas' : 'detail_header_missing',
          expectedMarker: '离散备料计划维护：',
          ...pageState,
          error: error instanceof Error ? error.message : String(error)
        })
        throw error
      }
      this.log.debug('[详情页面 Step 3 完成] 页面标题已显示', {
        elapsedMs: Date.now() - processStartTime
      })

      this.log.debug('[详情页面 Step 4] 提取源订单号')
      const sourceOrderNumber = await this.extractSourceOrderNumber(detailInnerFrame)
      const orderNumber = sourceOrderNumber || expectedOrderNumber || 'UNKNOWN_ORDER'
      this.log.debug('[详情页面 Step 4 完成] 订单号已确认', {
        extractedOrderNumber: orderNumber,
        sourceOrderNumber,
        usedFallback: !sourceOrderNumber && !!expectedOrderNumber
      })

      detail.orderNumber = orderNumber

      this.log.debug('[详情页面 Step 5] 读取物料数量和状态')
      const detailCountText = await detailInnerFrame.getByText(/^详细信息 \(\d+\)$/).innerText()
      const detailCountMatch = detailCountText.match(/\((\d+)\)/)
      detailCount = detailCountMatch ? parseInt(detailCountMatch[1], 10) : 0

      const statusText = await detailInnerFrame.getByText(/^备料状态:.+$/).innerText()
      const statusMatch = statusText.replace(/\n/g, '').match(/备料状态:(.+)$/)
      const detailStatus = statusMatch ? statusMatch[1].trim() : ''

      this.log.info('[详情页面] 订单状态已读取', {
        orderNumber,
        detailStatus,
        totalMaterials: detailCount,
        elapsedMs: Date.now() - processStartTime
      })

      onProgress?.(
        `开始处理订单：${orderNumber}`,
        this.calculateProgress(
          progressState.ordersStarted,
          0,
          detailCount,
          progressState.totalOrders
        ),
        {
          currentOrderIndex: progressState.ordersStarted + 1,
          totalOrders: progressState.totalOrders,
          currentMaterialIndex: 0,
          totalMaterialsInOrder: detailCount,
          currentOrderNumber: orderNumber
        }
      )

      if (detailStatus === '审批通过' && detailCount > 0) {
        await this.processApprovedOrderMaterials({
          detailInnerFrame,
          deleteSet,
          dryRun,
          progressState,
          onProgress,
          detail,
          detailCount,
          orderNumber,
          processStartTime
        })
      } else {
        this.log.info('[详情页面跳过] 订单状态不是"审批通过"或无物料', {
          orderNumber,
          detailStatus,
          detailCount,
          reason: detailStatus !== '审批通过' ? '状态不符' : '无物料明细'
        })
      }

      const totalProcessTime = Date.now() - processStartTime
      this.log.info('[详情页面处理完成]', {
        orderNumber,
        totalMaterials: detailCount,
        deleted: detail.materialsDeleted,
        skipped: detail.materialsSkipped,
        elapsedMs: totalProcessTime,
        isSlow: totalProcessTime > 30000,
        dryRun
      })

      return detail
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      this.log.error('[详情页面处理失败]', {
        orderNumber: expectedOrderNumber || 'UNKNOWN',
        error: message,
        elapsedMs: Date.now() - processStartTime,
        contextData: await capturePageContext(
          detailPage,
          undefined,
          'processDetail.error',
          expectedOrderNumber,
          undefined,
          'process_detail_error'
        )
      })
      throw error
    } finally {
      const totalOrderTime = Date.now() - processStartTime
      this.log.info('[ORDER_COMPLETE] 订单处理完成', {
        orderIndex: progressState.ordersStarted,
        orderPosition: `${progressState.ordersStarted + 1}/${progressState.totalOrders}`,
        ordersCompleted: progressState.ordersCompleted,
        orderNumber: expectedOrderNumber || 'UNKNOWN',
        totalMaterials: detailCount,
        deleted: detail?.materialsDeleted ?? 0,
        skipped: detail?.materialsSkipped ?? 0,
        failed: detail?.materialsFailed ?? 0,
        totalOrderTimeMs: totalOrderTime,
        isSlow: totalOrderTime > 30000
      })

      this.log.debug('[详情页面清理] 准备关闭详情页面', { pageUrl: detailPage.url() })
      await detailPage.close()
      this.log.debug('[详情页面清理完成] 详情页已关闭')
    }
  }

  private async processApprovedOrderMaterials(params: {
    detailInnerFrame: FrameLocator
    deleteSet: Set<string>
    dryRun: boolean
    progressState: ProgressState
    onProgress?: (message: string, progress?: number, extra?: Partial<CleanerProgress>) => void
    detail: OrderCleanDetail
    detailCount: number
    orderNumber: string
    processStartTime: number
  }): Promise<void> {
    const {
      detailInnerFrame,
      deleteSet,
      dryRun,
      progressState,
      onProgress,
      detail,
      detailCount,
      orderNumber,
      processStartTime
    } = params

    this.log.debug('[详情页面 Step 6] 订单状态为"审批通过"，开始修改流程', {
      materialCount: detailCount
    })
    await detailInnerFrame.getByRole('button', { name: '修改' }).click()
    this.log.debug('[详情页面 Step 6.1] 已点击"修改"按钮', {
      elapsedMs: Date.now() - processStartTime
    })

    const saveButtonLocator = detailInnerFrame.getByRole('button', { name: '保存' })
    await saveButtonLocator.waitFor({ state: 'visible', timeout: 30000 })
    this.log.debug('[详情页面 Step 6.2] "保存"按钮已就绪', {
      elapsedMs: Date.now() - processStartTime
    })

    await detailInnerFrame.getByText('展开').first().click()
    this.log.debug('[详情页面 Step 6.3] 已展开明细卡片', {
      elapsedMs: Date.now() - processStartTime
    })

    const childForm = detailInnerFrame.locator('.card-table-side-box')
    const buttonWrapper = childForm.locator('.button-wrapper')
    const deleteRowBtn = buttonWrapper.getByRole('button', { name: '删行' })
    const nextBtn = buttonWrapper.locator('.icon-jiantouyou')
    const collapseBtn = buttonWrapper.locator('.icon-celashouqi')

    let lastRowNumber = ''
    let materialIdx = 0
    const processingStartTime = Date.now()

    this.log.info('[物料循环开始] 准备遍历物料明细', {
      orderNumber,
      totalMaterials: detailCount,
      deleteSetSize: deleteSet.size
    })

    while (true) {
      materialIdx += 1
      const materialStartTime = Date.now()

      const currentRow = await this.getInputValue(childForm, /^行号$/)
      const rowNumInt = parseInt(currentRow, 10)

      if (currentRow === lastRowNumber) {
        this.log.debug('[物料循环] 检测到重复行号，等待 500ms', {
          orderNumber,
          materialIdx,
          rowNumber: currentRow,
          elapsedMs: Date.now() - processingStartTime
        })
        await delay(500)
      }

      const materialCode = await this.getInputValue(childForm, /^材料编码/)
      const materialName = await this.getInputValue(childForm, /^材料名称/)
      const pendingQty = await this.getInputValue(childForm, /^累计待发数量$/)

      const progress = this.calculateProgress(
        progressState.ordersStarted,
        materialIdx,
        detailCount,
        progressState.totalOrders
      )

      onProgress?.(
        `订单 ${orderNumber} - 物料 ${materialIdx}/${detailCount}: ${materialName}`,
        progress,
        {
          currentOrderIndex: progressState.ordersStarted + 1,
          totalOrders: progressState.totalOrders,
          currentMaterialIndex: materialIdx,
          totalMaterialsInOrder: detailCount,
          currentOrderNumber: orderNumber
        }
      )

      if (deleteSet.has(materialCode)) {
        await this.handleMaterialInDeleteSet({
          detail,
          detailInnerFrame,
          childForm,
          deleteRowBtn,
          deleteSet,
          dryRun,
          materialCode,
          materialName,
          materialIdx,
          currentRow,
          rowNumInt,
          pendingQty,
          orderNumber,
          detailCount,
          materialStartTime
        })
      } else {
        detail.materialsSkipped += 1
        detail.skippedMaterials.push({
          materialCode,
          materialName,
          rowNumber: rowNumInt,
          reason: '不在删除清单中'
        })
        this.log.verbose('[物料跳过] 物料不在删除清单中', {
          orderNumber,
          materialIdx,
          materialCode,
          materialName,
          rowNumber: rowNumInt
        })
      }

      const isNextEnabled = await this.isButtonEnabled(nextBtn)
      if (isNextEnabled) {
        lastRowNumber = currentRow
        this.log.verbose('[物料循环] 点击"下一行"按钮', {
          orderNumber,
          materialIdx,
          currentRow,
          hasNext: true
        })
        await nextBtn.click()
      } else {
        this.log.info('[物料循环结束] 已到达最后一行', {
          orderNumber,
          totalMaterials: materialIdx,
          deleted: detail.materialsDeleted,
          skipped: detail.materialsSkipped,
          elapsedMs: Date.now() - processingStartTime
        })
        break
      }
    }

    this.log.debug('[详情页面 Step 7] 折叠明细卡片')
    await collapseBtn.click()

    if (!dryRun && detail.materialsDeleted > 0) {
      this.log.info('[详情页面 Step 8] 保存订单修改', {
        orderNumber,
        materialsDeleted: detail.materialsDeleted,
        materialsSkipped: detail.materialsSkipped
      })
      await saveButtonLocator.click()
      await saveButtonLocator.waitFor({ state: 'hidden', timeout: 60000 })
      this.log.info('[详情页面保存完成] 订单修改已保存', {
        orderNumber,
        materialsDeleted: detail.materialsDeleted,
        elapsedMs: Date.now() - processStartTime
      })
    } else if (dryRun) {
      this.log.info('[详情页面干运行] 模拟模式下不保存修改', {
        orderNumber,
        wouldDeleteMaterials: detail.materialsDeleted
      })
    }
  }

  private async handleMaterialInDeleteSet(params: {
    detail: OrderCleanDetail
    detailInnerFrame: FrameLocator
    childForm: Locator
    deleteRowBtn: Locator
    deleteSet: Set<string>
    dryRun: boolean
    materialCode: string
    materialName: string
    materialIdx: number
    currentRow: string
    rowNumInt: number
    pendingQty: string
    orderNumber: string
    detailCount: number
    materialStartTime: number
  }): Promise<void> {
    const {
      detail,
      detailInnerFrame,
      childForm,
      deleteRowBtn,
      deleteSet,
      dryRun,
      materialCode,
      materialName,
      materialIdx,
      currentRow,
      rowNumInt,
      pendingQty,
      orderNumber,
      detailCount,
      materialStartTime
    } = params

    this.log.debug('[物料判断] 物料在删除清单中，进行评估', {
      orderNumber,
      materialIdx,
      materialCode,
      materialName,
      rowNumber: rowNumInt,
      pendingQty: pendingQty || '(empty)',
      deleteSetSize: deleteSet.size
    })

    const shouldDelete = shouldDeleteMaterial({
      rowNumber: rowNumInt,
      pendingQty,
      materialCode,
      deleteSet
    })

    if (shouldDelete) {
      if (dryRun) {
        detail.materialsDeleted += 1
        detail.deletedMaterials.push({
          materialCode,
          materialName,
          rowNumber: rowNumInt,
          outcome: 'dry_run'
        })
        this.log.info('[物料操作预演] 符合删除条件，dry-run 模式不执行删除', {
          orderNumber,
          materialIdx,
          materialCode,
          materialName,
          rowNumber: currentRow
        })
        return
      }

      this.log.info('[物料操作] 执行删除操作（多信号验证）', {
        orderNumber,
        materialIdx,
        materialCode,
        materialName,
        rowNumber: currentRow,
        materialCount: detailCount,
        dryRun: false
      })

      const currentMaterialCount = await this.deletionVerifier.readMaterialCount(detailInnerFrame)
      const deleteResult = await this.deletionVerifier.deleteWithVerification({
        childForm,
        detailInnerFrame,
        deleteRowBtn,
        materialCode,
        materialName,
        currentRowNumber: currentRow,
        materialCountBefore: currentMaterialCount ?? detailCount
      })

      const deleteElapsed = Date.now() - materialStartTime

      if (
        deleteResult.outcome === DeletionOutcome.Success ||
        deleteResult.outcome === DeletionOutcome.Uncertain
      ) {
        detail.materialsDeleted += 1
        detail.deletedMaterials.push({
          materialCode,
          materialName,
          rowNumber: rowNumInt,
          outcome: deleteResult.outcome
        })
        if (deleteResult.outcome === DeletionOutcome.Uncertain) {
          detail.uncertainDeletions += 1
        }
        this.log.info('[物料操作完成] 物料删除结果', {
          orderNumber,
          materialCode,
          outcome: deleteResult.outcome,
          attempts: deleteResult.attempts.length,
          elapsedMs: deleteElapsed
        })
      } else {
        detail.materialsFailed += 1
        detail.failedMaterials.push({
          materialCode,
          materialName,
          rowNumber: rowNumInt,
          attempts: deleteResult.attempts,
          finalOutcome: deleteResult.outcome,
          finalErrorCategory: deleteResult.errorCategory
        })
        this.log.error('[物料操作失败] 物料删除失败', {
          orderNumber,
          materialCode,
          outcome: deleteResult.outcome,
          errorCategory: deleteResult.errorCategory,
          errorMessage: deleteResult.errorMessage,
          attempts: deleteResult.attempts.length,
          elapsedMs: deleteElapsed
        })
      }
      return
    }

    detail.materialsSkipped += 1
    const reason = getSkipReason({
      rowNumber: rowNumInt,
      pendingQty,
      materialCode,
      deleteSet
    })
    this.log.debug('[物料跳过] 物料不满足删除条件', {
      orderNumber,
      materialIdx,
      materialCode,
      materialName,
      rowNumber: rowNumInt,
      reason,
      elapsedMs: Date.now() - materialStartTime
    })
    detail.skippedMaterials.push({
      materialCode,
      materialName,
      rowNumber: rowNumInt,
      reason
    })
  }

  private async ensureNotRedirectedToLoginPage(
    page: Page,
    step: string,
    expectedOrderNumber: string | undefined,
    progressState: ProgressState,
    elapsedMs: number
  ): Promise<void> {
    const pageState = await capturePageState(page, this.getBrowserContext(), {
      includeFrameHierarchy: true,
      includeBodyTextPreview: true
    })

    if (!pageState.isCasLoginRedirect && pageState.pageKind !== 'login') {
      return
    }

    this.log.error('[SESSION_LOST] 会话跳转到 CAS 登录页', {
      step,
      orderNumber: expectedOrderNumber,
      orderIndex: progressState.ordersStarted,
      orderPosition: `${progressState.ordersStarted + 1}/${progressState.totalOrders}`,
      elapsedMs,
      detectedBy: pageState.isCasLoginRedirect ? 'url_match' : 'login_form_detected',
      ...pageState
    })

    throw new Error('ERP 会话已跳转到登录页')
  }

  private async logPageStateSnapshot(
    page: Page,
    step: string,
    options: {
      level?: 'info' | 'warn' | 'error' | 'debug'
      orderNumber?: string
      orderIndex?: number
      orderPosition?: string
      workerId?: number
      elapsedMs?: number
      includeFrameHierarchy?: boolean
      includeBodyTextPreview?: boolean
    } = {}
  ) {
    const pageState = await capturePageState(page, this.getBrowserContext(), {
      includeFrameHierarchy: options.includeFrameHierarchy,
      includeBodyTextPreview: options.includeBodyTextPreview
    })

    const payload = {
      step,
      orderNumber: options.orderNumber,
      orderIndex: options.orderIndex,
      orderPosition: options.orderPosition,
      workerId: options.workerId,
      elapsedMs: options.elapsedMs,
      ...pageState
    }

    const level = options.level ?? 'info'
    this.log[level]('[PAGE_STATE] 页面状态快照', payload)
    return payload
  }

  private calculateProgress(
    completedOrders: number,
    materialIdx: number,
    detailCount: number,
    totalOrders: number
  ): number {
    const materialRatio = detailCount > 0 ? materialIdx / detailCount : 0
    return ((1 + completedOrders + materialRatio) / (1 + totalOrders)) * 100
  }

  private async extractSourceOrderNumber(frame: FrameLocator): Promise<string> {
    try {
      const sourceOrder = await frame
        .locator('.vsourcebillcode .code-detail-link')
        .first()
        .innerText()
      const match = sourceOrder.match(/SC\d{14}/)
      return match ? match[0] : sourceOrder.trim()
    } catch {
      return ''
    }
  }

  private async getInputValue(
    container: FrameLocator | Locator,
    labelRegex: RegExp
  ): Promise<string> {
    try {
      return await container
        .locator('div')
        .filter({ hasText: labelRegex })
        .locator('input')
        .first()
        .inputValue()
    } catch {
      return ''
    }
  }

  private async isButtonEnabled(button: Locator): Promise<boolean> {
    try {
      return await button.isEnabled()
    } catch {
      return false
    }
  }
}

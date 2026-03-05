import path from 'path'
import fs from 'fs'
import { app } from 'electron'
import { createLogger } from '../logger'
import type { CleanerResult, OrderCleanDetail, SkippedMaterial } from '../../types/cleaner.types'

const log = createLogger('CleanerReportGenerator')

export interface ReportOptions {
  dryRun: boolean
  username: string
  startTime: number
  endTime: number
}

interface OrderStats {
  successCount: number
  failureCount: number
  successRate: number
}

export class CleanerReportGenerator {
  private readonly reportDir: string

  constructor() {
    const logDir = app.isReady() ? app.getPath('logs') : path.join(process.cwd(), 'logs')
    this.reportDir = path.join(logDir, 'reports')
    this.ensureReportDir()
  }

  private ensureReportDir(): void {
    if (!fs.existsSync(this.reportDir)) {
      fs.mkdirSync(this.reportDir, { recursive: true })
      log.info('Created report directory', { path: this.reportDir })
    }
  }

  async generateReport(result: CleanerResult, options: ReportOptions): Promise<string> {
    const filePath = this.getReportFilePath()
    log.info('Generating cleaner report', { path: filePath })

    const stats = this.calculateOrderStats(result)
    const content = this.buildReportContent(result, options, stats)

    await fs.promises.writeFile(filePath, content, 'utf-8')
    log.info('Report generated successfully', { path: filePath })

    return filePath
  }

  private getReportFilePath(): string {
    const now = new Date()
    const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, -5).replace('T', '-')
    const fileName = `cleaner-report-${timestamp}.md`
    return path.join(this.reportDir, fileName)
  }

  private calculateOrderStats(result: CleanerResult): OrderStats {
    const totalOrders = result.details.length
    const failureCount = result.details.filter((d) => d.errors.length > 0).length
    const successCount = totalOrders - failureCount
    const successRate = totalOrders > 0 ? (successCount / totalOrders) * 100 : 0

    return {
      successCount,
      failureCount,
      successRate
    }
  }

  private buildReportContent(
    result: CleanerResult,
    options: ReportOptions,
    stats: OrderStats
  ): string {
    const lines: string[] = []

    lines.push('# ERP 物料清理执行报告')
    lines.push('')

    lines.push('## 执行摘要')
    lines.push('')
    lines.push('| 项目           | 值                                |')
    lines.push('| -------------- | --------------------------------- |')
    lines.push(`| **执行时间**   | \`${this.formatDateTime(options.endTime)}\``)
    lines.push(`| **执行模式**   | \`${options.dryRun ? '模拟运行 (Dry Run)' : '正式执行'}\``)
    lines.push(`| **操作用户**   | \`${options.username}\``)
    lines.push(`| **处理订单数** | \`${result.ordersProcessed}\``)
    lines.push(`| **删除物料数** | \`${result.materialsDeleted}\``)
    lines.push(`| **跳过物料数** | \`${result.materialsSkipped}\``)
    lines.push(`| **错误数量**   | \`${result.errors.length}\``)
    lines.push(`| **执行耗时**   | \`${this.formatDuration(options.startTime, options.endTime)}\``)
    lines.push('')
    lines.push('---')
    lines.push('')

    lines.push('## 执行状态')
    lines.push('')
    lines.push('| 状态        | 数量 | 百分比 |')
    lines.push('| ----------- | ---- | ------ |')
    lines.push(`| ✅ 成功订单 | ${stats.successCount} | ${stats.successRate.toFixed(1)}% |`)
    lines.push(`| ❌ 失败订单 | ${stats.failureCount} | ${(100 - stats.successRate).toFixed(1)}% |`)
    lines.push('')
    lines.push('---')
    lines.push('')

    lines.push('## 订单处理详情')
    lines.push('')
    lines.push('| #   | 订单号   | 删除数 | 跳过数 | 状态    | 错误信息                 |')
    lines.push('| --- | -------- | ------ | ------ | ------- | ------------------------ |')

    result.details.forEach((detail, index) => {
      const orderNum = index + 1
      const status = detail.errors.length > 0 ? '❌ 失败' : '✅ 成功'
      const errorMsg = detail.errors.length > 0 ? detail.errors[0] : '-'
      lines.push(
        `| ${orderNum} | \`${detail.orderNumber}\` | ${detail.materialsDeleted} | ${detail.materialsSkipped} | ${status} | \`${errorMsg}\` |`
      )
    })

    lines.push('')
    lines.push('---')
    lines.push('')

    const allSkippedMaterials = this.collectAllSkippedMaterials(result.details)
    if (allSkippedMaterials.length > 0) {
      lines.push('## 跳过的物料原因说明')
      lines.push('')
      lines.push('| 订单号   | 物料代码 | 物料名称 | 行号 | 跳过原因                          |')
      lines.push('| -------- | -------- | -------- | ---- | --------------------------------- |')

      allSkippedMaterials.forEach((skipped) => {
        lines.push(
          `| \`${skipped.orderNumber}\` | \`${skipped.materialCode}\` | \`${skipped.materialName}\` | ${skipped.rowNumber} | ${skipped.reason} |`
        )
      })

      lines.push('')
      lines.push('---')
      lines.push('')
    }

    if (result.errors.length > 0) {
      lines.push('## 错误详情')
      lines.push('')
      lines.push(`**错误总数**: \`${result.errors.length}\``)
      lines.push('')
      lines.push('### 错误订单列表')
      lines.push('')

      const errorOrders = this.extractErrorOrders(result.details)
      errorOrders.forEach((order) => {
        lines.push(`- \`${order}\``)
      })

      lines.push('')
      lines.push('### 错误详细信息')
      lines.push('')

      result.details
        .filter((d) => d.errors.length > 0)
        .forEach((detail) => {
          lines.push(`#### \`${detail.orderNumber}\``)
          lines.push('')
          lines.push('```')
          lines.push(`订单号：${detail.orderNumber}`)
          detail.errors.forEach((error) => {
            lines.push(`错误：${error}`)
          })
          lines.push('```')
          lines.push('')
        })

      lines.push('---')
      lines.push('')
    }

    lines.push(`**报告生成时间**: \`${this.formatDateTime(options.endTime)}\``)
    lines.push('**报表版本**: `v1.0`')

    return lines.join('\n')
  }

  private collectAllSkippedMaterials(
    details: OrderCleanDetail[]
  ): Array<SkippedMaterial & { orderNumber: string }> {
    const result: Array<SkippedMaterial & { orderNumber: string }> = []

    details.forEach((detail) => {
      if (detail.skippedMaterials && detail.skippedMaterials.length > 0) {
        detail.skippedMaterials.forEach((skipped) => {
          result.push({
            ...skipped,
            orderNumber: detail.orderNumber
          })
        })
      }
    })

    return result
  }

  private extractErrorOrders(details: OrderCleanDetail[]): string[] {
    return details.filter((d) => d.errors.length > 0).map((d) => d.orderNumber)
  }

  private formatDateTime(timestamp: number): string {
    const date = new Date(timestamp)
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    const hours = String(date.getHours()).padStart(2, '0')
    const minutes = String(date.getMinutes()).padStart(2, '0')
    const seconds = String(date.getSeconds()).padStart(2, '0')
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`
  }

  private formatDuration(startTime: number, endTime: number): string {
    const durationMs = endTime - startTime
    const minutes = Math.floor(durationMs / 60000)
    const seconds = Math.floor((durationMs % 60000) / 1000)
    return `${minutes}分${seconds}秒`
  }
}

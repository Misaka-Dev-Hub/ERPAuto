import ExcelJS from 'exceljs'
import path from 'path'
import { app } from 'electron'
import fs from 'fs'
import { createLogger } from '../logger'
import { logAuditWithCurrentUser } from '../logger/audit-logger'
import { AuditAction, AuditStatus } from '../../types/audit.types'
import type { ExportResultItem, ExportResultResponse } from '../../types/cleaner.types'

const log = createLogger('ResultExporter')

/**
 * Excel exporter for validation results
 * Exports filtered validation results to Excel file
 */
export class ResultExporter {
  private readonly exportDir: string
  private readonly fileName: string = '校验结果.xlsx'

  constructor() {
    // Export to app directory/exports
    this.exportDir = path.join(app.getPath('userData'), 'exports')
    this.ensureExportDir()
  }

  /**
   * Ensure export directory exists
   */
  private ensureExportDir(): void {
    if (!fs.existsSync(this.exportDir)) {
      fs.mkdirSync(this.exportDir, { recursive: true })
      log.info('Created export directory', { path: this.exportDir })
    }
  }

  /**
   * Export validation results to Excel
   * @param items - Validation result items to export
   * @returns Export result with file path or error
   */
  async exportValidationResults(items: ExportResultItem[]): Promise<ExportResultResponse> {
    const filePath = path.join(this.exportDir, this.fileName)
    try {
      log.info('Exporting validation results', { count: items.length, path: filePath })

      const workbook = new ExcelJS.Workbook()
      const worksheet = workbook.addWorksheet('校验结果')

      // Define columns
      worksheet.columns = [
        { header: '材料名称', key: 'materialName', width: 30 },
        { header: '材料代码', key: 'materialCode', width: 20 },
        { header: '规格', key: 'specification', width: 25 },
        { header: '型号', key: 'model', width: 20 },
        { header: '负责人', key: 'managerName', width: 15 },
        { header: '勾选状态', key: 'isSelectedText', width: 12 },
        { header: '是否标记删除', key: 'isMarkedForDeletionText', width: 14 }
      ]

      // Style header row
      const headerRow = worksheet.getRow(1)
      headerRow.font = { bold: true }
      headerRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE0E0E0' }
      }
      headerRow.alignment = { horizontal: 'center' }

      // Add data rows
      for (const item of items) {
        worksheet.addRow({
          materialName: item.materialName || '',
          materialCode: item.materialCode || '',
          specification: item.specification || '',
          model: item.model || '',
          managerName: item.managerName || '',
          isSelectedText: item.isSelected ? '是' : '否',
          isMarkedForDeletionText: item.isMarkedForDeletion ? '是' : '否'
        })
      }

      // Style data rows
      for (let i = 2; i <= worksheet.rowCount; i++) {
        const row = worksheet.getRow(i)
        row.alignment = { vertical: 'middle' }

        // Highlight selected items
        if (items[i - 2]?.isSelected) {
          row.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFE6F3FF' }
          }
        }
      }

      // Save file
      await workbook.xlsx.writeFile(filePath)
      log.info('Export completed', { path: filePath, rows: items.length })

      // Audit log: RESULT_EXPORT success
      logAuditWithCurrentUser(AuditAction.RESULT_EXPORT, 'VALIDATION_RESULT', AuditStatus.SUCCESS, {
        itemCount: items.length,
        filePath
      })

      return {
        success: true,
        filePath
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      log.error('Export failed', { error: errorMessage })

      // Audit log: RESULT_EXPORT failure
      logAuditWithCurrentUser(AuditAction.RESULT_EXPORT, 'VALIDATION_RESULT', AuditStatus.FAILURE, {
        itemCount: items.length,
        filePath,
        error: errorMessage
      })

      return {
        success: false,
        error: errorMessage
      }
    }
  }
}

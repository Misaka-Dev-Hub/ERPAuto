/**
 * Custom hook for fetching and managing report data
 * Handles data loading, parsing, and error states
 */

import { useState, useCallback, useEffect } from 'react'
import { ReportMetrics } from '../types'
import { parseReportData } from '../utils/parser'
import { useLogger } from '../../../hooks/useLogger'

interface UseReportDataResult {
  isLoading: boolean
  error: string | null
  reportData: ReportMetrics[]
  loadAndAnalyzeReports: () => Promise<void>
  clearData: () => void
}

/**
 * Hook for managing report data fetching and parsing
 *
 * @param isAdmin - Whether the current user has admin privileges
 * @param isOpen - Whether the dialog is open
 * @returns Report data state and control functions
 */
export const useReportData = (isAdmin: boolean, isOpen: boolean): UseReportDataResult => {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reportData, setReportData] = useState<ReportMetrics[]>([])
  const logger = useLogger('ReportData')

  const loadAndAnalyzeReports = useCallback(async () => {
    if (!isAdmin) return

    setIsLoading(true)
    setError(null)

    try {
      // 1. Fetch report list
      const listResult = await window.electron.report.listAll()
      if (!listResult.success || !listResult.data) {
        throw new Error(listResult.error || '获取报告列表失败')
      }

      const reports = listResult.data
      const metricsList: ReportMetrics[] = []

      // 2. Fetch content for each report (in chunks to avoid memory/network issues)
      // Rule: async-parallel - Using Promise.all for parallel fetching
      const chunkSize = 10
      for (let i = 0; i < reports.length; i += chunkSize) {
        const chunk = reports.slice(i, i + chunkSize)
        const contentPromises = chunk.map(async (report) => {
          try {
            const contentResult = await window.electron.report.download(report.key)
            if (contentResult.success && contentResult.data) {
              return { report, content: contentResult.data }
            }
          } catch (e) {
            logger.warn('Failed to fetch content for report', {
              reportKey: report.key,
              error: e instanceof Error ? e.message : String(e)
            })
          }
          return null
        })

        const chunkContents = await Promise.all(contentPromises)

        // 3. Parse each report's markdown content
        // Rule: js-hoist-regexp - Regex patterns now in parseReportData function
        for (const item of chunkContents) {
          if (!item) continue

          const { report, content } = item
          const parsedData = parseReportData(report, content)

          metricsList.push(parsedData)
        }
      }

      setReportData(metricsList)
    } catch (err: any) {
      setError(err.message || '分析报告时发生错误')
    } finally {
      setIsLoading(false)
    }
  }, [isAdmin, logger])

  const clearData = useCallback(() => {
    setReportData([])
    setError(null)
  }, [])

  // Auto-load data when dialog opens
  useEffect(() => {
    if (isOpen && isAdmin) {
      void loadAndAnalyzeReports()
    } else {
      clearData()
    }
  }, [isOpen, isAdmin, loadAndAnalyzeReports, clearData])

  return {
    isLoading,
    error,
    reportData,
    loadAndAnalyzeReports,
    clearData
  }
}

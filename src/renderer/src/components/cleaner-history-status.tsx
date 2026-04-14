import React from 'react'
import { AlertTriangle, CheckCircle, CircleMinus, Clock, XCircle } from 'lucide-react'

export type CleanerHistoryStatus =
  | 'success'
  | 'partial'
  | 'failed'
  | 'crashed'
  | 'pending'
  | 'not_found'
  | 'erp_not_found'

export interface CleanerHistoryStatusDisplay {
  label: string
  badgeClassName: string
  icon: React.ReactNode
}

export interface CleanerMaterialResultDisplay {
  title: string
  icon: React.ReactNode | null
}

const HISTORY_STATUS_META: Record<
  CleanerHistoryStatus,
  { label: string; badgeClassName: string; iconClassName: string; icon: typeof CheckCircle }
> = {
  success: {
    label: '成功',
    badgeClassName: 'bg-green-100 text-green-700',
    iconClassName: 'text-green-600',
    icon: CheckCircle
  },
  partial: {
    label: '部分成功',
    badgeClassName: 'bg-amber-100 text-amber-700',
    iconClassName: 'text-amber-600',
    icon: Clock
  },
  failed: {
    label: '失败',
    badgeClassName: 'bg-red-100 text-red-700',
    iconClassName: 'text-red-600',
    icon: XCircle
  },
  crashed: {
    label: '崩溃',
    badgeClassName: 'bg-red-100 text-red-700',
    iconClassName: 'text-red-600',
    icon: XCircle
  },
  pending: {
    label: '进行中',
    badgeClassName: 'bg-gray-100 text-gray-700',
    iconClassName: 'text-gray-500',
    icon: Clock
  },
  not_found: {
    label: '未找到',
    badgeClassName: 'bg-orange-100 text-orange-700',
    iconClassName: 'text-orange-600',
    icon: XCircle
  },
  erp_not_found: {
    label: 'ERP不存在',
    badgeClassName: 'bg-orange-100 text-orange-700',
    iconClassName: 'text-orange-600',
    icon: XCircle
  }
}

export function getCleanerHistoryStatusDisplay(status: string, size = 16): CleanerHistoryStatusDisplay {
  const meta = HISTORY_STATUS_META[(status in HISTORY_STATUS_META ? status : 'pending') as CleanerHistoryStatus]
  const Icon = meta.icon

  return {
    label: status in HISTORY_STATUS_META ? meta.label : status,
    badgeClassName: meta.badgeClassName,
    icon: <Icon size={size} className={meta.iconClassName} />
  }
}

export function getCleanerMaterialResultDisplay(
  result: string | null | undefined,
  size = 16
): CleanerMaterialResultDisplay {
  if (result === 'success' || result === 'deleted') {
    return {
      title: 'Deleted',
      icon: <CheckCircle size={size} className="text-green-600 flex-shrink-0" aria-label="Deleted" />
    }
  }

  if (result === 'skipped') {
    return {
      title: 'Skipped',
      icon: <CircleMinus size={size} className="text-gray-400 flex-shrink-0" aria-label="Skipped" />
    }
  }

  if (result === 'uncertain') {
    return {
      title: 'Uncertain',
      icon: <AlertTriangle size={size} className="text-amber-600 flex-shrink-0" aria-label="Uncertain" />
    }
  }

  if (result?.startsWith('failed')) {
    return {
      title: 'Failed',
      icon: <XCircle size={size} className="text-red-600 flex-shrink-0" aria-label="Failed" />
    }
  }

  return {
    title: result || 'Unknown',
    icon: null
  }
}

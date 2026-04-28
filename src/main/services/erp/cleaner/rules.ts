import type { ShouldDeleteParams } from './types'

function hasValidRowNumber(rowNumber: number): boolean {
  return Number.isFinite(rowNumber)
}

export function shouldDeleteMaterial(params: ShouldDeleteParams): boolean {
  const { rowNumber, pendingQty, materialCode, deleteSet } = params

  if (!deleteSet.has(materialCode)) {
    return false
  }

  if (!hasValidRowNumber(rowNumber)) {
    return false
  }

  if (rowNumber >= 2000 && rowNumber < 8000) {
    return false
  }

  if (pendingQty && pendingQty.trim() !== '') {
    return false
  }

  return true
}

export function getSkipReason(params: ShouldDeleteParams): string {
  const { rowNumber, pendingQty, materialCode, deleteSet } = params

  if (!deleteSet.has(materialCode)) {
    return '物料不在删除清单中'
  }
  if (!hasValidRowNumber(rowNumber)) {
    return '行号无效，无法安全判断是否受保护'
  }
  if (rowNumber >= 2000 && rowNumber < 8000) {
    return '行号在 2000-7999 范围内（受保护）'
  }
  if (pendingQty && pendingQty.trim() !== '') {
    return '累计待发数量不为空'
  }
  return '未知原因'
}

import { useCallback, useState } from 'react'
import type { ConfirmDialogProps } from './ConfirmDialog'

type ConfirmDialogConfig = Omit<ConfirmDialogProps, 'isOpen' | 'onConfirm' | 'onCancel'> & {
  resolve: (value: boolean) => void
}

export function useConfirmDialog(): {
  confirm: (
    options: Omit<ConfirmDialogProps, 'isOpen' | 'onConfirm' | 'onCancel'>
  ) => Promise<boolean>
  dialog:
    | (Omit<ConfirmDialogProps, 'isOpen'> & {
        isOpen: true
      })
    | null
} {
  const [config, setConfig] = useState<ConfirmDialogConfig | null>(null)

  const confirm = useCallback(
    (options: Omit<ConfirmDialogProps, 'isOpen' | 'onConfirm' | 'onCancel'>): Promise<boolean> => {
      return new Promise<boolean>((resolve) => {
        setConfig({
          ...options,
          resolve
        })
      })
    },
    []
  )

  const handleConfirm = useCallback(() => {
    if (!config) {
      return
    }

    config.resolve(true)
    setConfig(null)
  }, [config])

  const handleCancel = useCallback(() => {
    if (!config) {
      return
    }

    config.resolve(false)
    setConfig(null)
  }, [config])

  const dialog = config
    ? {
        ...config,
        isOpen: true as const,
        onConfirm: handleConfirm,
        onCancel: handleCancel
      }
    : null

  return { confirm, dialog }
}

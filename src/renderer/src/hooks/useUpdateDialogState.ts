import { startTransition, useEffect, useRef, useState } from 'react'
import type { UpdateDialogCatalog, UpdateRelease } from '../../../main/types/update.types'

export function releaseKey(release: UpdateRelease): string {
  return `${release.channel}:${release.version}`
}

export function getInitialSelectedRelease(
  catalog: UpdateDialogCatalog | null
): UpdateRelease | undefined {
  if (!catalog || catalog.mode === 'disabled') {
    return undefined
  }

  if (catalog.mode === 'user') {
    return catalog.recommendedRelease
  }

  return catalog.recommendedRelease ?? catalog.channels?.stable[0] ?? catalog.channels?.preview[0]
}

export function useUpdateDialogState(
  isOpen: boolean,
  catalog: UpdateDialogCatalog | null
): {
  selectedRelease: UpdateRelease | undefined
  setSelectedRelease: React.Dispatch<React.SetStateAction<UpdateRelease | undefined>>
  changelog: string
  isLoadingChangelog: boolean
  isSelectedRelease: (release: UpdateRelease) => boolean
} {
  const [selectedRelease, setSelectedRelease] = useState<UpdateRelease | undefined>(undefined)
  const [changelog, setChangelog] = useState('')
  const [isLoadingChangelog, setIsLoadingChangelog] = useState(false)
  const changelogRequestIdRef = useRef(0)

  useEffect(() => {
    if (!isOpen) {
      setSelectedRelease(undefined)
      setChangelog('')
      setIsLoadingChangelog(false)
      return
    }

    startTransition(() => {
      setSelectedRelease(getInitialSelectedRelease(catalog))
    })
  }, [catalog, isOpen])

  useEffect(() => {
    if (!isOpen || !selectedRelease) {
      setChangelog('')
      setIsLoadingChangelog(false)
      return
    }

    const requestId = ++changelogRequestIdRef.current
    setIsLoadingChangelog(true)

    void window.electron.update
      .getChangelog(selectedRelease)
      .then((result) => {
        if (changelogRequestIdRef.current !== requestId) {
          return
        }

        setChangelog(result.success && result.data ? result.data : '暂无更新说明。')
      })
      .catch(() => {
        if (changelogRequestIdRef.current !== requestId) {
          return
        }

        setChangelog('暂无更新说明。')
      })
      .finally(() => {
        if (changelogRequestIdRef.current === requestId) {
          setIsLoadingChangelog(false)
        }
      })
  }, [isOpen, selectedRelease])

  return {
    selectedRelease,
    setSelectedRelease,
    changelog,
    isLoadingChangelog,
    isSelectedRelease: (release) =>
      selectedRelease ? releaseKey(selectedRelease) === releaseKey(release) : false
  }
}

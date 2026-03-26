import type {
  ReleaseChannel,
  UpdateCatalog,
  UpdateDialogCatalog,
  UpdateRelease
} from '../../types/update.types'

export function compareVersions(left: string, right: string): number {
  const leftParts = left.split('.').map((part) => Number.parseInt(part, 10) || 0)
  const rightParts = right.split('.').map((part) => Number.parseInt(part, 10) || 0)
  const length = Math.max(leftParts.length, rightParts.length)

  for (let index = 0; index < length; index += 1) {
    const leftValue = leftParts[index] ?? 0
    const rightValue = rightParts[index] ?? 0

    if (leftValue > rightValue) return 1
    if (leftValue < rightValue) return -1
  }

  return 0
}

export function normalizeReleases(input: unknown, channel: ReleaseChannel): UpdateRelease[] {
  const list = Array.isArray(input)
    ? input
    : input &&
        typeof input === 'object' &&
        Array.isArray((input as { releases?: unknown[] }).releases)
      ? (input as { releases: unknown[] }).releases
      : []

  return list
    .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
    .map((item) => ({
      version: String(item.version ?? ''),
      channel,
      artifactKey: String(item.artifactKey ?? ''),
      sha256: String(item.sha256 ?? ''),
      size: Number(item.size ?? 0),
      publishedAt: String(item.publishedAt ?? ''),
      changelogKey: String(item.changelogKey ?? ''),
      notesSummary: item.notesSummary ? String(item.notesSummary) : undefined
    }))
    .filter(
      (item) =>
        !!item.version &&
        !!item.artifactKey &&
        !!item.sha256 &&
        !!item.changelogKey &&
        !!item.publishedAt
    )
}

export function sortReleases(releases: UpdateRelease[]): UpdateRelease[] {
  return [...releases].sort((left, right) => {
    const versionCompare = compareVersions(right.version, left.version)
    if (versionCompare !== 0) {
      return versionCompare
    }

    return new Date(right.publishedAt).getTime() - new Date(left.publishedAt).getTime()
  })
}

export function pickLatestRelease(releases: UpdateRelease[]): UpdateRelease | undefined {
  return sortReleases(releases)[0]
}

export function limitCatalogHistory(catalog: UpdateCatalog, maxPerChannel: number): UpdateCatalog {
  return {
    stable: sortReleases(catalog.stable).slice(0, maxPerChannel),
    preview: sortReleases(catalog.preview).slice(0, maxPerChannel)
  }
}

export function resolveUserDecision(params: {
  currentVersion: string
  currentChannel: ReleaseChannel
  catalog: UpdateCatalog
}): {
  recommendedRelease?: UpdateRelease
  shouldOffer: boolean
} {
  const latestStable = pickLatestRelease(params.catalog.stable)
  if (!latestStable) {
    return { recommendedRelease: undefined, shouldOffer: false }
  }

  if (params.currentChannel === 'preview') {
    return { recommendedRelease: latestStable, shouldOffer: true }
  }

  return {
    recommendedRelease: latestStable,
    shouldOffer: params.currentVersion !== latestStable.version
  }
}

export function resolveAdminDecision(params: {
  currentVersion: string
  currentChannel: ReleaseChannel
  catalog: UpdateCatalog
  maxHistoryPerChannel: number
}): UpdateDialogCatalog {
  const channels = limitCatalogHistory(params.catalog, params.maxHistoryPerChannel)
  const allReleases = sortReleases([...channels.stable, ...channels.preview])

  const higherVersionRelease = allReleases.find(
    (release) => compareVersions(release.version, params.currentVersion) > 0
  )

  const preferredCrossChannelRelease = allReleases.find(
    (release) => release.channel !== params.currentChannel
  )

  return {
    mode: 'admin',
    recommendedRelease:
      higherVersionRelease ??
      preferredCrossChannelRelease ??
      pickLatestRelease(channels[params.currentChannel]),
    channels
  }
}

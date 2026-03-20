import type { UserType } from './user.types'

export type ReleaseChannel = 'stable' | 'preview'

export type UpdatePhase =
  | 'idle'
  | 'checking'
  | 'available'
  | 'downloading'
  | 'downloaded'
  | 'installing'
  | 'error'

export interface UpdateRelease {
  version: string
  channel: ReleaseChannel
  artifactKey: string
  sha256: string
  size: number
  publishedAt: string
  changelogKey: string
  notesSummary?: string
}

export interface UpdateCatalog {
  stable: UpdateRelease[]
  preview: UpdateRelease[]
}

export interface DownloadedRelease extends UpdateRelease {
  localPath: string
}

export interface UpdateStatus {
  enabled: boolean
  supported: boolean
  phase: UpdatePhase
  currentVersion: string
  currentChannel: ReleaseChannel
  currentUserType: UserType | null
  message?: string
  latestVersion?: string
  latestChannel?: ReleaseChannel
  progress?: number
  downloadedRelease?: Pick<DownloadedRelease, 'version' | 'channel' | 'localPath'>
  recommendedRelease?: UpdateRelease
  error?: string
  adminHasAnyRelease?: boolean
}

export interface UpdateDialogCatalog {
  mode: 'user' | 'admin' | 'disabled'
  recommendedRelease?: UpdateRelease
  channels?: UpdateCatalog
}

export interface DownloadReleaseRequest {
  version: string
  channel: ReleaseChannel
  artifactKey: string
  sha256: string
  size: number
  publishedAt: string
  changelogKey: string
  notesSummary?: string
}

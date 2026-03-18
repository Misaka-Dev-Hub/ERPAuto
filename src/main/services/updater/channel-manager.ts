import * as fs from 'fs'
import * as path from 'path'
import { app } from 'electron'
import { createLogger } from '../logger'

const log = createLogger('ChannelManager')

export interface UserChannelPreference {
  username: string
  channel: 'stable' | 'beta'
  lastModified: number
}

export class ChannelManager {
  private static instance: ChannelManager
  private preferencesPath: string
  private preferences: Record<string, UserChannelPreference> = {}

  private constructor() {
    const userDataPath = app.getPath('userData')
    this.preferencesPath = path.join(userDataPath, 'channel-preferences.json')
    this.loadPreferences()
  }

  public static getInstance(): ChannelManager {
    if (!ChannelManager.instance) {
      ChannelManager.instance = new ChannelManager()
    }
    return ChannelManager.instance
  }

  private loadPreferences(): void {
    try {
      if (fs.existsSync(this.preferencesPath)) {
        const data = fs.readFileSync(this.preferencesPath, 'utf8')
        this.preferences = JSON.parse(data)
        log.info('Channel preferences loaded')
      }
    } catch (error) {
      log.error('Failed to load channel preferences', { error })
      this.preferences = {}
    }
  }

  private savePreferences(): void {
    try {
      fs.writeFileSync(this.preferencesPath, JSON.stringify(this.preferences, null, 2), 'utf8')
    } catch (error) {
      log.error('Failed to save channel preferences', { error })
    }
  }

  public getAvailableChannels(userType: string): string[] {
    if (userType === 'Admin') {
      return ['stable', 'beta']
    }
    return ['stable']
  }

  public getUserChannelPreference(
    username: string,
    defaultChannel: 'stable' | 'beta' = 'stable'
  ): UserChannelPreference {
    if (this.preferences[username]) {
      return this.preferences[username]
    }
    return {
      username,
      channel: defaultChannel,
      lastModified: Date.now()
    }
  }

  public setUserChannelPreference(username: string, channel: 'stable' | 'beta'): void {
    this.preferences[username] = {
      username,
      channel,
      lastModified: Date.now()
    }
    this.savePreferences()
    log.info(`Updated channel preference for ${username} to ${channel}`)
  }

  public canAccessChannel(userType: string, channel: string): boolean {
    if (channel === 'stable') return true
    if (channel === 'beta' && userType === 'Admin') return true
    return false
  }
}

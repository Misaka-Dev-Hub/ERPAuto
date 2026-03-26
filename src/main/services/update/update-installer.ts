import { app } from 'electron'
import { createHash } from 'crypto'
import * as fs from 'fs'
import * as path from 'path'
import { spawn } from 'child_process'
import { createLogger } from '../logger'
import type { DownloadedRelease, UpdateRelease } from '../../types/update.types'
import { appendPortableLaunchLog } from './update-support'

const log = createLogger('UpdateInstaller')

export class UpdateInstaller {
  public async getValidDownloadedRelease(
    release: UpdateRelease
  ): Promise<DownloadedRelease | null> {
    const downloadPath = this.getDownloadPath(release)
    if (!fs.existsSync(downloadPath)) {
      return null
    }

    const hash = await this.calculateSha256(downloadPath)
    if (hash.toLowerCase() !== release.sha256.toLowerCase()) {
      await fs.promises.rm(downloadPath, { force: true })
      return null
    }

    return {
      ...release,
      localPath: downloadPath
    }
  }

  public getDownloadPath(release: Pick<UpdateRelease, 'channel' | 'version'>): string {
    return path.join(
      app.getPath('userData'),
      'pending-update',
      `${release.channel}-${release.version}.exe`
    )
  }

  public async calculateSha256(filePath: string): Promise<string> {
    const hash = createHash('sha256')
    const input = fs.createReadStream(filePath)

    await new Promise<void>((resolve, reject) => {
      input.on('data', (chunk) => hash.update(chunk))
      input.on('error', reject)
      input.on('end', resolve)
    })

    return hash.digest('hex')
  }

  public async installDownloadedRelease(
    downloaded: Pick<DownloadedRelease, 'version' | 'channel' | 'localPath'>
  ): Promise<void> {
    const updaterSourcePath = this.resolveUpdaterBinaryPath()
    const updaterPath = await this.prepareUpdaterBinary(updaterSourcePath)
    const targetExe = process.env.PORTABLE_EXECUTABLE_FILE || process.execPath
    const logPath = path.join(app.getPath('userData'), 'updates', 'portable-update.log')
    const launchLogPath = path.join(app.getPath('userData'), 'updates', 'portable-launch.log')
    const appArgs = process.argv.slice(1)
    const argsBase64 =
      appArgs.length > 0 ? Buffer.from(appArgs.join('\0'), 'utf-8').toString('base64') : ''

    const spawnArgs = [
      '--targetExe',
      targetExe,
      '--downloadedExe',
      downloaded.localPath,
      '--parentPid',
      String(process.pid),
      '--logPath',
      logPath
    ]

    if (argsBase64) {
      spawnArgs.push('--argsBase64', argsBase64)
    }

    appendPortableLaunchLog(launchLogPath, 'Preparing portable updater launch', {
      updaterSourcePath,
      updaterPath,
      targetExe,
      downloadedExe: downloaded.localPath,
      parentPid: process.pid,
      logPath,
      appArgs,
      updaterExists: fs.existsSync(updaterPath),
      spawnArgs
    })

    const child = spawn(updaterPath, spawnArgs, {
      detached: true,
      stdio: 'ignore',
      windowsHide: true
    })

    appendPortableLaunchLog(launchLogPath, 'Spawn returned for portable updater', {
      childPid: child.pid ?? null
    })

    child.on('error', (error) => {
      appendPortableLaunchLog(launchLogPath, 'Portable updater executable spawn error', {
        error: error instanceof Error ? error.message : String(error)
      })
      log.error('Failed to launch portable updater executable', {
        error: error instanceof Error ? error.message : String(error)
      })
    })

    child.once('spawn', () => {
      appendPortableLaunchLog(launchLogPath, 'Portable updater executable spawned', {
        childPid: child.pid ?? null
      })
    })

    child.unref()
    app.quit()
  }

  private resolveUpdaterBinaryPath(): string {
    const packagedPath = path.join(process.resourcesPath, 'portable-updater.exe')
    const devPath = path.resolve(process.cwd(), 'build', 'bin', 'portable-updater.exe')

    if (fs.existsSync(packagedPath)) {
      return packagedPath
    }

    if (fs.existsSync(devPath)) {
      return devPath
    }

    throw new Error('未找到便携版更新器')
  }

  private async prepareUpdaterBinary(sourcePath: string): Promise<string> {
    const updatesDir = path.join(app.getPath('userData'), 'updates')
    const stagedPath = path.join(updatesDir, 'portable-updater.exe')

    await fs.promises.mkdir(updatesDir, { recursive: true })
    await fs.promises.copyFile(sourcePath, stagedPath)

    return stagedPath
  }
}

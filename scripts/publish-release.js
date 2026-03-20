#!/usr/bin/env node

const fs = require('fs')
const path = require('path')
const yaml = require('js-yaml')
const { spawnSync } = require('child_process')

function usage() {
  console.log(`
Usage:
  node scripts/publish-release.js --channel <stable|preview> [options]

Options:
  --channel <stable|preview>  Release channel. Required.
  --changelog <file>          Optional changelog file. Default: auto-resolve from version
  --config <file>             Config file path. Default: config.yaml
  --help                      Show this help message
`)
}

function parseArgs(argv) {
  const args = {}
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i]
    if (!token.startsWith('--')) continue
    const key = token.slice(2)
    const value = argv[i + 1]
    if (!value || value.startsWith('--')) {
      args[key] = true
      continue
    }
    args[key] = value
    i += 1
  }
  return args
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'))
}

function readYaml(filePath) {
  return yaml.load(fs.readFileSync(filePath, 'utf-8'))
}

function resolveChangelogPath(version, explicitPath) {
  if (explicitPath) {
    return path.resolve(process.cwd(), explicitPath)
  }

  const rebuildPath = path.resolve(process.cwd(), 'docs', 'releases', `${version}-rebuild.md`)
  if (fs.existsSync(rebuildPath)) {
    return rebuildPath
  }

  return path.resolve(process.cwd(), 'docs', 'releases', `${version}.md`)
}

function validateUpdateConfig(configPath) {
  assert(fs.existsSync(configPath), `Config file not found: ${configPath}`)

  const parsed = readYaml(configPath)
  const update = parsed && parsed.update

  assert(update, 'Missing update config in config file')
  assert(update.enabled, 'update.enabled is false')
  assert(update.endpoint, 'update.endpoint is required')
  assert(update.accessKey, 'update.accessKey is required')
  assert(update.secretKey, 'update.secretKey is required')
  assert(update.bucket, 'update.bucket is required')
  assert(update.basePrefix, 'update.basePrefix is required')

  return update
}

function hasConflictMarker(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8')
  return (
    content.includes('<<<<<<<') || content.includes('=======') || content.includes('>>>>>>>')
  )
}

function validateVersionFiles(version) {
  const packageJsonPath = path.resolve(process.cwd(), 'package.json')
  const packageLockPath = path.resolve(process.cwd(), 'package-lock.json')

  assert(fs.existsSync(packageLockPath), `package-lock.json not found: ${packageLockPath}`)
  assert(!hasConflictMarker(packageJsonPath), 'package.json contains merge conflict markers')
  assert(!hasConflictMarker(packageLockPath), 'package-lock.json contains merge conflict markers')

  const packageLock = readJson(packageLockPath)
  assert(packageLock.version === version, 'package-lock.json version does not match package.json')

  const rootPackage = packageLock.packages && packageLock.packages['']
  if (rootPackage && rootPackage.version) {
    assert(rootPackage.version === version, 'package-lock root package version does not match package.json')
  }
}

function runStep(name, command, args, envOverrides = {}) {
  console.log('')
  console.log(`==> ${name}`)
  console.log(`$ ${command} ${args.join(' ')}`)

  let result
  if (process.platform === 'win32') {
    const shellCommand = [command, ...args]
      .map((arg) => (/\s|"/.test(arg) ? `"${String(arg).replace(/"/g, '\\"')}"` : arg))
      .join(' ')

    result = spawnSync(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', shellCommand], {
      cwd: process.cwd(),
      env: { ...process.env, ...envOverrides },
      stdio: 'inherit'
    })
  } else {
    result = spawnSync(command, args, {
      cwd: process.cwd(),
      env: { ...process.env, ...envOverrides },
      stdio: 'inherit'
    })
  }

  if (result.error) {
    throw result.error
  }

  if (result.status !== 0) {
    throw new Error(`${name} failed with exit code ${result.status}`)
  }
}

function readPreparedIndex(channel, basePrefix) {
  const indexPath = path.resolve(
    process.cwd(),
    'release-output',
    ...basePrefix.split('/'),
    channel,
    'index.json'
  )

  assert(fs.existsSync(indexPath), `Prepared index not found: ${indexPath}`)
  const parsed = readJson(indexPath)
  assert(parsed && Array.isArray(parsed.releases), `Invalid prepared index: ${indexPath}`)
  return { indexPath, parsed }
}

function summarizeRelease(version, channel, releaseEntry, indexPath) {
  console.log('')
  console.log('Release published successfully.')
  console.log(`Version:        ${version}`)
  console.log(`Channel:        ${channel}`)
  console.log(`Artifact:       ${releaseEntry.artifactKey}`)
  console.log(`SHA256:         ${releaseEntry.sha256}`)
  console.log(`Changelog:      ${releaseEntry.changelogKey}`)
  console.log(`Prepared Index: ${indexPath}`)
  console.log(`Published At:   ${releaseEntry.publishedAt}`)
}

function main() {
  const args = parseArgs(process.argv.slice(2))

  if (args.help || args.h) {
    usage()
    process.exit(0)
  }

  const channel = args.channel
  assert(channel === 'stable' || channel === 'preview', 'Missing or invalid --channel')

  const packageJsonPath = path.resolve(process.cwd(), 'package.json')
  assert(fs.existsSync(packageJsonPath), `package.json not found: ${packageJsonPath}`)
  const packageJson = readJson(packageJsonPath)
  const version = packageJson.version
  assert(version, 'package.json version is required')

  const configPath = path.resolve(process.cwd(), args.config || 'config.yaml')
  const updateConfig = validateUpdateConfig(configPath)
  validateVersionFiles(version)

  const changelogPath = resolveChangelogPath(version, args.changelog)
  assert(fs.existsSync(changelogPath), `Changelog not found: ${changelogPath}`)

  runStep('Build Windows package', 'npm', ['run', 'build:win'], {
    APP_CHANNEL: channel
  })

  runStep('Prepare release package', 'npm', [
    'run',
    'release:prepare',
    '--',
    '--channel',
    channel,
    '--changelog',
    changelogPath
  ])

  const { indexPath, parsed } = readPreparedIndex(channel, updateConfig.basePrefix)
  const latestRelease = parsed.releases[0]
  assert(latestRelease, 'Prepared index does not contain any release entry')
  assert(
    latestRelease.version === version && latestRelease.channel === channel,
    `Prepared index latest entry mismatch: expected ${version}/${channel}, got ${latestRelease.version}/${latestRelease.channel}`
  )

  runStep('Upload release package', 'npm', [
    'run',
    'release:upload',
    '--',
    '--channel',
    channel,
    '--verify'
  ])

  summarizeRelease(version, channel, latestRelease, indexPath)
}

try {
  main()
} catch (error) {
  console.error(`publish-release failed: ${error.message}`)
  process.exit(1)
}

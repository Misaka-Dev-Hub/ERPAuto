#!/usr/bin/env node

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

function printUsage() {
  console.log(`
Usage:
  node scripts/prepare-release.js --channel <stable|preview> --changelog <file> [options]

Options:
  --channel <stable|preview>      Release channel. Required.
  --changelog <file>              Markdown changelog file. Required.
  --artifact <file>               Portable exe path. Default: dist/erpauto-portable.exe
  --version <x.y.z>               Release version. Default: package.json version
  --summary <text>                Optional short summary for notesSummary
  --published-at <ISO date>       Optional publish time. Default: current time
  --base-prefix <prefix>          Default: updates/win-portable
  --output <dir>                  Default: release-output
  --existing-index <file>         Existing index.json to merge with
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

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true })
}

function sha256File(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256')
    const stream = fs.createReadStream(filePath)
    stream.on('data', (chunk) => hash.update(chunk))
    stream.on('error', reject)
    stream.on('end', () => resolve(hash.digest('hex')))
  })
}

function loadExistingIndex(existingIndexPath, outputIndexPath) {
  const candidate = existingIndexPath || (fs.existsSync(outputIndexPath) ? outputIndexPath : null)
  if (!candidate) {
    return { releases: [] }
  }

  const parsed = readJson(candidate)
  if (!parsed || !Array.isArray(parsed.releases)) {
    throw new Error(`Invalid index file: ${candidate}`)
  }

  return parsed
}

function sortReleases(releases) {
  return [...releases].sort((left, right) => {
    const leftParts = String(left.version)
      .split('.')
      .map((part) => Number.parseInt(part, 10) || 0)
    const rightParts = String(right.version)
      .split('.')
      .map((part) => Number.parseInt(part, 10) || 0)

    const length = Math.max(leftParts.length, rightParts.length)
    for (let i = 0; i < length; i += 1) {
      const l = leftParts[i] || 0
      const r = rightParts[i] || 0
      if (r !== l) {
        return r - l
      }
    }

    const leftTime = new Date(left.publishedAt).getTime()
    const rightTime = new Date(right.publishedAt).getTime()
    if (rightTime !== leftTime) {
      return rightTime - leftTime
    }

    return 0
  })
}

async function main() {
  const args = parseArgs(process.argv.slice(2))

  if (args.help || args.h) {
    printUsage()
    process.exit(0)
  }

  const packageJson = readJson(path.resolve(process.cwd(), 'package.json'))
  const version = args.version || packageJson.version
  const channel = args.channel
  const changelogPath = args.changelog
  const artifactPath = path.resolve(process.cwd(), args.artifact || 'dist/erpauto-portable.exe')
  const basePrefix = args['base-prefix'] || 'updates/win-portable'
  const outputRoot = path.resolve(process.cwd(), args.output || 'release-output')
  const publishedAt = args['published-at'] || new Date().toISOString()
  const summary = args.summary

  assert(channel === 'stable' || channel === 'preview', 'Missing or invalid --channel')
  assert(changelogPath, 'Missing --changelog')
  assert(fs.existsSync(artifactPath), `Artifact not found: ${artifactPath}`)

  const resolvedChangelogPath = path.resolve(process.cwd(), changelogPath)
  assert(fs.existsSync(resolvedChangelogPath), `Changelog not found: ${resolvedChangelogPath}`)

  const artifactStat = fs.statSync(artifactPath)
  const sha256 = await sha256File(artifactPath)
  const fileName = `erpauto-${version}-${channel}-portable.exe`
  const changelogFileName = `${version}.md`

  const channelDir = path.join(outputRoot, basePrefix, channel)
  const artifactsDir = path.join(channelDir, 'artifacts')
  const changelogDir = path.join(channelDir, 'changelogs')
  const outputIndexPath = path.join(channelDir, 'index.json')

  ensureDir(artifactsDir)
  ensureDir(changelogDir)

  const targetArtifactPath = path.join(artifactsDir, fileName)
  const targetChangelogPath = path.join(changelogDir, changelogFileName)

  fs.copyFileSync(artifactPath, targetArtifactPath)
  fs.copyFileSync(resolvedChangelogPath, targetChangelogPath)

  const releaseEntry = {
    version,
    channel,
    artifactKey: `${basePrefix}/${channel}/artifacts/${fileName}`,
    sha256,
    size: artifactStat.size,
    publishedAt,
    changelogKey: `${basePrefix}/${channel}/changelogs/${changelogFileName}`,
    ...(summary ? { notesSummary: summary } : {})
  }

  const existingIndex = loadExistingIndex(
    args['existing-index'] ? path.resolve(process.cwd(), args['existing-index']) : null,
    outputIndexPath
  )

  const mergedReleases = sortReleases([
    releaseEntry,
    ...existingIndex.releases.filter(
      (item) => !(item.version === version && item.channel === channel)
    )
  ])

  fs.writeFileSync(
    outputIndexPath,
    `${JSON.stringify({ releases: mergedReleases }, null, 2)}\n`,
    'utf-8'
  )

  console.log('Release package prepared successfully.')
  console.log(`Channel:        ${channel}`)
  console.log(`Version:        ${version}`)
  console.log(`Artifact:       ${targetArtifactPath}`)
  console.log(`Changelog:      ${targetChangelogPath}`)
  console.log(`Index:          ${outputIndexPath}`)
  console.log(`SHA256:         ${sha256}`)
}

main().catch((error) => {
  console.error(`prepare-release failed: ${error.message}`)
  process.exit(1)
})

#!/usr/bin/env node

const fs = require('fs')
const path = require('path')
const yaml = require('js-yaml')
const { GetObjectCommand, PutObjectCommand, S3Client } = require('@aws-sdk/client-s3')

function usage() {
  console.log(`
Usage:
  node scripts/upload-release.js --channel <stable|preview> [options]

Options:
  --channel <stable|preview>  Release channel. Required.
  --source <dir>              Local release root. Default: release-output
  --config <file>             Config file path. Default: config.yaml
  --verify                    Read back remote index.json after upload
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

function loadConfig(configPath) {
  const raw = fs.readFileSync(configPath, 'utf-8')
  const parsed = yaml.load(raw)
  const update = parsed && parsed.update

  assert(update, 'Missing update config in config.yaml')
  assert(update.enabled, 'update.enabled is false')
  assert(update.endpoint, 'update.endpoint is required')
  assert(update.accessKey, 'update.accessKey is required')
  assert(update.secretKey, 'update.secretKey is required')
  assert(update.bucket, 'update.bucket is required')

  return update
}

function walkFiles(dirPath) {
  const results = []
  const entries = fs.readdirSync(dirPath, { withFileTypes: true })

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name)
    if (entry.isDirectory()) {
      results.push(...walkFiles(fullPath))
    } else {
      results.push(fullPath)
    }
  }

  return results
}

function getContentType(filePath) {
  const ext = path.extname(filePath).toLowerCase()
  if (ext === '.json') return 'application/json; charset=utf-8'
  if (ext === '.md') return 'text/markdown; charset=utf-8'
  if (ext === '.exe') return 'application/vnd.microsoft.portable-executable'
  return 'application/octet-stream'
}

async function readRemoteText(client, bucket, key) {
  const response = await client.send(
    new GetObjectCommand({
      Bucket: bucket,
      Key: key
    })
  )

  const chunks = []
  for await (const chunk of response.Body) {
    chunks.push(Buffer.from(chunk))
  }
  return Buffer.concat(chunks).toString('utf-8')
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help || args.h) {
    usage()
    process.exit(0)
  }

  const channel = args.channel
  assert(channel === 'stable' || channel === 'preview', 'Missing or invalid --channel')

  const sourceRoot = path.resolve(process.cwd(), args.source || 'release-output')
  const configPath = path.resolve(process.cwd(), args.config || 'config.yaml')
  const updateConfig = loadConfig(configPath)

  const uploadRoot = path.join(sourceRoot, updateConfig.basePrefix, channel)
  assert(fs.existsSync(uploadRoot), `Upload root not found: ${uploadRoot}`)

  const client = new S3Client({
    region: updateConfig.region || 'us-east-1',
    endpoint: updateConfig.endpoint,
    credentials: {
      accessKeyId: updateConfig.accessKey,
      secretAccessKey: updateConfig.secretKey
    },
    forcePathStyle: true
  })

  const files = walkFiles(uploadRoot)
  assert(files.length > 0, `No files found under ${uploadRoot}`)

  for (const filePath of files) {
    const relative = path.relative(sourceRoot, filePath).replace(/\\/g, '/')
    const body = fs.readFileSync(filePath)

    await client.send(
      new PutObjectCommand({
        Bucket: updateConfig.bucket,
        Key: relative,
        Body: body,
        ContentType: getContentType(filePath)
      })
    )

    console.log(`Uploaded: ${relative}`)
  }

  if (args.verify) {
    const indexKey = `${updateConfig.basePrefix}/${channel}/index.json`
    const remoteIndex = await readRemoteText(client, updateConfig.bucket, indexKey)
    console.log('')
    console.log(`Verified remote index: ${indexKey}`)
    console.log(remoteIndex)
  }
}

main().catch((error) => {
  console.error(`upload-release failed: ${error.message}`)
  process.exit(1)
})

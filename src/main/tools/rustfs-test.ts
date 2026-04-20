/**
 * RustFS Integration Test Script
 *
 * Tests RustFS connection and upload functionality
 * Usage: tsx src/main/tools/rustfs-test.ts
 *
 * Note: This test runs in standalone mode without Electron
 */

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  DeleteObjectCommand,
  type PutObjectCommandInput
} from '@aws-sdk/client-s3'
import * as path from 'path'
import * as fs from 'fs'
import { createCliLogger } from '../utils/cli-log'

const log = createCliLogger('RustfsTest')

// Test configuration
const TEST_CONFIG = {
  enabled: true,
  endpoint: 'http://192.168.110.114:9000',
  accessKey: 'dP4O7ePAzyH8earoXxE9',
  secretKey: '2vRPLnsh9Zi1KyBDymUtACyDdLHGfsLvw4MkG3cv',
  bucket: 'erpauto',
  region: 'us-east-1'
}

function createS3Client(config: typeof TEST_CONFIG) {
  return new S3Client({
    region: config.region,
    endpoint: config.endpoint,
    credentials: {
      accessKeyId: config.accessKey,
      secretAccessKey: config.secretKey
    },
    forcePathStyle: true
  })
}

function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase()
  const mimeTypes: Record<string, string> = {
    '.md': 'text/markdown; charset=utf-8',
    '.txt': 'text/plain; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.csv': 'text/csv; charset=utf-8'
  }
  return mimeTypes[ext] || 'application/octet-stream'
}

function generateReportKey(reportFileName: string, username: string): string {
  // Organize reports by user for easy access
  // Format: reports/cleaner/{username}/{filename}
  return `reports/cleaner/${username}/${reportFileName}`
}

async function runTests() {
  log.line('='.repeat(50))
  log.line('RustFS Integration Test')
  log.line('='.repeat(50))
  log.line()

  const client = createS3Client(TEST_CONFIG)

  // Test connection
  log.line('1. Testing connection...')
  try {
    const command = new ListObjectsV2Command({
      Bucket: TEST_CONFIG.bucket,
      Prefix: '',
      MaxKeys: 1
    })
    await client.send(command)
    log.success('Connection successful')
  } catch (error) {
    log.error('Connection failed', { error: (error as Error).message })
    return
  }
  log.line()

  // Test upload string
  log.line('2. Testing string upload...')
  const testContent = `# Test Report
Generated at: ${new Date().toISOString()}

This is a test report to verify RustFS integration.
`
  const testKey = `test/reports/test-${Date.now()}.md`
  try {
    const input: PutObjectCommandInput = {
      Bucket: TEST_CONFIG.bucket,
      Key: testKey,
      Body: Buffer.from(testContent, 'utf-8'),
      ContentType: 'text/markdown; charset=utf-8'
    }
    const command = new PutObjectCommand(input)
    const response = await client.send(command)
    log.success('Upload successful')
    log.line(`     Key: ${testKey}`)
    log.line(`     ETag: ${response.ETag}`)
  } catch (error) {
    log.error('Upload failed', { error: (error as Error).message })
    return
  }
  log.line()

  // Test download
  log.line('3. Testing download...')
  try {
    const command = new GetObjectCommand({
      Bucket: TEST_CONFIG.bucket,
      Key: testKey
    })
    const response = await client.send(command)
    const chunks: Buffer[] = []
    for await (const chunk of response.Body as any) {
      chunks.push(Buffer.from(chunk))
    }
    const content = Buffer.concat(chunks)
    log.success('Download successful')
    log.line(`     Size: ${content.length} bytes`)
    log.line(`     Content preview: ${content.toString('utf-8').slice(0, 50)}...`)
  } catch (error) {
    log.error('Download failed', { error: (error as Error).message })
  }
  log.line()

  // Test file upload (create a temporary file)
  log.line('4. Testing file upload...')
  const tempFilePath = path.join(process.cwd(), `test-file-${Date.now()}.md`)
  fs.writeFileSync(tempFilePath, testContent, 'utf-8')

  const fileKey = `test/files/test-file-${Date.now()}.md`
  try {
    const fileContent = fs.readFileSync(tempFilePath)
    const input: PutObjectCommandInput = {
      Bucket: TEST_CONFIG.bucket,
      Key: fileKey,
      Body: fileContent,
      ContentType: getMimeType(tempFilePath)
    }
    const command = new PutObjectCommand(input)
    const response = await client.send(command)
    log.success('File upload successful')
    log.line(`     Key: ${fileKey}`)
    log.line(`     ETag: ${response.ETag}`)
  } catch (error) {
    log.error('File upload failed', { error: (error as Error).message })
  }

  // Cleanup temp file
  try {
    fs.unlinkSync(tempFilePath)
    log.success('Temporary file cleaned up')
  } catch (e) {
    log.warn('Could not clean up temp file', { error: (e as Error).message })
  }
  log.line()

  // Test report key generation
  log.line('5. Testing report key generation...')
  const reportKey = generateReportKey('cleaner-report-2026-03-17-10-30-00.md', 'admin')
  log.success(`Generated key: ${reportKey}`)
  log.line()

  // Test cleanup (delete test files)
  log.line('6. Cleaning up test files...')
  try {
    const deleteCommand = new DeleteObjectCommand({
      Bucket: TEST_CONFIG.bucket,
      Key: testKey
    })
    await client.send(deleteCommand)
    log.success('Test string file deleted')
  } catch (error) {
    log.warn('Could not delete test string file', { error: (error as Error).message })
  }

  try {
    const deleteCommand = new DeleteObjectCommand({
      Bucket: TEST_CONFIG.bucket,
      Key: fileKey
    })
    await client.send(deleteCommand)
    log.success('Test file deleted')
  } catch (error) {
    log.warn('Could not delete test file', { error: (error as Error).message })
  }
  log.line()

  log.line('='.repeat(50))
  log.line('All tests completed!')
  log.line('='.repeat(50))
}

// Run tests
runTests().catch((error) => {
  log.error('Test failed with error', error instanceof Error ? { error: error.message } : error)
  process.exit(1)
})

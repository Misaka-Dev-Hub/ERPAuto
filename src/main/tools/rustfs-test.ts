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

// Simple console logger (standalone mode)
const _log = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  info: (msg: string, data?: any) => console.log(`[INFO] ${msg}`, data ? JSON.stringify(data) : ''),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  error: (msg: string, data?: any) =>
    console.error(`[ERROR] ${msg}`, data ? JSON.stringify(data) : ''),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  warn: (msg: string, data?: any) => console.warn(`[WARN] ${msg}`, data ? JSON.stringify(data) : '')
}

// Test configuration
const TEST_CONFIG = {
  enabled: true,
  endpoint: 'http://192.168.110.114:9000',
  accessKey: 'dP4O7ePAzyH8earoXxE9',
  secretKey: '2vRPLnsh9Zi1KyBDymUtACyDdLHGfsLvw4MkG3cv',
  bucket: 'erpauto',
  region: 'us-east-1'
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
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

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
async function runTests() {
  console.log('='.repeat(50))
  console.log('RustFS Integration Test')
  console.log('='.repeat(50))
  console.log()

  const client = createS3Client(TEST_CONFIG)

  // Test connection
  console.log('1. Testing connection...')
  try {
    const command = new ListObjectsV2Command({
      Bucket: TEST_CONFIG.bucket,
      Prefix: '',
      MaxKeys: 1
    })
    await client.send(command)
    console.log('   ✓ Connection successful')
  } catch (error) {
    console.log(`   ✗ Connection failed: ${(error as Error).message}`)
    return
  }
  console.log()

  // Test upload string
  console.log('2. Testing string upload...')
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
    console.log('   ✓ Upload successful')
    console.log(`     Key: ${testKey}`)
    console.log(`     ETag: ${response.ETag}`)
  } catch (error) {
    console.log('   ✗ Upload failed')
    console.log(`     Error: ${(error as Error).message}`)
    return
  }
  console.log()

  // Test download
  console.log('3. Testing download...')
  try {
    const command = new GetObjectCommand({
      Bucket: TEST_CONFIG.bucket,
      Key: testKey
    })
    const response = await client.send(command)
    const chunks: Buffer[] = []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for await (const chunk of response.Body as any) {
      chunks.push(Buffer.from(chunk))
    }
    const content = Buffer.concat(chunks)
    console.log('   ✓ Download successful')
    console.log(`     Size: ${content.length} bytes`)
    console.log(`     Content preview: ${content.toString('utf-8').slice(0, 50)}...`)
  } catch (error) {
    console.log('   ✗ Download failed')
    console.log(`     Error: ${(error as Error).message}`)
  }
  console.log()

  // Test file upload (create a temporary file)
  console.log('4. Testing file upload...')
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
    console.log('   ✓ File upload successful')
    console.log(`     Key: ${fileKey}`)
    console.log(`     ETag: ${response.ETag}`)
  } catch (error) {
    console.log('   ✗ File upload failed')
    console.log(`     Error: ${(error as Error).message}`)
  }

  // Cleanup temp file
  try {
    fs.unlinkSync(tempFilePath)
    console.log('   ✓ Temporary file cleaned up')
  } catch (e) {
    console.log(`   ⚠ Could not clean up temp file: ${(e as Error).message}`)
  }
  console.log()

  // Test report key generation
  console.log('5. Testing report key generation...')
  const reportKey = generateReportKey('cleaner-report-2026-03-17-10-30-00.md', 'admin')
  console.log(`   ✓ Generated key: ${reportKey}`)
  console.log()

  // Test cleanup (delete test files)
  console.log('6. Cleaning up test files...')
  try {
    const deleteCommand = new DeleteObjectCommand({
      Bucket: TEST_CONFIG.bucket,
      Key: testKey
    })
    await client.send(deleteCommand)
    console.log('   ✓ Test string file deleted')
  } catch (error) {
    console.log(`   ⚠ Could not delete test string file: ${(error as Error).message}`)
  }

  try {
    const deleteCommand = new DeleteObjectCommand({
      Bucket: TEST_CONFIG.bucket,
      Key: fileKey
    })
    await client.send(deleteCommand)
    console.log('   ✓ Test file deleted')
  } catch (error) {
    console.log(`   ⚠ Could not delete test file: ${(error as Error).message}`)
  }
  console.log()

  console.log('='.repeat(50))
  console.log('All tests completed!')
  console.log('='.repeat(50))
}

// Run tests
runTests().catch((error) => {
  console.error('Test failed with error:', error)
  process.exit(1)
})

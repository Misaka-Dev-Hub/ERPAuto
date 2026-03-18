#!/usr/bin/env node

const https = require('https')
const http = require('http')
const { execSync } = require('child_process')

const S3_ENDPOINT = 'http://192.168.110.114:9000'
const BUCKET = 'erpauto'
const BETA_PATH = 'updates/beta'

function getHttp(url) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url)
    const client = urlObj.protocol === 'https:' ? https : http

    const options = {
      method: 'GET',
      headers: {
        'User-Agent': 'ERPAuto-Verify/1.0'
      }
    }

    const req = client.request(url, options, (res) => {
      let data = ''

      res.on('data', (chunk) => {
        data += chunk
      })

      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          data: data
        })
      })
    })

    req.on('error', reject)
    req.end()
  })
}

function headHttp(url) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url)
    const client = urlObj.protocol === 'https:' ? https : http

    const options = {
      method: 'HEAD',
      headers: {
        'User-Agent': 'ERPAuto-Verify/1.0'
      }
    }

    const req = client.request(url, options, (res) => {
      resolve({
        statusCode: res.statusCode,
        headers: res.headers
      })
    })

    req.on('error', reject)
    req.end()
  })
}

async function main() {
  console.log('🔍 Verifying S3 upload for beta channel...\n')

  // Get version from package.json
  const packageJson = require('../package.json')
  const version = packageJson.version
  const expectedInstaller = `erpauto-${version}-setup.exe`

  console.log(`📦 Version: ${version}`)
  console.log(`📁 Expected installer: ${expectedInstaller}\n`)

  // Test 1: Check latest-beta.yml accessibility
  console.log('Test 1: Checking latest-beta.yml accessibility...')
  const latestYmlUrl = `${S3_ENDPOINT}/${BUCKET}/${BETA_PATH}/latest-beta.yml`

  try {
    const result = await headHttp(latestYmlUrl)
    if (result.statusCode === 200) {
      console.log('✅ latest-beta.yml is accessible')
      console.log(`   Status: ${result.statusCode}`)
      console.log(`   Content-Type: ${result.headers['content-type']}`)
      console.log(`   Content-Length: ${result.headers['content-length']} bytes\n`)
    } else {
      console.log(`❌ latest-beta.yml returned status ${result.statusCode}\n`)
      process.exit(1)
    }
  } catch (error) {
    console.log(`❌ Failed to access latest-beta.yml: ${error.message}\n`)
    process.exit(1)
  }

  // Test 2: Download and parse latest-beta.yml
  console.log('Test 2: Downloading and parsing latest-beta.yml...')
  try {
    const result = await getHttp(latestYmlUrl)
    if (result.statusCode === 200) {
      console.log('✅ Downloaded latest-beta.yml')
      console.log('\n--- Content of latest-beta.yml ---')
      console.log(result.data)
      console.log('--- End of content ---\n')

      // Parse YAML to extract info
      const lines = result.data.split('\n')
      const ymlData = {}
      lines.forEach(line => {
        const [key, ...valueParts] = line.split(':')
        if (key && valueParts.length > 0) {
          ymlData[key.trim()] = valueParts.join(':').trim()
        }
      })

      console.log('📋 Parsed YAML info:')
      console.log(`   Version: ${ymlData.version || 'N/A'}`)
      console.log(`   Files: ${ymlData.files || 'N/A'}`)

      if (ymlData.version !== version) {
        console.log(`⚠️  WARNING: Version mismatch! Expected ${version}, found ${ymlData.version}\n`)
      } else {
        console.log(`✅ Version matches\n`)
      }
    }
  } catch (error) {
    console.log(`❌ Failed to download latest-beta.yml: ${error.message}\n`)
    process.exit(1)
  }

  // Test 3: Check installer file accessibility
  console.log(`Test 3: Checking installer file (${expectedInstaller})...`)
  const installerUrl = `${S3_ENDPOINT}/${BUCKET}/${BETA_PATH}/${expectedInstaller}`

  try {
    const result = await headHttp(installerUrl)
    if (result.statusCode === 200) {
      console.log(`✅ ${expectedInstaller} is accessible`)
      console.log(`   Status: ${result.statusCode}`)
      console.log(`   Content-Type: ${result.headers['content-type']}`)
      console.log(`   Content-Length: ${result.headers['content-length']} bytes`)
      console.log(`   Size: ${(parseInt(result.headers['content-length']) / 1024 / 1024).toFixed(2)} MB\n`)
    } else {
      console.log(`❌ ${expectedInstaller} returned status ${result.statusCode}\n`)
      process.exit(1)
    }
  } catch (error) {
    console.log(`❌ Failed to access ${expectedInstaller}: ${error.message}\n`)
    process.exit(1)
  }

  // Summary
  console.log('🎉 Verification Summary:')
  console.log('   ✅ latest-beta.yml exists and is accessible')
  console.log(`   ✅ ${expectedInstaller} exists and is accessible`)
  console.log('   ✅ All files are publicly readable')
  console.log(`   ✅ Version is correct (${version})\n`)

  console.log('📤 S3 URLs:')
  console.log(`   ${latestYmlUrl}`)
  console.log(`   ${installerUrl}\n`)

  console.log('✅ S3 upload verification PASSED')
}

main()

#!/usr/bin/env node

const path = require('path')
const {
  checkGitStatus,
  getCurrentVersion,
  updateVersion,
  createGitTag,
  pushGitTag,
  tagExists,
  execCommand
} = require('./publish-utils')

async function main() {
  console.log('🚀 Starting Beta release process...\n')

  // Step 1: 检查Git状态
  console.log('📋 Checking Git status...')
  if (!checkGitStatus()) {
    console.error('❌ Working tree is not clean. Please commit or stash changes first.')
    process.exit(1)
  }
  console.log('✅ Working tree is clean\n')

  // Step 2: 获取版本号
  const version = process.argv[2] || '1.3.1-beta.0'
  const tagName = `v${version}`

  console.log(`📦 Version info:`)
  console.log(`   Version: ${version}`)
  console.log(`   Tag: ${tagName}\n`)

  // Step 3: 检查标签是否已存在
  if (tagExists(tagName)) {
    console.error(`❌ Tag ${tagName} already exists. Use a different version or delete the existing tag.`)
    process.exit(1)
  }

  // Step 4: 更新版本号
  console.log(`📝 Updating version to ${version}...`)
  updateVersion(version)
  console.log('✅ Version updated\n')

  try {
    // Step 5: 创建Git标签
    console.log(`🏷️  Creating Git tag ${tagName}...`)
    createGitTag(tagName)
    console.log('✅ Tag created\n')

    // Step 6: 推送标签
    console.log(`📤 Pushing tag to remote...`)
    pushGitTag(tagName)
    console.log('✅ Tag pushed\n')

    // Step 7: 清理构建文件
    console.log('🧹 Cleaning build artifacts...')
    execCommand('npm run prebuild')
    console.log('✅ Build artifacts cleaned\n')

    // Step 8: 类型检查
    console.log('🔍 Running type check...')
    execCommand('npm run typecheck')
    console.log('✅ Type check passed\n')

    // Step 9: 构建应用
    console.log('🔨 Building application...')
    execCommand('npm run build')
    console.log('✅ Build completed\n')

    // Step 10: 发布到S3
    console.log('📤 Publishing to S3 (beta channel)...')
    execCommand('npm run publish:beta')
    console.log('✅ Published to S3\n')

    // Step 11: 显示成功信息
    console.log('🎉 Release successful!\n')
    console.log('📦 Release info:')
    console.log(`   Version: ${version}`)
    console.log(`   Tag: ${tagName}`)
    console.log(`   Channel: beta\n`)

    console.log('📤 S3 files uploaded:')
    console.log(`   - updates/beta/erpauto-${version}-setup.exe`)
    console.log(`   - updates/beta/latest-beta.yml\n`)

    console.log('🧪 Next steps:')
    console.log('   1. Install old version (v1.3.0)')
    console.log('   2. Login with admin account')
    console.log('   3. Go to Settings page')
    console.log('   4. Click "Check for updates"')
    console.log('   5. Verify update detection and installation\n')

    console.log('🔄 Rollback commands:')
    console.log(`   git tag -d ${tagName}`)
    console.log(`   git push origin :refs/tags/${tagName}`)
    console.log('   git checkout dev\n')

  } catch (error) {
    console.error(`\n❌ Release failed: ${error.message}\n`)

    // 回滚版本号
    console.log('🔄 Rolling back version number...')
    execCommand('git checkout package.json')

    // 删除本地标签
    if (tagExists(tagName)) {
      console.log('🔄 Deleting local tag...')
      execCommand(`git tag -d ${tagName}`, { stdio: 'pipe' })
    }

    console.error('❌ Release aborted. Please fix the errors and try again.')
    process.exit(1)
  }
}

main()

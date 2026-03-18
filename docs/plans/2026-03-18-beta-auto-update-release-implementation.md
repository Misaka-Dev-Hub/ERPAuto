# Beta Auto-Update Release Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 创建自动化发布脚本，一键发布Beta版本到S3并验证完整的自动更新流程

**Architecture:** 使用Node.js脚本实现版本管理、Git标签创建、electron-builder构建发布、S3上传验证的完整自动化流程

**Tech Stack:** Node.js, electron-builder, Git, AWS SDK (S3), semver

---

## Task 1: 创建发布工具函数模块

**Files:**
- Create: `scripts/publish-utils.js`

**Step 1: 创建工具函数文件骨架**

```javascript
// scripts/publish-utils.js
const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')

/**
 * 执行命令并返回输出
 */
function execCommand(command, options = {}) {
  try {
    return execSync(command, {
      stdio: 'inherit',
      ...options
    })
  } catch (error) {
    throw new Error(`Command failed: ${command}\n${error.message}`)
  }
}

/**
 * 检查Git工作树状态
 */
function checkGitStatus() {
  const status = execSync('git status --porcelain', { encoding: 'utf-8' })
  return status.trim().length === 0
}

/**
 * 读取当前版本号
 */
function getCurrentVersion() {
  const packageJson = require('../package.json')
  return packageJson.version
}

/**
 * 更新package.json版本号
 */
function updateVersion(newVersion) {
  const packageJsonPath = path.join(__dirname, '..', 'package.json')
  const packageJson = require(packageJsonPath)
  packageJson.version = newVersion
  fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n')
}

/**
 * 创建Git标签
 */
function createGitTag(tagName) {
  execCommand(`git tag -a ${tagName} -m "Release ${tagName}"`)
}

/**
 * 推送Git标签到远程
 */
function pushGitTag(tagName) {
  execCommand(`git push origin ${tagName}`)
}

/**
 * 检查标签是否已存在
 */
function tagExists(tagName) {
  try {
    execSync(`git rev-parse ${tagName}`, { stdio: 'pipe' })
    return true
  } catch {
    return false
  }
}

module.exports = {
  execCommand,
  checkGitStatus,
  getCurrentVersion,
  updateVersion,
  createGitTag,
  pushGitTag,
  tagExists
}
```

**Step 2: 验证模块语法正确**

```bash
node -c scripts/publish-utils.js
```

Expected: 无输出（语法正确）

**Step 3: 提交工具函数模块**

```bash
git add scripts/publish-utils.js
git commit -m "feat: add publish utilities module

Add utility functions for version management, Git operations,
and status checking for automated release process.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 2: 创建Beta发布主脚本

**Files:**
- Create: `scripts/publish-beta.js`
- Modify: `package.json` (添加发布命令)

**Step 1: 创建发布脚本主体**

```javascript
#!/usr/bin/env node

// scripts/publish-beta.js
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
```

**Step 2: 添加发布命令到package.json**

在package.json的scripts中添加：
```json
"scripts": {
  "release:beta": "node scripts/publish-beta.js"
}
```

**Step 3: 验证脚本语法**

```bash
node -c scripts/publish-beta.js
```

Expected: 无输出（语法正确）

**Step 4: 提交发布脚本**

```bash
git add scripts/publish-beta.js package.json
git commit -m "feat: add automated beta release script

Add automated release script that handles version management,
Git tagging, building, and S3 publishing for beta releases.

Usage: npm run release:beta [version]

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 3: 测试发布脚本（干运行）

**Files:**
- Test: `scripts/publish-beta.js`

**Step 1: 创建测试标签验证流程**

```bash
# 测试标签检查功能
node -e "const {tagExists} = require('./scripts/publish-utils'); console.log('Test tag exists:', tagExists('v1.3.1-beta.0'))"
```

Expected: `Test tag exists: false`

**Step 2: 验证Git状态检查**

```bash
# 确保工作树干净
node -e "const {checkGitStatus} = require('./scripts/publish-utils'); console.log('Working tree clean:', checkGitStatus())"
```

Expected: `Working tree clean: true`

**Step 3: 验证版本号读取**

```bash
node -e "const {getCurrentVersion} = require('./scripts/publish-utils'); console.log('Current version:', getCurrentVersion())"
```

Expected: `Current version: 1.3.0`

**Step 4: 提交测试验证**

```bash
git add -A
git commit -m "test: verify publish utilities functions

Test basic utility functions for version management,
Git status checking, and tag validation.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 4: 执行Beta版本发布

**Files:**
- Modify: `package.json` (版本号自动更新)
- Build: `dist/`, `out/`

**Step 1: 确认分支和状态**

```bash
git branch --show-current
git status
```

Expected: 当前在 `feat/auto-updater-2310194993014109553` 分支，工作树干净

**Step 2: 执行发布脚本**

```bash
npm run release:beta 1.3.1-beta.0
```

Expected输出:
```
🚀 Starting Beta release process...
📋 Checking Git status...
✅ Working tree is clean
📦 Version info:
   Version: 1.3.1-beta.0
   Tag: v1.3.1-beta.0
📝 Updating version to 1.3.1-beta.0...
✅ Version updated
🏷️  Creating Git tag v1.3.1-beta.0...
✅ Tag created
📤 Pushing tag to remote...
✅ Tag pushed
...
🎉 Release successful!
```

**Step 3: 验证Git标签已创建**

```bash
git tag -l "v1.3.1-beta.0"
git ls-remote --tags origin | grep "v1.3.1-beta.0"
```

Expected: 本地和远程都存在该标签

**Step 4: 验证版本号已更新**

```bash
cat package.json | grep version
```

Expected: `"version": "1.3.1-beta.0"`

**Step 5: 提交发布后的状态**

```bash
git add package.json
git commit -m "chore: bump version to 1.3.1-beta.0 after release"
```

---

## Task 5: 验证S3上传结果

**Files:**
- Verify: S3 bucket `erpauto/updates/beta/`

**Step 1: 使用AWS CLI检查S3文件**

```bash
# 列出beta通道的文件
aws s3 ls s3://erpauto/updates/beta/ --endpoint-url http://192.168.110.114:9000
```

Expected输出应包含:
```
2026-03-18 12:00:00     123456789 erpauto-1.3.1-beta.0-setup.exe
2026-03-18 12:00:00          1024 latest-beta.yml
```

**Step 2: 验证latest-beta.yml格式**

```bash
# 下载并检查latest-beta.yml
aws s3 cp s3://erpauto/updates/beta/latest-beta.yml - --endpoint-url http://192.168.110.114:9000
```

Expected: YAML文件包含正确的版本、文件路径、SHA512哈希等信息

**Step 3: 验证安装包可访问性**

```bash
# 测试文件是否可公开访问
curl -I http://192.168.110.114:9000/erpauto/updates/beta/latest-beta.yml
```

Expected: HTTP 200 OK响应

**Step 4: 记录验证结果**

创建验证日志文件 `docs/releases/1.3.1-beta.0-verification.md`:
```markdown
# Release 1.3.1-beta.0 Verification

**Date:** 2026-03-18
**Status:** ✅ Verified

## S3 Files
- [x] erpauto-1.3.1-beta.0-setup.exe uploaded
- [x] latest-beta.yml uploaded
- [x] Files are publicly accessible
- [x] YAML format is valid

## Next Steps
- Install v1.3.0
- Test update flow
```

**Step 5: 提交验证文档**

```bash
git add docs/releases/1.3.1-beta.0-verification.md
git commit -m "docs: add release 1.3.1-beta.0 verification log

Record S3 upload verification results for beta release.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 6: 完整更新流程测试

**Files:**
- Test: Installed application

**Step 1: 准备测试环境**

```bash
# 检出v1.3.0版本用于测试
git stash
git checkout v1.3.0 || git checkout tags/v1.3.0
```

**Step 2: 构建并安装旧版本**

```bash
npm run build:win
# 安装生成的 erpauto-1.3.0-setup.exe
```

**Step 3: 启动应用并登录**

- 启动ERPAuto应用
- 使用管理员账号登录
- 进入设置页面

**Step 4: 检查当前版本和通道**

在设置页面中验证:
- 当前版本显示为 v1.3.0
- 更新通道显示为 Beta（或允许切换到Beta）

**Step 5: 手动检查更新**

点击"检查更新"按钮，验证:
- 应用检测到新版本 v1.3.1-beta.0
- 显示更新通知
- 开始下载更新

**Step 6: 验证下载和安装**

- 观察下载进度
- 下载完成后显示"更新已就绪"
- 点击"立即重启安装"
- 应用关闭并安装新版本

**Step 7: 验证更新成功**

重新启动应用后验证:
- 版本号显示为 v1.3.1-beta.0
- 应用功能正常
- 设置页面显示"已是最新版本"

**Step 8: 记录测试结果**

更新验证文档:
```markdown
## Update Flow Test
- [x] Old version (1.3.0) installed
- [x] Admin login successful
- [x] Beta channel accessible
- [x] Update detected successfully
- [x] Download completed
- [x] Installation successful
- [x] New version (1.3.1-beta.0) running
```

---

## Task 7: 回滚到开发分支

**Files:**
- Restore: Git branches

**Step 1: 切换回开发分支**

```bash
git checkout dev
git pull origin dev
```

**Step 2: 合并feature分支（可选）**

如果测试成功，考虑合并到dev:
```bash
git merge feat/auto-updater-2310194993014109553
git push origin dev
```

**Step 3: 清理测试环境**

```bash
# 如果需要，删除测试用的本地文件
# 卸载测试版本的应用
```

**Step 4: 恢复stash的更改（如果有）**

```bash
git stash pop
```

**Step 5: 创建最终总结报告**

创建 `docs/releases/1.3.1-beta.0-summary.md`:
```markdown
# Release 1.3.1-beta.0 Summary

**Release Date:** 2026-03-18
**Status:** ✅ Success

## What's New
- First auto-update enabled release
- Beta channel for testing
- Automated release pipeline

## Verification
- ✅ Build successful
- ✅ S3 upload verified
- ✅ Update flow tested
- ✅ Installation successful

## Metrics
- Version: 1.3.1-beta.0
- Channel: beta
- Package size: ~120MB
- Upload time: ~2 minutes

## Next Steps
- Monitor beta user feedback
- Prepare for stable release
- Update documentation
```

**Step 6: 提交最终文档**

```bash
git add docs/releases/
git commit -m "docs: add release 1.3.1-beta.0 summary and verification

Complete documentation for beta release including verification
results and testing summary.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## 🎯 完成标准

- [x] 发布脚本创建完成
- [x] 版本号自动更新
- [x] Git标签创建并推送
- [x] 应用成功构建
- [x] 文件上传到S3
- [x] 更新流程测试通过
- [x] 文档完整记录

## 📚 相关文档

- [Design Document](./2026-03-18-beta-auto-update-release-design.md)
- [electron-builder Documentation](https://www.electron.build/)
- [electron-updater Documentation](https://www.electron.build/auto-update)

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
  try {
    const status = execSync('git status --porcelain', { encoding: 'utf-8' })
    return status.trim().length === 0
  } catch (error) {
    throw new Error(`Failed to check git status: ${error.message}`)
  }
}

/**
 * 读取当前版本号
 */
function getCurrentVersion() {
  // Clear require cache to ensure fresh data
  delete require.cache[require.resolve('../package.json')]
  const packageJson = require('../package.json')
  return packageJson.version
}

/**
 * 更新package.json版本号
 */
function updateVersion(newVersion) {
  // Basic semver validation
  if (!/^\d+\.\d+\.\d+/.test(newVersion)) {
    throw new Error(`Invalid semver version: ${newVersion}`)
  }

  const packageJsonPath = path.join(__dirname, '..', 'package.json')
  const packageJson = require(packageJsonPath)
  packageJson.version = newVersion

  // Atomic write: write to temp file, then rename
  const tempPath = `${packageJsonPath}.tmp`
  fs.writeFileSync(tempPath, JSON.stringify(packageJson, null, 2) + '\n')
  fs.renameSync(tempPath, packageJsonPath)
}

/**
 * 验证并清理标签名称
 */
function sanitizeTagName(tagName) {
  // Git tags: alphanumeric, dot, hyphen, underscore
  if (!/^[a-zA-Z0-9._-]+$/.test(tagName)) {
    throw new Error(`Invalid tag name: ${tagName}. Only alphanumeric, dot, hyphen, and underscore allowed.`)
  }
  return tagName
}

/**
 * 创建Git标签
 */
function createGitTag(tagName) {
  const sanitized = sanitizeTagName(tagName)
  execCommand(`git tag -a ${sanitized} -m "Release ${sanitized}"`)
}

/**
 * 推送Git标签到远程
 */
function pushGitTag(tagName) {
  const sanitized = sanitizeTagName(tagName)
  execCommand(`git push origin ${sanitized}`)
}

/**
 * 检查标签是否已存在
 */
function tagExists(tagName) {
  const sanitized = sanitizeTagName(tagName)
  try {
    execSync(`git rev-parse ${sanitized}`, { stdio: 'pipe' })
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
  tagExists,
  sanitizeTagName
}

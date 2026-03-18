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

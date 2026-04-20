/**
 * Configuration Path Debug Tool
 *
 * Run this to see where config files will be stored in different modes
 * Usage: npx tsx src/main/tools/config-path-debug.ts
 */

import * as path from 'path'
import { createCliLogger } from '../utils/cli-log'

const cli = createCliLogger('ConfigPathDebug')

// Simulate different environments
const scenarios = [
  {
    name: 'Development Mode (开发环境)',
    env: {
      NODE_ENV: 'development',
      APP_PACKAGED: 'false'
    },
    appData: 'C:\\Users\\test\\AppData\\Roaming\\erpauto',
    projectRoot: 'D:\\Projects\\ERPAuto'
  },
  {
    name: 'Production - Portable (便携版)',
    env: {
      NODE_ENV: 'production',
      APP_PACKAGED: 'true'
    },
    appData: 'C:\\Users\\test\\AppData\\Roaming\\erpauto',
    projectRoot: 'D:\\Projects\\ERPAuto',
    exeDir: 'D:\\PortableApps\\ERPAuto'
  },
  {
    name: 'Production - Installed (安装版)',
    env: {
      NODE_ENV: 'production',
      APP_PACKAGED: 'true'
    },
    appData: 'C:\\Users\\test\\AppData\\Roaming\\erpauto',
    projectRoot: 'D:\\Projects\\ERPAuto'
  }
]

cli.line('╔════════════════════════════════════════════════════════════════╗')
cli.line('║         ERPAuto Configuration Path Debug Tool                 ║')
cli.line('╚════════════════════════════════════════════════════════════════╝')
cli.line()

for (const scenario of scenarios) {
  cli.line(`📋 ${scenario.name}`)
  cli.line('─'.repeat(60))

  const isDev = scenario.env.NODE_ENV === 'development' || scenario.env.APP_PACKAGED === 'false'

  let configPath: string
  let backupPath: string

  if (isDev) {
    // 开发环境：项目根目录
    configPath = path.join(scenario.projectRoot, 'config.yaml')
    backupPath = path.join(scenario.projectRoot, 'config.yaml.backup')
  } else {
    // 生产环境（便携版和安装版）：用户数据目录
    configPath = path.join(scenario.appData, 'config.yaml')
    backupPath = path.join(scenario.appData, 'config.yaml.backup')
  }

  cli.line(`  NODE_ENV: ${scenario.env.NODE_ENV}`)
  cli.line(`  APP_PACKAGED: ${scenario.env.APP_PACKAGED}`)
  cli.line(`  Is Development: ${isDev ? '✓ Yes' : '✗ No'}`)
  if ('exeDir' in scenario) {
    cli.line(`  EXE Directory: ${scenario.exeDir}`)
  }
  cli.line(`  → Config Path: ${configPath}`)
  cli.line(`  → Backup Path: ${backupPath}`)
  cli.line()
}

cli.line('╔════════════════════════════════════════════════════════════════╗')
cli.line('║  Configuration Strategy (配置策略):                           ║')
cli.line('╚════════════════════════════════════════════════════════════════╝')
cli.line(`
┌─────────────┬──────────────────────────────────────────────────────────┐
│   环境      │   配置文件位置                                           │
├─────────────┼──────────────────────────────────────────────────────────┤
│ 开发环境    │  项目根目录\\config.yaml                                  │
│             │  方便编辑和调试，配置随代码版本管理                        │
├─────────────┼──────────────────────────────────────────────────────────┤
│ 生产环境    │  %APPDATA%\\erpauto\\config.yaml                           │
│ (便携版/    │  符合 Windows 规范，应用升级时配置保留，安全               │
│  安装版)    │                                                          │
└─────────────┴──────────────────────────────────────────────────────────┘

💡 优势:
   ✓ 开发时配置在项目根目录，方便版本控制和团队协作
   ✓ 生产环境配置在用户数据目录，应用升级不会丢失配置
   ✓ 配置不暴露在应用目录，更安全
   ✓ 多用户环境下，每个用户有独立的配置
`)

cli.line('╔════════════════════════════════════════════════════════════════╗')
cli.line('║  Recommended Directory Structure:                             ║')
cli.line('╚════════════════════════════════════════════════════════════════╝')
cli.line(`
【开发环境】
D:\\Projects\\ERPAuto\\
├── src\\
├── package.json
├── config.yaml           # 开发配置（可加入 .gitignore）
├── config.yaml.backup    # 自动备份
└── config.template.yaml  # 配置模板（提交到版本控制）

【生产环境 - 便携版/安装版】
C:\\Users\\<user>\\AppData\\Roaming\\erpauto\\
├── config.yaml           # 用户配置
└── config.yaml.backup    # 自动备份
`)

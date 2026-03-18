/**
 * Migration Script: .env to config.yaml
 *
 * Usage: npx tsx scripts/migrate-env-to-yaml.ts
 *
 * This script migrates the old .env configuration to the new YAML format.
 * ERP configuration is NOT migrated as it's now stored in the database per user.
 */

import * as fs from 'fs'
import * as path from 'path'
import yaml from 'js-yaml'

const ENV_PATH = path.resolve(process.cwd(), '.env')
const YAML_PATH = path.resolve(process.cwd(), 'config.yaml')
const BACKUP_PATH = path.resolve(process.cwd(), '.env.backup')

interface EnvConfig {
  [key: string]: string
}

function parseEnvFile(content: string): EnvConfig {
  const result: EnvConfig = {}
  const lines = content.split('\n')

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue

    const [key, ...valueParts] = trimmed.split('=')
    if (key && valueParts.length > 0) {
      result[key.trim()] = valueParts.join('=').trim()
    }
  }

  return result
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function migrate() {
  console.log('🔄 Starting migration from .env to config.yaml...\n')

  if (!fs.existsSync(ENV_PATH)) {
    console.error('❌ .env file not found at:', ENV_PATH)
    process.exit(1)
  }

  const envContent = fs.readFileSync(ENV_PATH, 'utf-8')
  const env = parseEnvFile(envContent)

  // Build configuration object (without ERP)
  const config = {
    database: {
      activeType: (env.DB_TYPE || 'mysql').toLowerCase() as 'mysql' | 'sqlserver',
      mysql: {
        host: env.DB_MYSQL_HOST || 'localhost',
        port: parseInt(env.DB_MYSQL_PORT || '3306', 10),
        database: env.DB_NAME || '',
        username: env.DB_USERNAME || '',
        password: env.DB_PASSWORD || '',
        charset: env.DB_MYSQL_CHARSET || 'utf8mb4'
      },
      sqlserver: {
        server: env.DB_SERVER || 'localhost',
        port: parseInt(env.DB_SQLSERVER_PORT || '1433', 10),
        database: env.DB_NAME || '',
        username: env.DB_USERNAME || '',
        password: env.DB_PASSWORD || '',
        driver: env.DB_SQLSERVER_DRIVER || 'ODBC Driver 18 for SQL Server',
        trustServerCertificate: env.DB_TRUST_SERVER_CERTIFICATE === 'yes'
      }
    },
    paths: {
      dataDir: env.PATH_DATA_DIR || './data/',
      defaultOutput: env.PATH_DEFAULT_OUTPUT || 'output.xlsx',
      validationOutput: env.PATH_VALIDATION_OUTPUT || 'validation-result.xlsx'
    },
    extraction: {
      batchSize: parseInt(env.EXTRACTION_BATCH_SIZE || '100', 10),
      verbose: env.EXTRACTION_VERBOSE !== 'false',
      autoConvert: env.EXTRACTION_AUTO_CONVERT !== 'false',
      mergeBatches: env.EXTRACTION_MERGE_BATCHES !== 'false',
      enableDbPersistence: env.EXTRACTION_ENABLE_DB_PERSISTENCE !== 'false'
    },
    validation: {
      dataSource: env.VALIDATION_DATA_SOURCE || 'database_full',
      batchSize: parseInt(env.VALIDATION_BATCH_SIZE || '2000', 10),
      matchMode: env.VALIDATION_MATCH_MODE || 'substring',
      enableCrud: env.VALIDATION_ENABLE_CRUD === 'true',
      defaultManager: env.VALIDATION_DEFAULT_MANAGER || ''
    },
    orderResolution: {
      tableName: env.DB_TABLE_NAME || '',
      productionIdField: env.DB_FIELD_PRODUCTION_ID || '',
      orderNumberField: env.DB_FIELD_ORDER_NUMBER || ''
    }
  }

  // Backup .env
  if (fs.existsSync(ENV_PATH)) {
    fs.copyFileSync(ENV_PATH, BACKUP_PATH)
    console.log('📁 Backed up .env to .env.backup')
  }

  // Write YAML with header comments
  const header = `# ================================\n# ERPAuto 配置文件\n# ================================\n# 由 .env 迁移生成\n# 迁移时间：${new Date().toISOString()}\n# 注意：ERP 配置已迁移到数据库 (dbo_BIPUsers 表)\n# ================================\n\n`

  const yamlContent = yaml.dump(config, {
    indent: 2,
    lineWidth: -1,
    noRefs: true,
    quotingType: '"',
    forceQuotes: false
  })

  fs.writeFileSync(YAML_PATH, header + yamlContent, 'utf-8')

  console.log('✅ Migration completed successfully!')
  console.log(`📁 Config saved to: ${YAML_PATH}`)
  console.log('\n📋 Next steps:')
  console.log('   1. Review config.yaml and verify all values')
  console.log('   2. Test the application thoroughly')
  console.log('   3. Remove .env file when confident (optional)\n')
}

migrate()

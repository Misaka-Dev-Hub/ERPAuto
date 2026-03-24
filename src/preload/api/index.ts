import { processApi } from './process'
import { fileApi } from './file'
import { extractorApi } from './extractor'
import { cleanerApi } from './cleaner'
import { resolverApi } from './resolver'
import { authApi } from './auth'
import { databaseApi } from './database'
import { validationApi } from './validation'
import {
  configApi,
  materialTypeApi,
  materialsApi,
  reportApi,
  settingsApi,
  updateApi,
  userErpConfigApi
} from './materials'
import { loggerApi } from './logger'
import { playwrightBrowserApi } from './browser-download'

export const api = {
  process: processApi,
  file: fileApi,
  extractor: extractorApi,
  cleaner: cleanerApi,
  resolver: resolverApi,
  auth: authApi,
  database: databaseApi,
  validation: validationApi,
  materials: materialsApi,
  settings: settingsApi,
  materialType: materialTypeApi,
  userErpConfig: userErpConfigApi,
  config: configApi,
  logger: loggerApi,
  report: reportApi,
  update: updateApi,
  playwrightBrowser: playwrightBrowserApi
} as const

export type ElectronApi = typeof api

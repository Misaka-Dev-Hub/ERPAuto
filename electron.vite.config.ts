import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { execSync } from 'child_process'
import { createRequire } from 'module'

// Get git hash (first 7 characters)
const getGitHash = (): string => {
  try {
    return execSync('git rev-parse --short=7 HEAD', { encoding: 'utf-8' }).trim()
  } catch {
    return 'unknown'
  }
}

// Get version from package.json
const require = createRequire(import.meta.url)
const version = require('./package.json').version
const gitHash = getGitHash()
const appChannel = process.env.APP_CHANNEL === 'preview' ? 'preview' : 'stable'

export default defineConfig({
  main: {
    define: {
      __APP_CHANNEL__: JSON.stringify(appChannel)
    }
  },
  preload: {
    define: {
      __APP_CHANNEL__: JSON.stringify(appChannel)
    }
  },
  renderer: {
    define: {
      __APP_VERSION__: JSON.stringify(version),
      __GIT_HASH__: JSON.stringify(gitHash),
      __APP_CHANNEL__: JSON.stringify(appChannel)
    },
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src')
      }
    },
    plugins: [
      react(),
      tailwindcss(),
      {
        name: 'update-title',
        transformIndexHtml(html) {
          return html.replace(
            '<title>ERP Auto Tool</title>',
            `<title>ERPAuto - v${version}(${gitHash})</title>`
          )
        }
      }
    ]
  }
})

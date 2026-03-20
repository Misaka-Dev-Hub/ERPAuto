#!/usr/bin/env node

const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')

const rootDir = process.cwd()
const sourcePath = path.join(rootDir, 'build', 'PortableUpdater.cs')
const outputDir = path.join(rootDir, 'build', 'bin')
const outputPath = path.join(outputDir, 'portable-updater.exe')

function findCompiler() {
  const candidates = [
    'C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe',
    'C:\\Windows\\Microsoft.NET\\Framework\\v4.0.30319\\csc.exe'
  ]

  return candidates.find((candidate) => fs.existsSync(candidate)) || null
}

function main() {
  if (process.platform !== 'win32') {
    console.log('Skipping updater compilation on non-Windows platform.')
    return
  }

  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Updater source not found: ${sourcePath}`)
  }

  const compiler = findCompiler()
  if (!compiler) {
    throw new Error('Unable to find csc.exe for compiling portable-updater.exe')
  }

  fs.mkdirSync(outputDir, { recursive: true })

  const compileArgs = ['/nologo', '/target:exe', '/optimize+', `/out:${outputPath}`, sourcePath]

  const result = spawnSync(compiler, compileArgs, {
    cwd: rootDir,
    stdio: 'inherit'
  })

  if (result.status !== 0) {
    throw new Error(`csc.exe failed with exit code ${result.status}`)
  }

  console.log(`Portable updater compiled successfully: ${outputPath}`)
}

try {
  main()
} catch (error) {
  console.error(`compile-updater failed: ${error.message}`)
  process.exit(1)
}

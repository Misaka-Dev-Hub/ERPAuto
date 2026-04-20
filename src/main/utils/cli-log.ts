function stringifyMeta(meta: unknown): string {
  if (meta === undefined) {
    return ''
  }

  if (typeof meta === 'string') {
    return ` ${meta}`
  }

  try {
    return ` ${JSON.stringify(meta)}`
  } catch {
    return ' [unserializable]'
  }
}

function write(stream: NodeJS.WriteStream, message: string = ''): void {
  stream.write(`${message}\n`)
}

export function createCliLogger(scope?: string) {
  const prefix = scope ? `[${scope}] ` : ''

  return {
    line: (message: string = '') => write(process.stdout, message),
    errorLine: (message: string = '') => write(process.stderr, message),
    info: (message: string, meta?: unknown) =>
      write(process.stdout, `${prefix}[INFO] ${message}${stringifyMeta(meta)}`),
    warn: (message: string, meta?: unknown) =>
      write(process.stderr, `${prefix}[WARN] ${message}${stringifyMeta(meta)}`),
    error: (message: string, meta?: unknown) =>
      write(process.stderr, `${prefix}[ERROR] ${message}${stringifyMeta(meta)}`),
    success: (message: string, meta?: unknown) =>
      write(process.stdout, `${prefix}[OK] ${message}${stringifyMeta(meta)}`)
  }
}

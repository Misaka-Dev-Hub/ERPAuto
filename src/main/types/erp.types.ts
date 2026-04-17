export interface ErpConfig {
  url: string
  username: string
  password: string
  headless?: boolean // Optional: override default headless setting
  recordVideoDir?: string
}

export interface ErpSession {
  browser: import('playwright').Browser
  context: import('playwright').BrowserContext
  page: import('playwright').Page
  mainFrame: import('playwright').Frame // #forwardFrame content frame - main working frame after login
  isLoggedIn: boolean
}

export interface ProgressCallback {
  (message: string, progress?: number): void
}

export interface ErpConfig {
  url: string;
  username: string;
  password: string;
}

export interface ErpSession {
  browser: import('playwright').Browser;
  context: import('playwright').BrowserContext;
  page: import('playwright').Page;
  isLoggedIn: boolean;
}

export interface ProgressCallback {
  (message: string, progress?: number): void;
}
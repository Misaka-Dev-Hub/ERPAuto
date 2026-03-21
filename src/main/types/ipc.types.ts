export interface IpcResult<T = unknown> {
  success: boolean
  data?: T
  error?: string
  code?: string
}

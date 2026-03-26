import type { ResolverInput } from '../../main/types/resolver-ipc.types'
import { IPC_CHANNELS } from '../../shared/ipc-channels'
import { invokeIpc } from '../lib/ipc'

export const resolverApi = {
  resolve: (input: ResolverInput) => invokeIpc(IPC_CHANNELS.RESOLVER_RESOLVE, input),
  validateFormat: (inputs: string[]) => invokeIpc(IPC_CHANNELS.RESOLVER_VALIDATE_FORMAT, inputs)
} as const

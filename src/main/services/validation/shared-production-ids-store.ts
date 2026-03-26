export class SharedProductionIdsStore {
  private sharedProductionIdsBySender = new Map<number, Set<string>>()

  set(senderId: number, ids: string[]): void {
    this.sharedProductionIdsBySender.set(senderId, new Set(ids))
  }

  get(senderId: number): string[] {
    const senderSet = this.sharedProductionIdsBySender.get(senderId)
    return senderSet ? [...senderSet] : []
  }

  clear(senderId: number): void {
    this.sharedProductionIdsBySender.delete(senderId)
  }
}

export const sharedProductionIdsStore = new SharedProductionIdsStore()

type CleanerLogger = {
  verbose: (message: string, meta?: Record<string, unknown>) => void
  warn: (message: string, meta?: Record<string, unknown>) => void
}

export class AsyncMutex {
  private queue: Promise<void> = Promise.resolve()

  async runExclusive<T>(task: () => Promise<T>): Promise<T> {
    let release!: () => void
    const next = new Promise<void>((resolve) => {
      release = resolve
    })

    const previous = this.queue
    this.queue = this.queue.then(() => next)

    await previous
    try {
      return await task()
    } finally {
      release()
    }
  }
}

export class ConcurrencyTracker {
  private activeWorkers = 0
  private waitQueue = 0
  private mutexWaitCount = 0
  private currentOwnerWorkerId: number | null = null
  private currentOwnerOrderNumber: string | null = null
  private waitStartedAt = new Map<number, number>()

  constructor(private readonly log: CleanerLogger) {}

  workerStarted(workerId: number, orderNumber: string): void {
    this.activeWorkers++
    this.log.verbose('[CONCURRENCY] Worker started', {
      workerId,
      orderNumber,
      activeWorkers: this.activeWorkers,
      waitQueue: this.waitQueue,
      waitingForPopupMutex: this.mutexWaitCount > 0
    })
  }

  workerCompleted(workerId: number, orderNumber: string): void {
    this.activeWorkers--
    this.log.verbose('[CONCURRENCY] Worker completed', {
      workerId,
      orderNumber,
      activeWorkers: this.activeWorkers,
      queueRemaining: this.waitQueue
    })
  }

  waitingForMutex(workerId: number, orderNumber: string): void {
    this.mutexWaitCount++
    this.waitQueue++
    this.waitStartedAt.set(workerId, Date.now())
    this.log.warn('[CONCURRENCY] Worker waiting for popup mutex', {
      workerId,
      orderNumber,
      mutexWaitCount: this.mutexWaitCount,
      activeWorkers: this.activeWorkers,
      queueDepth: this.waitQueue,
      currentOwnerWorkerId: this.currentOwnerWorkerId,
      currentOwnerOrderNumber: this.currentOwnerOrderNumber
    })
  }

  acquiredMutex(workerId: number, orderNumber: string): void {
    const waitStartedAt = this.waitStartedAt.get(workerId)
    const waitDurationMs = waitStartedAt ? Date.now() - waitStartedAt : 0
    this.waitStartedAt.delete(workerId)
    this.mutexWaitCount--
    this.waitQueue = Math.max(0, this.waitQueue - 1)
    this.currentOwnerWorkerId = workerId
    this.currentOwnerOrderNumber = orderNumber
    this.log.verbose('[CONCURRENCY] Worker acquired popup mutex', {
      workerId,
      orderNumber,
      mutexWaitCount: this.mutexWaitCount,
      activeWorkers: this.activeWorkers,
      waitDurationMs,
      queueDepth: this.waitQueue
    })

    if (waitDurationMs > 5000) {
      this.log.warn('[CONCURRENCY] Popup mutex slow wait', {
        workerId,
        orderNumber,
        waitDurationMs,
        activeWorkers: this.activeWorkers,
        queueDepth: this.waitQueue,
        currentOwnerWorkerId: this.currentOwnerWorkerId,
        currentOwnerOrderNumber: this.currentOwnerOrderNumber
      })
    }
  }

  releasedMutex(workerId: number, orderNumber: string): void {
    if (this.currentOwnerWorkerId === workerId) {
      this.currentOwnerWorkerId = null
      this.currentOwnerOrderNumber = null
    }
    this.log.verbose('[CONCURRENCY] Worker released popup mutex', {
      workerId,
      orderNumber,
      activeWorkers: this.activeWorkers,
      queueDepth: this.waitQueue
    })
  }
}

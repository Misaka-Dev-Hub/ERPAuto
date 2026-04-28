export function clampNumber(
  value: number | undefined,
  fallback: number,
  min: number,
  max: number
): number {
  if (!Number.isFinite(value)) {
    return fallback
  }
  return Math.min(max, Math.max(min, Math.trunc(value ?? fallback)))
}

export function createBatches<T>(items: T[], batchSize: number): T[][] {
  const batches: T[][] = []
  for (let i = 0; i < items.length; i += batchSize) {
    batches.push(items.slice(i, i + batchSize))
  }
  return batches
}

export function getMissingOrders(inputOrders: string[], processedOrders: Set<string>): string[] {
  const uniqueInputOrders = Array.from(new Set(inputOrders))
  return uniqueInputOrders.filter((order) => !processedOrders.has(order))
}

export async function runWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number, workerId: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length)
  const limit = Math.max(1, Math.trunc(concurrency))
  let cursor = 0

  const runners = Array.from({ length: Math.min(limit, items.length) }, async (_, workerId) => {
    while (true) {
      const current = cursor
      cursor += 1
      if (current >= items.length) {
        return
      }
      results[current] = await worker(items[current], current, workerId)
    }
  })

  await Promise.all(runners)
  return results
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

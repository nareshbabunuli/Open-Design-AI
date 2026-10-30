/**
 * Per-process capacity guard for legacy in-process execution.
 *
 * This is a transitional safety mechanism, NOT a distributed queue.
 * For multi-instance deployment use a shared durable queue and worker leases.
 */
export class ExecutionCapacity {
  private readonly running = new Set<string>()
  private readonly waiting: Array<{ id: string; resolve: () => void; reject: (error: Error) => void }> = []

  constructor(
    readonly maxRunning: number,
    readonly maxWaiting: number,
  ) {
    if (!Number.isSafeInteger(maxRunning) || maxRunning < 1) throw new Error("maxRunning must be a positive integer")
    if (!Number.isSafeInteger(maxWaiting) || maxWaiting < 0) throw new Error("maxWaiting must be a nonnegative integer")
  }

  get snapshot() {
    return { running: this.running.size, waiting: this.waiting.length, maxRunning: this.maxRunning, maxWaiting: this.maxWaiting }
  }

  async acquire(id: string): Promise<() => void> {
    if (!id) throw new Error("job id required")
    if (this.running.has(id) || this.waiting.some(item => item.id === id)) throw new Error("duplicate job id")
    if (this.running.size < this.maxRunning) {
      this.running.add(id)
      return () => this.release(id)
    }
    if (this.waiting.length >= this.maxWaiting) throw new Error("execution capacity exceeded")
    await new Promise<void>((resolve, reject) => this.waiting.push({ id, resolve, reject }))
    return () => this.release(id)
  }

  cancelWaiting(id: string): boolean {
    const index = this.waiting.findIndex(item => item.id === id)
    if (index < 0) return false
    const [item] = this.waiting.splice(index, 1)
    item.reject(new Error("queued execution cancelled"))
    return true
  }

  private release(id: string) {
    if (!this.running.delete(id)) return
    const next = this.waiting.shift()
    if (next) {
      this.running.add(next.id)
      next.resolve()
    }
  }
}

export function executionCapacityFromEnv(env: Record<string, string | undefined> = process.env) {
  const maxRunning = Number(env.AUTOMATION_MAX_CONCURRENT ?? "2")
  const maxWaiting = Number(env.AUTOMATION_MAX_QUEUED ?? "20")
  return new ExecutionCapacity(maxRunning, maxWaiting)
}

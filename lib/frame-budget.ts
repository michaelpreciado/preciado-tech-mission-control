/** Rolling cadence/work budget. Never interprets an uncapped probe as a 1000 Hz display. */
export class FrameBudget {
  private cadence: number[] = []
  private costs: number[] = []
  private ticks = 0
  private last = 0
  interval = 1000 / 144
  private displayInterval = 1000 / 144
  private downshift = 1

  sample(now: number) {
    const delta = now - this.last
    this.last = now
    if (delta > 0 && delta < 100) {
      this.cadence.push(delta)
      if (this.cadence.length > 120) this.cadence.shift()
    }
    if (++this.ticks % 60 || this.cadence.length < 30) return
    const sorted = [...this.cadence].sort((a, b) => a - b)
    // Lower quartile estimates display cadence without mistaking stalls for refresh rate.
    this.displayInterval = Math.max(1000 / 144, Math.min(1000 / 60, sorted[Math.floor(sorted.length * 0.25)]))
    const costs = [...this.costs].sort((a, b) => a - b)
    const p95 = costs[Math.floor(costs.length * 0.95)] ?? 0
    if (p95 > 3) this.downshift = Math.min(4, this.downshift * 2)
    else if (p95 < 1.5) this.downshift = Math.max(1, this.downshift / 2)
    this.interval = this.displayInterval * this.downshift
  }

  record(cost: number) {
    this.costs.push(cost)
    if (this.costs.length > 120) this.costs.shift()
  }

  reset() {
    this.last = 0
    this.cadence.length = 0
    this.costs.length = 0
    this.ticks = 0
  }
}

export function rainDpr(width: number, height: number, native: number, lowPower: boolean) {
  const budget = lowPower ? 750_000 : 2_100_000
  return Math.min(native, lowPower ? 1 : 1.25, Math.sqrt(budget / Math.max(1, width * height)))
}

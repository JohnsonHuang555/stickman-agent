/**
 * 單一血池，以 barSize 為一條命條分段顯示。
 * 補血可跨回上一條命條，上限為滿血。
 */
export class LifePool {
  hp: number

  constructor(
    readonly bars: number,
    readonly barSize = 100,
  ) {
    this.hp = bars * barSize
  }

  get max(): number {
    return this.bars * this.barSize
  }

  get isDead(): boolean {
    return this.hp <= 0
  }

  /** 剩餘命條數（含當前這條）；死亡時為 0。 */
  get barsRemaining(): number {
    return Math.ceil(this.hp / this.barSize)
  }

  /** 當前命條的填滿比例 0..1。 */
  get currentBarFill(): number {
    if (this.isDead) return 0
    return (this.hp - (this.barsRemaining - 1) * this.barSize) / this.barSize
  }

  damage(amount: number): void {
    this.hp = Math.max(0, this.hp - amount)
  }

  heal(amount: number): void {
    if (this.isDead) return
    this.hp = Math.min(this.max, this.hp + amount)
  }
}

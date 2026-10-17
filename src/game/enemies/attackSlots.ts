/** 攻擊名額：同一時間允許主動出手的敵人數上限。 */
export class AttackSlots {
  private holders = new Set<number>()

  constructor(readonly capacity = 2) {}

  /** 已持有則維持；有空位則取得。回傳是否持有名額。 */
  request(id: number): boolean {
    if (this.holders.has(id)) return true
    if (this.holders.size >= this.capacity) return false
    this.holders.add(id)
    return true
  }

  release(id: number): void {
    this.holders.delete(id)
  }

  has(id: number): boolean {
    return this.holders.has(id)
  }

  get count(): number {
    return this.holders.size
  }
}

import type { ActiveHit, HitSpec, Hitter, Team } from '../combat/types'
import { GROUND_Y } from '../constants'
import type { Facing } from '../input/commands'
import type { World } from '../world'

export class Bullet implements Hitter {
  removed = false
  facing: Facing
  private travelled = 0

  constructor(
    public x: number,
    /** 離地高度。 */
    public h: number,
    public vx: number,
    public vh: number,
    readonly team: Team,
    readonly spec: HitSpec,
    readonly range: number,
    /** 霰彈槍的多顆彈丸共用，同一人只會被打中一次。 */
    readonly hitIds: Set<number>,
  ) {
    this.facing = vx < 0 ? -1 : 1
  }

  update(world: World): void {
    this.x += this.vx
    this.h += this.vh
    this.travelled += Math.abs(this.vx)
    if (this.travelled > this.range || this.h < 0 || this.x < 0 || this.x > world.floorWidth) this.removed = true
  }

  activeHit(): ActiveHit {
    return { spec: this.spec, box: { x: this.x - 3, y: GROUND_Y - this.h - 1, w: 6, h: 2 }, hitIds: this.hitIds }
  }

  onHitLanded(): void {
    this.removed = true
  }

  /** 曳光彈：外層橘色光暈、內層亮黃線，彈頭一個白點。 */
  draw(ctx: CanvasRenderingContext2D, camX: number): void {
    const x = this.x - camX
    const y = GROUND_Y - this.h
    const tx = x - this.vx * 2.8
    const ty = y + this.vh * 2.8
    ctx.lineCap = 'round'
    ctx.strokeStyle = 'rgba(255, 170, 40, 0.45)'
    ctx.lineWidth = 4
    ctx.beginPath()
    ctx.moveTo(tx, ty)
    ctx.lineTo(x, y)
    ctx.stroke()
    ctx.strokeStyle = '#fff3a0'
    ctx.lineWidth = 1.6
    ctx.beginPath()
    ctx.moveTo(tx, ty)
    ctx.lineTo(x, y)
    ctx.stroke()
    ctx.fillStyle = '#ffffff'
    ctx.beginPath()
    ctx.arc(x, y, 1.6, 0, Math.PI * 2)
    ctx.fill()
  }
}

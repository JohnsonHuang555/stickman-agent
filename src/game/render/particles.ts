import { GROUND_Y } from '../constants'

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  color: string
}

/** 碎片效果（物件碎裂、武器損壞）。 */
export class Particles {
  private list: Particle[] = []

  burst(x: number, y: number, color: string, count = 8): void {
    for (let i = 0; i < count; i++) {
      this.list.push({
        x,
        y,
        vx: (Math.random() * 2 - 1) * 2.2,
        vy: -Math.random() * 3 - 1,
        life: 30 + Math.random() * 20,
        color,
      })
    }
  }

  update(): void {
    for (const p of this.list) {
      p.x += p.vx
      p.y += p.vy
      p.vy += 0.3
      if (p.y > GROUND_Y) {
        p.y = GROUND_Y
        p.vy = 0
        p.vx *= 0.7
      }
      p.life--
    }
    this.list = this.list.filter((p) => p.life > 0)
  }

  draw(ctx: CanvasRenderingContext2D, camX: number): void {
    for (const p of this.list) {
      ctx.fillStyle = p.color
      ctx.fillRect(Math.round(p.x - camX), Math.round(p.y), 2, 2)
    }
  }
}

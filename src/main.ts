import { App } from './app'
import { play, unlockAudio } from './audio/sfx'
import { Keyboard } from './engine/keyboard'
import { startLoop } from './engine/loop'
import { VIEW_H, VIEW_W } from './game/constants'
import { World } from './game/world'
import { LocalLeaderboard } from './leaderboard/leaderboard'
import { loadNickname, saveNickname } from './leaderboard/profile'
import { askNickname } from './ui/nicknameDialog'

const canvas = document.getElementById('game') as HTMLCanvasElement
const ctx = canvas.getContext('2d')!

function fit() {
  const scale = Math.max(1, Math.floor(Math.min(innerWidth / VIEW_W, innerHeight / VIEW_H)))
  canvas.style.width = `${VIEW_W * scale}px`
  canvas.style.height = `${VIEW_H * scale}px`
}
addEventListener('resize', fit)
fit()

const params = new URLSearchParams(location.search)

if (import.meta.env.DEV && params.has('bosses')) {
  import('./dev/bossGallery').then(({ drawBossGallery }) => drawBossGallery(ctx))
} else if (import.meta.env.DEV && params.has('items')) {
  import('./dev/itemGallery').then(({ drawItemGallery }) => drawItemGallery(ctx))
} else if (import.meta.env.DEV && params.has('poses')) {
  import('./dev/poseGallery').then(({ drawPoseGallery }) => {
    const draw = () => drawPoseGallery(ctx)
    draw()
    document.fonts.ready.then(draw)
  })
} else {
  const keyboard = new Keyboard()
  keyboard.attach(window, unlockAudio)

  if (params.has('training')) {
    // 練習場：跳過標題與排行榜
    let world = new World({ mode: 'training' })
    world.sound = play
    startLoop(
      () => {
        world.update(keyboard.poll())
        if (world.restartRequested) {
          world = new World({ mode: 'training' })
          world.sound = play
        }
      },
      () => world.render(ctx),
    )
  } else {
    // ?floor=2 直接從 2F 開始（開發用）
    const startFloor = import.meta.env.DEV ? Math.max(0, Number(params.get('floor') ?? 1) - 1) : 0
    const app = new App({
      worldOptions: { mode: 'campaign', startFloor },
      leaderboard: new LocalLeaderboard(),
      askNickname,
      loadNickname,
      saveNickname,
      sound: play,
      onDialogClosed: () => keyboard.clear(),
    })
    startLoop(
      () => app.update(keyboard.poll()),
      () => app.render(ctx),
    )
  }
}

import { NICKNAME_MAX, normalizeNickname } from '../leaderboard/leaderboard'

const STYLE = `
.nick-overlay { position: fixed; inset: 0; display: flex; align-items: center; justify-content: center;
  background: rgba(0,0,0,.6); z-index: 10; font-family: "Press Start 2P", monospace; }
.nick-box { background: #15151c; border: 4px solid #f5c518; padding: 24px; width: min(420px, calc(100vw - 32px));
  box-sizing: border-box; color: #fff; text-align: center; image-rendering: pixelated; }
.nick-box h2 { font-size: 14px; margin: 0 0 12px; color: #f5c518; }
.nick-box p { font-size: 9px; line-height: 1.8; margin: 0 0 16px; color: #ccc; }
.nick-box input { width: 100%; box-sizing: border-box; font: inherit; font-size: 14px; padding: 10px;
  background: #000; color: #fff; border: 2px solid #888; outline: none; text-align: center; }
.nick-box input:focus { border-color: #f5c518; }
.nick-actions { display: flex; gap: 12px; margin-top: 16px; }
.nick-actions button { flex: 1; font: inherit; font-size: 10px; padding: 10px; cursor: pointer; border: 2px solid #fff; }
.nick-ok { background: #f5c518; color: #000; }
.nick-skip { background: transparent; color: #fff; }
`

/**
 * 詢問暱稱。按 OK（或 Enter）回傳整理過的暱稱；按 SKIP（或 Esc）、或輸入空白回傳 null。
 */
export function askNickname(options: { initial: string | null; firstTime: boolean }): Promise<string | null> {
  return new Promise((resolve) => {
    const style = document.createElement('style')
    style.textContent = STYLE
    const overlay = document.createElement('div')
    overlay.className = 'nick-overlay'
    overlay.innerHTML = `
      <div class="nick-box" role="dialog" aria-modal="true" aria-labelledby="nick-title">
        <h2 id="nick-title">${options.firstTime ? 'ENTER YOUR NAME' : 'NICKNAME'}</h2>
        <p>${options.firstTime ? '輸入暱稱登上排行榜<br>略過則以 ANONYMOUS 記錄' : '排行榜上顯示的名字'}</p>
        <input maxlength="${NICKNAME_MAX}" autocomplete="off" spellcheck="false" />
        <div class="nick-actions">
          <button class="nick-skip" type="button">${options.firstTime ? 'SKIP' : 'CANCEL'}</button>
          <button class="nick-ok" type="button">OK</button>
        </div>
      </div>`
    const input = overlay.querySelector('input')!
    input.value = options.initial ?? ''

    const close = (value: string | null) => {
      overlay.remove()
      style.remove()
      resolve(value)
    }
    overlay.querySelector('.nick-ok')!.addEventListener('click', () => close(normalizeNickname(input.value)))
    overlay.querySelector('.nick-skip')!.addEventListener('click', () => close(null))
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') close(normalizeNickname(input.value))
      else if (e.key === 'Escape') close(null)
    })

    document.head.append(style)
    document.body.append(overlay)
    input.focus()
    input.select()
  })
}

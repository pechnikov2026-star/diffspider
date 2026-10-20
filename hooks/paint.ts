import { GW, PAD, txt } from './grid'
import type { Gr } from './grid'
import { HIP, L1, L2 } from './spider'
import type { Sm } from './spider'

const DF = 0x01000000
const PAL: [number, number][] = [
  [0xff2bd6, 0x16001a], [0x22e3ff, 0x00141a], [0x8f5bff, 0xffffff], [0x2bff88, 0x001408],
  [0xff2bd6, DF], [0x22e3ff, DF], [0xb18cff, DF],
]
const GUT = 0x5c6370, CTX = 0x8b8f98, PEND = 0xff8fa3
const ADD = { bg: 0x0f2418, mk: 0x2bff88, fg: 0xe6e6e6 }
const DEL = { bg: 0x2a1216, mk: 0xff5c7a, fg: 0x8a5a5a }
const LEG = 0xb7c4ff, BODY = 0xffffff, EYE = 0xff3355
const BIT = [[0x01, 0x02, 0x04, 0x40], [0x08, 0x10, 0x20, 0x80]]

type Cv = { C: number; PW: number; PH: number; bits: Uint8Array; kd: Uint8Array }

const px = (v: Cv, x: number, y: number, k: number) => {
  x = Math.round(x)
  y = Math.round(y)
  if (x < 0 || y < 0 || x >= v.PW || y >= v.PH) return
  const i = (y >> 2) * v.C + (x >> 1)
  v.bits[i] = v.bits[i]! | BIT[x & 1]![y & 3]!
  if (k > v.kd[i]!) v.kd[i] = k
}

const ln = (v: Cv, x0: number, y0: number, x1: number, y1: number) => {
  const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0)))
  for (let j = 0; j <= n; j++) px(v, x0 + ((x1 - x0) * j) / n, y0 + ((y1 - y0) * j) / n, 1)
}

const legs = (v: Cv, s: Sm) => {
  const ch = Math.cos(s.hd), sh = Math.sin(s.hd), mx = L1 + L2 - 0.01
  s.lg.forEach((l, i) => {
    const hx = s.bx + ch * HIP[i]!, hy = s.by + sh * HIP[i]!
    let ex = l.fx - hx, ey = l.fy - hy, d = Math.hypot(ex, ey)
    if (d > mx) { ex *= mx / d; ey *= mx / d; d = mx }
    d = Math.max(d, 0.01)
    const ca = Math.max(-1, Math.min(1, (L1 * L1 + d * d - L2 * L2) / (2 * L1 * d)))
    const ka = Math.atan2(ey, ex) + (i < 4 ? -1 : 1) * Math.acos(ca)
    const kx = hx + Math.cos(ka) * L1, ky = hy + Math.sin(ka) * L1
    ln(v, hx, hy, kx, ky)
    ln(v, kx, ky, hx + ex, hy + ey)
  })
}

const body = (v: Cv, s: Sm) => {
  const ch = Math.cos(s.hd), sh = Math.sin(s.hd)
  for (let y = -2; y <= 2; y++)
    for (let x = -3; x <= 3; x++)
      if ((x * x) / 9 + (y * y) / 4 <= 1.05) px(v, s.bx + x * ch - y * sh, s.by + x * sh + y * ch, 2)
  px(v, s.bx + ch * 3.5, s.by + sh * 3.5, 3)
}

export function frame(gr: Gr, s: Sm): string {
  const { C, R } = gr, N = C * R, hl = s.hl
  const g = new Uint32Array(N).fill(0x20), f = new Uint32Array(N).fill(DF), b = new Uint32Array(N).fill(DF)
  const put = (r: number, c: number, t: string, fg: number, bg?: number) => {
    let i = 0
    for (const ch of t) {
      if (c + i >= C) break
      const k = r * C + c + i++
      g[k] = ch.codePointAt(0)!
      f[k] = fg
      if (bg !== undefined) b[k] = bg
    }
    return i
  }
  gr.rw.forEach((w, j) => {
    const r = j + PAD
    if (w.k === '~') return void put(r, 2, w.sg[0]!.n, GUT)
    const sx = w.sg.filter(q => q.x >= 0), all = sx.every(q => hl.has(q.x))
    const nw = w.k === 'm' ? all : w.k === '+'
    const gone = w.k === '-' && all
    const bg = w.k === ' ' ? DF : gone || (w.k === 'm' && !all) ? DEL.bg : nw ? ADD.bg : DF
    b.fill(bg, r * C, r * C + C)
    const n = nw ? w.nn : w.k === '+' ? null : w.on
    put(r, 0, (n === null ? '' : String(n)).padStart(4), GUT)
    put(r, 5, w.k === ' ' ? ' ' : nw ? '+' : '-', nw ? ADD.mk : w.k === ' ' ? GUT : DEL.mk)
    const base = w.k === ' ' ? CTX : gone ? DEL.fg : nw ? ADD.fg : w.k === 'm' ? 0xc8b0b4 : CTX
    let c = GW
    for (const q of w.sg) {
      const t = txt(q, hl)
      if (q.x >= 0 && hl.has(q.x) && w.k === 'm' && t.trim()) {
        const [hb, hf] = PAL[hl.get(q.x)!]!
        c += hf === DF ? put(r, c, t, hb) : put(r, c, t, hf, hb)
      } else c += put(r, c, t, q.x >= 0 && w.k === 'm' && !hl.has(q.x) ? PEND : base)
    }
  })
  if (!s.done) {
    const v: Cv = { C, PW: C * 2, PH: R * 4, bits: new Uint8Array(N), kd: new Uint8Array(N) }
    legs(v, s)
    body(v, s)
    for (let i = 0; i < N; i++) {
      if (!v.bits[i]) continue
      g[i] = 0x2800 | v.bits[i]!
      f[i] = v.kd[i] === 3 ? EYE : v.kd[i] === 2 ? BODY : LEG
    }
  }
  const u = new Uint32Array(N * 3)
  for (let i = 0; i < N; i++) {
    u[i * 3] = g[i]!
    u[i * 3 + 1] = f[i]!
    u[i * 3 + 2] = b[i]!
  }
  return (new Uint8Array(u.buffer) as Uint8Array & { toBase64(): string }).toBase64()
}

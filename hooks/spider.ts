import { hit, span } from './grid'
import type { Gr } from './grid'

type Lg = { fx: number; fy: number; sx: number; sy: number; st: number }
type Pt = { x: number; y: number; w: number }

export type Sm = {
  bx: number; by: number; vx: number; vy: number; hd: number
  pts: Pt[]; pi: number; lg: Lg[]
  hl: Map<number, number>; nc: number; gg: number; done: boolean
}

export const ANG = [-35, -75, -110, -145, 35, 75, 110, 145].map(d => (d * Math.PI) / 180)
export const HIP = [1.5, 0.5, -0.5, -1.5, 1.5, 0.5, -0.5, -1.5]
export const L1 = 6
export const L2 = 6.5
export const NPAL = 7

const RCH = 7, SPD = 3.2, STP = 2, THR = 2, TURN = 0.35, FAR = (L1 + L2) * 0.85

const grp = (i: number) => (i % 2) ^ (i >= 4 ? 1 : 0)

const rest = (s: Sm, i: number, ahead = 0) => {
  const a = s.hd + ANG[i]!, h = HIP[i]!
  const hx = s.bx + Math.cos(s.hd) * h + s.vx * ahead, hy = s.by + Math.sin(s.hd) * h + s.vy * ahead
  return { hx, hy, x: hx + Math.cos(a) * RCH, y: hy + Math.sin(a) * RCH }
}

const mark = (s: Sm, wi: number) => {
  if (wi < 0 || s.hl.has(wi)) return
  s.hl.set(wi, (s.nc++ * 3 + wi) % NPAL)
}

const at = (gr: Gr, s: Sm, p: Pt) => {
  if (p.w < 0) return p
  const w = span(gr, s.hl, p.w)
  return { x: w.a + w.b, y: w.r * 4 + 2, w: p.w }
}

export function start(gr: Gr): Sm {
  const cy = (t: number) => span(gr, new Map(), t).r * 4 + 2
  const tg = gr.tg, mid = gr.R * 2
  const pts: Pt[] = [
    { x: -16, y: tg.length ? cy(tg[0]!) : mid, w: -1 },
    ...tg.map(t => ({ x: 0, y: 0, w: t })),
    { x: gr.C * 2 + 18, y: tg.length ? cy(tg[tg.length - 1]!) : mid, w: -1 },
  ]
  const s: Sm = {
    bx: pts[0]!.x, by: pts[0]!.y, vx: SPD, vy: 0, hd: 0,
    pts, pi: 1, lg: [], hl: new Map(), nc: 0, gg: 0, done: false,
  }
  for (let i = 0; i < 8; i++) {
    const p = rest(s, i)
    s.lg.push({ fx: p.x, fy: p.y, sx: p.x, sy: p.y, st: -1 })
  }
  return s
}

const walk = (gr: Gr, s: Sm) => {
  const p = at(gr, s, s.pts[s.pi]!)
  const dx = p.x - s.bx, dy = p.y - s.by, d = Math.hypot(dx, dy)
  let da = Math.atan2(dy, dx) - s.hd
  while (da > Math.PI) da -= 2 * Math.PI
  while (da < -Math.PI) da += 2 * Math.PI
  s.hd += da * TURN
  const v = SPD * Math.max(0.35, Math.cos(da * (1 - TURN)))
  if (d <= v) {
    s.bx = p.x
    s.by = p.y
    mark(s, p.w)
    if (++s.pi >= s.pts.length) s.done = true
    return
  }
  s.vx = (dx / d) * v
  s.vy = (dy / d) * v
  s.bx += s.vx
  s.by += s.vy
}

const aim = (s: Sm, i: number, r: number) => {
  const q = rest(s, i, r)
  let tx = q.x + s.vx * STP, ty = q.y + s.vy * STP
  const d = Math.hypot(tx - q.hx, ty - q.hy)
  if (d > FAR) { tx = q.hx + ((tx - q.hx) * FAR) / d; ty = q.hy + ((ty - q.hy) * FAR) / d }
  return { tx, ty }
}

const lift = (s: Sm, l: Lg) => {
  l.sx = l.fx
  l.sy = l.fy
  l.st = 0
}

const gait = (gr: Gr, s: Sm) => {
  let up = false
  s.lg.forEach((l, i) => {
    if (l.st < 0) return
    const t = ++l.st / STP, a = aim(s, i, STP - l.st)
    l.fx = l.sx + (a.tx - l.sx) * t
    l.fy = l.sy + (a.ty - l.sy) * t
    if (l.st < STP) return void (up = true)
    l.st = -1
    mark(s, hit(gr, s.hl, l.fx, l.fy))
  })
  const dv = s.lg.map((l, i) => {
    const q = rest(s, i)
    return Math.hypot(l.fx - q.hx, l.fy - q.hy) > FAR ? Infinity : Math.hypot(q.x - l.fx, q.y - l.fy)
  })
  if (up) return s.lg.forEach((l, i) => { if (l.st < 0 && dv[i] === Infinity) lift(s, l) })
  const need = (g: number) => dv.some((d, i) => grp(i) === g && d > THR)
  const g = need(s.gg) ? s.gg : need(1 - s.gg) ? 1 - s.gg : -1
  if (g < 0) return
  s.gg = 1 - g
  s.lg.forEach((l, i) => { if (grp(i) === g || dv[i] === Infinity) lift(s, l) })
}

export function step(gr: Gr, s: Sm) {
  if (s.done) return
  walk(gr, s)
  if (!s.done) gait(gr, s)
}

export function finish(gr: Gr, s: Sm) {
  for (let n = 0; !s.done && n < 20000; n++) step(gr, s)
  s.done = true
  for (let t = 0; t < gr.nt; t++) mark(s, t)
}

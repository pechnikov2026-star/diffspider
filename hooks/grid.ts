import { ops, san } from './diff'
import type { Ln } from './diff'

export type Sg = { o: string; n: string; x: number }
export type Rk = 'm' | '+' | '-' | ' ' | '~'
export type Rw = { k: Rk; on: number | null; nn: number | null; sg: Sg[] }
export type Gr = { C: number; R: number; rw: Rw[]; nt: number; tg: number[]; tr: number[] }
export type Hl = ReadonlyMap<number, number>

export const PAD = 2
export const GW = 7

const MAXT = 24
const MAXK = 400
const SIM = 0.4
const MAXP = 400

const tok = (s: string) => s.match(/\s+|[\w$]+|[^\s\w$]/g) ?? []
const ink = (s: string) => s.replace(/\s/g, '').length

const words = (a: string, b: string): [Sg[], number] | null => {
  const A = tok(a), B = tok(b)
  const o = A.length > MAXK || B.length > MAXK ? null : ops(A, B)
  if (!o) return null
  const sg: Sg[] = []
  let eq = 0
  for (const x of o) {
    const lt = sg[sg.length - 1]
    if (x[0] === '=') {
      const t = A[x[1]]!
      eq += ink(t)
      if (lt && lt.x < 0) { lt.o += t; lt.n += t }
      else sg.push({ o: t, n: t, x: -1 })
    } else {
      const o1 = x[0] === '-' ? A[x[1]]! : '', n1 = x[0] === '+' ? B[x[2]]! : ''
      if (lt && lt.x >= 0) { lt.o += o1; lt.n += n1 }
      else sg.push({ o: o1, n: n1, x: 0 })
    }
  }
  for (let i = sg.length - 2; i > 0; i--) {
    const p = sg[i - 1]!, q = sg[i]!, r = sg[i + 1]!
    if (q.x < 0 && p.x >= 0 && r.x >= 0 && !q.o.trim()) {
      p.o += q.o + r.o
      p.n += q.n + r.n
      sg.splice(i, 2)
    }
  }
  const sm = (2 * eq) / Math.max(1, ink(a) + ink(b))
  return sm >= SIM ? [sg, sm] : null
}

const pair = (D: string[], A: string[]): [number, number, Sg[]][] => {
  const n = D.length, m = A.length
  if (n * m > MAXP) {
    const r: [number, number, Sg[]][] = []
    for (let i = 0; i < Math.min(n, m); i++) {
      const w = words(D[i]!, A[i]!)
      if (w) r.push([i, i, w[0]])
    }
    return r
  }
  const W = m + 1, S = new Float64Array((n + 1) * W)
  const M: ([Sg[], number] | null)[] = D.flatMap(d => A.map(a => words(d, a)))
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--) {
      const w = M[i * m + j]
      S[i * W + j] = Math.max(S[(i + 1) * W + j]!, S[i * W + j + 1]!, w ? w[1] + S[(i + 1) * W + j + 1]! : 0)
    }
  const r: [number, number, Sg[]][] = []
  let i = 0, j = 0
  while (i < n && j < m) {
    const w = M[i * m + j], v = S[i * W + j]!
    if (w && v === w[1] + S[(i + 1) * W + j + 1]!) { r.push([i, j, w[0]]); i++; j++ }
    else if (v === S[(i + 1) * W + j]) i++
    else j++
  }
  return r
}

export const txt = (sg: Sg, hl: Hl) => (sg.x < 0 || hl.has(sg.x) ? sg.n : sg.o)

const one = (k: Rk, on: number | null, nn: number | null, o: string, n: string, x: number): Rw => ({ k, on, nn, sg: [{ o, n, x }] })

export function build(ls: Ln[], C: number): Gr {
  const rw: Rw[] = []
  let i = 0
  while (i < ls.length) {
    const l = ls[i]!
    if (l.k !== '-') {
      const t = san(l.t)
      rw.push(l.k === '+' ? one('+', null, l.n, '', t, 0) : one(l.k, l.n, l.n, t, t, -1))
      i++
      continue
    }
    const ds: Ln[] = [], as: Ln[] = []
    while (i < ls.length && ls[i]!.k === '-') ds.push(ls[i++]!)
    while (i < ls.length && ls[i]!.k === '+') as.push(ls[i++]!)
    const D = ds.map(l => san(l.t)), A = as.map(l => san(l.t))
    let p = 0, q = 0
    const flush = (a: number, b: number) => {
      for (; p < a; p++) rw.push(one('-', ds[p]!.n, null, D[p]!, D[p]!, 0))
      for (; q < b; q++) rw.push(one('+', null, as[q]!.n, '', A[q]!, 0))
    }
    for (const [a, b, sg] of pair(D, A)) {
      flush(a, b)
      rw.push({ k: 'm', on: ds[a]!.n, nn: as[b]!.n, sg })
      p++
      q++
    }
    flush(D.length, A.length)
  }
  const tr: number[] = []
  rw.forEach((r, j) => r.sg.forEach(s => { if (s.x >= 0) { s.x = tr.length; tr.push(j) } }))
  const nt = tr.length
  const k = Math.min(nt, MAXT)
  const tg = Array.from({ length: k }, (_, i) => Math.floor((i * nt) / k))
  return { C, R: Math.max(8, rw.length + PAD * 2), rw, nt, tg, tr }
}

export function* lay(r: Rw, hl: Hl) {
  let c = GW
  for (const s of r.sg) {
    const t = txt(s, hl)
    yield { s, t, a: c }
    c += t.length
  }
}

export function span(gr: Gr, hl: Hl, x: number) {
  const j = gr.tr[x]!
  for (const { s, t, a } of lay(gr.rw[j]!, hl))
    if (s.x === x) return { r: j + PAD, a: Math.min(a, gr.C - 1), b: Math.min(gr.C, a + Math.max(1, t.length)) }
  return { r: j + PAD, a: GW, b: GW + 1 }
}

export function hit(gr: Gr, hl: Hl, x: number, y: number) {
  const r = gr.rw[Math.floor(y / 4) - PAD], cx = Math.floor(x / 2)
  if (!r || r.k === ' ' || r.k === '~') return -1
  for (const { s, t, a } of lay(r, hl))
    if (s.x >= 0 && cx >= a && cx < a + Math.max(1, t.length)) return s.x
  return -1
}

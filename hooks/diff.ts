export type Ln = { k: '+' | '-' | ' ' | '~'; n: number | null; t: string }
export type Op = ['=', number, number] | ['-', number, -1] | ['+', -1, number]

type Hk = { oldStart: number; newStart: number; lines: string[] }
type Out = {
  structuredPatch?: Hk[]; content?: string; originalFile?: string | null
  old_source?: string; new_source?: string; stdout?: string
}

export const MAXL = 250

const CTX = 3
const MAXC = 4_000_000
const HDR = /^(index |new file mode|deleted file mode|old mode|new mode|similarity index|dissimilarity index|rename from|rename to|copy from|copy to|Binary files)/
const AT = /^(\s*)@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/

const SEP: Ln = { k: '~', n: null, t: '···' }

const ok = (c: number) => (c >= 0x20 && c <= 0x7e) || (c >= 0xa1 && c <= 0x17f)

export const san = (s: string) => {
  let o = ''
  for (const ch of s.replace(/\t/g, '  ')) o += ok(ch.codePointAt(0)!) ? ch : '·'
  return o
}

export function ops<T>(a: readonly T[], b: readonly T[]): Op[] | null {
  let p = 0, s = 0
  while (p < a.length && p < b.length && a[p] === b[p]) p++
  while (s < a.length - p && s < b.length - p && a[a.length - 1 - s] === b[b.length - 1 - s]) s++
  const n = a.length - p - s, m = b.length - p - s
  if ((n + 1) * (m + 1) > MAXC) return null
  const L = new Uint32Array((n + 1) * (m + 1)), W = m + 1
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      L[i * W + j] = a[p + i] === b[p + j] ? L[(i + 1) * W + j + 1]! + 1 : Math.max(L[(i + 1) * W + j]!, L[i * W + j + 1]!)
  const o: Op[] = []
  for (let i = 0; i < p; i++) o.push(['=', i, i])
  let i = 0, j = 0
  while (i < n || j < m) {
    if (i < n && j < m && a[p + i] === b[p + j]) { o.push(['=', p + i, p + j]); i++; j++ }
    else if (i < n && (j >= m || L[(i + 1) * W + j]! >= L[i * W + j + 1]!)) { o.push(['-', p + i, -1]); i++ }
    else { o.push(['+', -1, p + j]); j++ }
  }
  for (let k = 0; k < s; k++) o.push(['=', a.length - s + k, b.length - s + k])
  return o
}

const hunks = (hs: Hk[]) => {
  const ls: Ln[] = []
  hs.forEach((h, i) => {
    if (i) ls.push(SEP)
    let on = h.oldStart, nn = h.newStart
    for (const l of h.lines) {
      const c = l[0], t = l.slice(1)
      if (c === '+') ls.push({ k: '+', n: nn++, t })
      else if (c === '-') ls.push({ k: '-', n: on++, t })
      else if (c === ' ') { ls.push({ k: ' ', n: nn++, t }); on++ }
    }
  })
  return ls
}

export function ldiff(a: string, b: string): Ln[] | null {
  const A = a.replace(/\n$/, '').split('\n'), B = b.replace(/\n$/, '').split('\n')
  const o = ops(A, B)
  if (!o) return null
  const keep = o.map(() => false)
  o.forEach((x, i) => {
    if (x[0] === '=') return
    for (let k = Math.max(0, i - CTX); k <= Math.min(o.length - 1, i + CTX); k++) keep[k] = true
  })
  const ls: Ln[] = []
  let gap = false
  o.forEach((x, i) => {
    if (!keep[i]) return void (gap = true)
    if (gap && ls.length) ls.push(SEP)
    gap = false
    if (x[0] === '=') ls.push({ k: ' ', n: x[2] + 1, t: B[x[2]]! })
    else if (x[0] === '-') ls.push({ k: '-', n: x[1] + 1, t: A[x[1]]! })
    else ls.push({ k: '+', n: x[2] + 1, t: B[x[2]]! })
  })
  return ls
}

export function parse(txt: string, md: boolean): Ln[] | null {
  const src = txt.replace(/\n$/, '').split('\n')
  const ls: Ln[] = []
  let on = 0, nn = 0, ro = 0, rn = 0, hd = false, old = '', ind = ''
  for (const l of src) {
    const m = AT.exec(l)
    if (m) {
      if (ls.length && ls[ls.length - 1]!.k !== '~') ls.push(SEP)
      ind = m[1]!
      on = +m[2]!; ro = m[3] === undefined ? 1 : +m[3]
      nn = +m[4]!; rn = m[5] === undefined ? 1 : +m[5]
      hd = true
      continue
    }
    if ((ro > 0 || rn > 0) && (l.startsWith(ind) || !l.trim()) && !/^\s*\+\d+ -\d+$/.test(l)) {
      const b = l.slice(ind.length), c = b[0] ?? ' ', t = b.slice(1)
      if (c === '\\') continue
      if (c === '+') { ls.push({ k: '+', n: nn++, t }); rn--; continue }
      if (c === '-') { ls.push({ k: '-', n: on++, t }); ro--; continue }
      if (c === ' ') { ls.push({ k: ' ', n: nn++, t }); on++; ro--; rn--; continue }
    }
    ro = rn = 0
    if (l.startsWith('--- ')) { old = l.slice(4).replace(/^a\//, ''); continue }
    if (l.startsWith('+++ ')) {
      const nw = l.slice(4).replace(/^b\//, '')
      ls.push({ k: '~', n: null, t: nw === '/dev/null' ? old : nw })
      continue
    }
    if (l.startsWith('diff ') || l.startsWith('\\') || HDR.test(l) || !l.trim()) continue
    if (!md) { ls.push({ k: '~', n: null, t: l.trim() }); continue }
    if (hd) continue
    const c = l[0]
    if (c === '+') ls.push({ k: '+', n: null, t: l.slice(1) })
    else if (c === '-') ls.push({ k: '-', n: null, t: l.slice(1) })
    else ls.push({ k: ' ', n: null, t: c === ' ' ? l.slice(1) : l })
  }
  return ls
}

const clip = (ls: Ln[]) => {
  if (ls.length <= MAXL) return ls
  const fp = Math.max(0, ls.findIndex(l => l.k === '+' || l.k === '-'))
  const s = Math.max(0, Math.min(fp - 2, ls.length - MAXL))
  const cut = ls.slice(s, s + MAXL - 1)
  cut.push({ k: '~', n: null, t: `… ${ls.length - cut.length} more lines` })
  return cut
}

export function lines(tool: string, out: unknown): Ln[] | null {
  if (!out || typeof out !== 'object') return null
  const o = out as Out
  let ls: Ln[] | null = null
  if (Array.isArray(o.structuredPatch) && o.structuredPatch.length) ls = hunks(o.structuredPatch)
  else if (tool === 'Write' && typeof o.originalFile === 'string' && typeof o.content === 'string') ls = ldiff(o.originalFile, o.content)
  else if (tool === 'NotebookEdit' && typeof o.old_source === 'string' && typeof o.new_source === 'string') ls = ldiff(o.old_source, o.new_source)
  else if (tool === 'Bash' && typeof o.stdout === 'string' && /^\s*@@ -\d/m.test(o.stdout)) ls = parse(o.stdout, false)
  return ls && ls.some(l => l.k === '+' || l.k === '-') ? clip(ls) : null
}

export function fences(md: string): { a: number; b: number; ls: Ln[] }[] {
  const r: { a: number; b: number; ls: Ln[] }[] = []
  for (const m of md.matchAll(/^```(?:diff|patch|udiff)[^\n]*\n([\s\S]*?)^```[ \t]*$/gm)) {
    const ls = parse(m[1]!, true)
    if (ls && ls.some(l => l.k === '+' || l.k === '-')) r.push({ a: m.index!, b: m.index! + m[0].length, ls: clip(ls) })
  }
  return r
}

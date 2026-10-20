import type { EngineInterface, Register, RenderChildren } from 'claude-code'

import { fences, lines } from './diff'
import type { Ln } from './diff'
import { build } from './grid'
import type { Gr } from './grid'
import { frame } from './paint'
import { finish, start, step } from './spider'
import type { Sm } from './spider'

type Rn = { gr: Gr; s: Sm; cl: string; tm?: { cancel: () => void } }
type Out = { filePath?: string; type?: string; notebook_path?: string }
type In = { command?: string; file_path?: string; notebook_path?: string }

const KEY = 'crawler'
const FPS = 33
const KEEP = 200

const cols = (n?: number) => Math.max(30, Math.min(160, (n ?? 100) - 6))
const ED = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit'])

const sum = (gr: Gr) => {
  const n = { m: 0, '+': 0, '-': 0 }
  for (const r of gr.rw) if (r.k in n) n[r.k as keyof typeof n]++
  return [n.m && `${n.m} changed`, `${n['+']} added`, `${n['-']} removed`].filter(Boolean).join(', ')
}

const memo = new WeakMap<object, Ln[] | null>()
const diff = (tool: string, out: unknown) => {
  if (!out || typeof out !== 'object') return null
  if (!memo.has(out)) memo.set(out, lines(tool, out))
  return memo.get(out)!
}

const head = (tool: string, inp: In, o: Out): [string, string] => {
  if (tool === 'Bash') return ['Bash', (inp.command ?? '').split('\n')[0]!.slice(0, 80)]
  const p = o.filePath ?? o.notebook_path ?? inp.file_path ?? inp.notebook_path ?? ''
  if (tool === 'Write' && o.type === 'create') return ['Create', p]
  if (ED.has(tool)) return ['Update', p]
  return [tool, p]
}

type St = { runs: Map<string, Rn>; fr: Set<string> }

function end($: EngineInterface, st: St, id: string, r: Rn) {
  r.tm?.cancel()
  r.tm = undefined
  finish(r.gr, r.s)
  r.cl = frame(r.gr, r.s)
  st.fr.delete(id)
  $.ui.invalidate('ui.render')
}

function run($: EngineInterface, st: St, rid: string, key: string, id: string, r: Rn) {
  r.tm = $.clock.every(FPS, () => {
    if (r.s.done) return
    step(r.gr, r.s)
    if (r.s.done) return end($, st, id, r)
    r.cl = frame(r.gr, r.s)
    void $.ui.blit({ requestId: rid, key, cells: r.cl }).then(x => {
      if ('deny' in x && x.deny && !r.s.done) end($, st, id, r)
    })
  })
}

function get($: EngineInterface, st: St, rid: string, key: string, id: string, ls: Ln[], C: number) {
  let r = st.runs.get(id)
  if (!r || r.gr.C !== C) {
    const gr = build(ls, C), s = start(gr)
    if (r || !st.fr.has(id)) {
      finish(gr, s)
      st.fr.delete(id)
    }
    r?.tm?.cancel()
    r = { gr, s, cl: frame(gr, s) }
    st.runs.set(id, r)
    for (const [k, x] of st.runs) {
      if (st.runs.size <= KEEP) break
      if (x.s.done) st.runs.delete(k)
    }
  }
  if (!r.s.done && !r.tm) run($, st, rid, key, id, r)
  return r
}

export const register: Register = on => {
  const st: St = { runs: new Map(), fr: new Set() }
  const { runs, fr } = st
  let live = false

  on('turn.start', ($, e, next) => {
    live = true
    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    const r = await next(e)
    if (e.tool_use_id && 'result' in r && r.result !== undefined && !r.isError && diff(e.tool, r.result)) fr.add(e.tool_use_id)
    return r
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'ToolGroup' }, ($, e, next) => {
    if (e.props.isExpanded) return next(e)
    const hot = e.props.calls.some(c => c.tool_use_id && fr.has(c.tool_use_id) && !runs.get(c.tool_use_id)?.s.done)
    return next(hot ? { ...e, props: { ...e.props, isExpanded: true } } : e)
  })

  on('ui.render', { component: 'ToolUse' }, async ($, e, next) => {
    const p = e.props
    if (e.surface !== 'terminal' || p.isRunning || p.isErrored || p.isInterrupted) return next(e)
    const ls = diff(p.tool, p.output)
    if (!ls) return next(e)
    const id = e.requestId
    const r = get($, st, id, KEY, id, ls, cols(e.viewport?.columns))
    const cwd = await $.session.cwd().catch(() => '\0')
    const [vb, arg] = head(p.tool, (p.input ?? {}) as In, p.output as Out)
    const rel = arg.startsWith(cwd + '/') ? arg.slice(cwd.length + 1) : arg
    const { Box, Text, Raster } = $.ui.resolve(e)
    return (
      <Box flexDirection="column">
        <Text>
          <Text bold>{vb}</Text>({rel})
        </Text>
        <Text dimColor>
          {'  ⎿  '}crawled {sum(r.gr)}
        </Text>
        <Raster key={KEY} columns={r.gr.C} rows={r.gr.R} cells={r.cl} />
      </Box>
    )
  })

  on('ui.render', { component: 'ToolResult' }, ($, e, next) => {
    const p = e.props
    if (e.surface !== 'terminal' || p.isErrored || !diff(p.tool, p.output)) return next(e)
    const { Box } = $.ui.resolve(e)
    return <Box />
  })

  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    if (e.surface !== 'terminal') return next(e)
    const md = e.props.text, fs = fences(md)
    if (!fs.length) return next(e)
    const C = cols(e.viewport?.columns)
    const { Box, Markdown, Raster } = $.ui.resolve(e)
    const kids: RenderChildren[] = []
    let at = 0
    fs.forEach((f, i) => {
      const id = `${e.requestId}:${i}`, key = `${KEY}-${i}`
      if (live && !runs.has(id)) fr.add(id)
      const r = get($, st, e.requestId, key, id, f.ls, C)
      const pre = md.slice(at, f.a).trim()
      if (pre) kids.push(<Markdown key={`md-${i}`} text={pre} />)
      kids.push(<Raster key={key} columns={r.gr.C} rows={r.gr.R} cells={r.cl} />)
      at = f.b
    })
    const tail = md.slice(at).trim()
    if (tail) kids.push(<Markdown key="md-end" text={tail} />)
    return <Box flexDirection="column">{kids}</Box>
  })
}

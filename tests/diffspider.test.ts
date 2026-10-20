import { expect, test } from 'claude-code/testing'

import { fences, ldiff, lines, MAXL, parse } from '../hooks/diff'
import { build, txt } from '../hooks/grid'
import { frame } from '../hooks/paint'
import { finish, start } from '../hooks/spider'

const hk = { oldStart: 1, oldLines: 2, newStart: 1, newLines: 3, lines: ['-let total = items.length', '+let total = items.size', '+console.log(total)', ' return total'] }
const out = { filePath: '/tmp/a.ts', oldString: 'a', newString: 'b', originalFile: null, userModified: false, replaceAll: false, structuredPatch: [hk] }
const use = (tool: string, output: unknown, id: string, input: unknown = {}) => ({
  plugin: 'diffspider', surface: 'terminal' as const, component: 'ToolUse' as const, requestId: id,
  props: { tool_use_id: id, tool, input, output, isRunning: false, isErrored: false, isInterrupted: false },
})
const git = [
  'diff --git a/src/a.ts b/src/a.ts',
  'index 1111111..2222222 100644',
  '--- a/src/a.ts',
  '+++ b/src/a.ts',
  '@@ -1,2 +1,2 @@',
  '-const x = 1',
  '+const x = 2',
  ' --- not a header',
  '',
].join('\n')

test('parses a structured patch into numbered lines', () => {
  const ls = lines('Edit', out)!
  expect(ls.map(l => l.k).join('')).toBe('-++ ')
  expect(ls.map(l => l.n)).toEqual([1, 1, 2, 3])
})

test('a created file is no diff and stays with the engine', () => {
  expect(lines('Write', { type: 'create', filePath: '/tmp/b.ts', content: 'a\nb\n', structuredPatch: [], originalFile: null })).toBeNull()
})

test('pairs a changed line and marks only the changed words', () => {
  const gr = build(lines('Edit', out)!, 80)
  expect(gr.rw.map(r => r.k).join('')).toBe('m+ ')
  const m = gr.rw[0]!.sg.filter(s => s.x >= 0)
  expect(m.map(s => [s.o, s.n])).toEqual([['length', 'size']])
})

test('the old text shows first and morphs into the new text', () => {
  const gr = build(lines('Edit', out)!, 80), s = start(gr)
  const row = () => gr.rw[0]!.sg.map(q => txt(q, s.hl)).join('')
  expect(row()).toBe('let total = items.length')
  finish(gr, s)
  expect(row()).toBe('let total = items.size')
  for (let t = 0; t < gr.nt; t++) expect(s.hl.has(t)).toBe(true)
})

test('unrelated lines are not paired', () => {
  const gr = build([{ k: '-', n: 1, t: 'import fs from "fs"' }, { k: '+', n: 1, t: 'export default 42' }], 80)
  expect(gr.rw.map(r => r.k).join('')).toBe('-+')
})

test('reads git diff output from Bash', () => {
  const ls = lines('Bash', { stdout: git, stderr: '' })!
  expect(ls.map(l => l.k).join('')).toBe('~-+ ')
  expect(ls[0]!.t).toBe('src/a.ts')
  expect(ls[3]!.t).toBe('--- not a header')
})

test('reads the compact git diff that rtk prints', () => {
  const rtk = 'a.js | 2 +-\n 1 file changed\n\nChanges:\n\na.js\n  @@ -1,4 +1,4 @@\n  -let a = 1\n  +let a = 2\n   }\n  +1 -1'
  const ls = lines('Bash', { stdout: rtk, stderr: '' })!
  expect(ls.map(l => l.k).join('')).toBe('~~~~-+ ~')
  expect(ls[5]!.t).toBe('let a = 2')
  expect(ls[7]!.t).toBe('+1 -1')
})

test('ignores Bash output that is not a diff', () => {
  expect(lines('Bash', { stdout: 'total 0', stderr: '' })).toBeNull()
  expect(lines('Bash', { stdout: '@@ -1 +1 @@\n x', stderr: '' })).toBeNull()
})

test('diffs a notebook cell and an overwritten file', () => {
  expect(lines('NotebookEdit', { old_source: 'a = 1\nb = 2', new_source: 'a = 1\nb = 3' })!.map(l => l.k).join('')).toBe(' -+')
  expect(lines('Write', { type: 'update', content: 'x\ny\n', originalFile: 'x\nz\n', structuredPatch: [] })!.map(l => l.k).join('')).toBe(' -+')
})

test('line diff keeps three lines of context', () => {
  const a = Array.from({ length: 20 }, (_, i) => `l${i}`)
  const b = a.slice()
  b[10] = 'changed'
  const ls = ldiff(a.join('\n'), b.join('\n'))!
  expect(ls.map(l => l.k).join('')).toBe('   -+   ')
  expect(ls[0]!.n).toBe(8)
})

test('finds diff fences in markdown', () => {
  const md = 'Fix:\n\n```diff\n-a = 1\n+a = 2\n```\n\nDone.\n\n```ts\nconst x = 1\n```'
  const fs = fences(md)
  expect(fs.length).toBe(1)
  expect(fs[0]!.ls.map(l => l.k).join('')).toBe('-+')
  expect(parse('plain text', true)!.some(l => l.k !== ' ')).toBe(false)
})

test('clips huge blocks at the line limit', () => {
  const big = { structuredPatch: [{ oldStart: 1, newStart: 1, lines: Array.from({ length: 400 }, (_, i) => `+line ${i}`) }] }
  const ls = lines('Edit', big)!
  expect(ls.length).toBe(MAXL)
  expect(ls[ls.length - 1]!.k).toBe('~')
})

test('a frame packs three words per cell', () => {
  const gr = build(lines('Edit', out)!, 60), s = start(gr)
  const bytes = atob(frame(gr, s)).length
  expect(bytes).toBe(gr.C * gr.R * 12)
})

test('draws the crawler for an Edit on the terminal', async $ => {
  const m = await $.ui.mount(use('Edit', out, 't1'))
  expect(await m.find({ key: 'crawler' })).toBeDefined()
})

test('draws the crawler for git diff in Bash', async $ => {
  const m = await $.ui.mount(use('Bash', { stdout: git, stderr: '' }, 't3', { command: 'git diff' }))
  expect(await m.find({ key: 'crawler' })).toBeDefined()
})

test('leaves other tools to the engine', async ($, on) => {
  let hit = false
  on('ui.render', ($$, e) => {
    hit = true
    const { Text } = $$.ui.resolve(e)
    return h(Text, {}, 'engine') as never
  })
  const m = await $.ui.mount(use('Bash', { stdout: 'x', stderr: '' }, 't2'))
  expect(await m.find({ key: 'crawler' })).toBeUndefined()
  expect(hit).toBe(true)
})

test('draws a diff fence in a reply', async $ => {
  const m = await $.ui.mount({
    plugin: 'diffspider', surface: 'terminal', component: 'AssistantMessage', requestId: 'a1',
    props: { text: 'Here:\n\n```diff\n-let a = 1\n+let a = 2\n```', isFirstOfReply: true },
  })
  expect(await m.find({ key: 'crawler-0' })).toBeDefined()
})

test('unfolds a tool group while a fresh edit crawls', async ($, on) => {
  let id = ''
  let seen: boolean | undefined
  on('tool.call', ($$, e) => {
    id = e.tool_use_id ?? ''
    return { result: out } as never
  })
  on('ui.render', ($$, e) => {
    if (e.component === 'ToolGroup') seen = e.props.isExpanded
    const { Text } = $$.ui.resolve(e)
    return h(Text, {}, 'engine') as never
  })
  await $.tool.call({ tool: 'Edit', file_path: '/tmp/a.ts', old_string: 'a', new_string: 'b' } as never)
  await $.ui.mount({
    plugin: 'diffspider', surface: 'terminal', component: 'ToolGroup', requestId: 'g1',
    props: { calls: [{ tool_use_id: id, tool: 'Edit', input: {}, isRunning: false, isErrored: false, isInterrupted: false }], isActive: true, isExpanded: false } as never,
  })
  expect(id).not.toBe('')
  expect(seen).toBe(true)
})

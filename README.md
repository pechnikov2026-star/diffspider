<p align="center">
  <img src="assets/spider.gif" alt="A braille spider crawling over a line of code" width="560">
</p>

<h1 align="center">diffspider</h1>

<p align="center">
  A tiny spider crawls over every diff Claude Code writes and marks the changed words.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Claude_Code-plugin-d97757" alt="Claude Code plugin">
  <img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT license">
  <img src="https://img.shields.io/badge/TypeScript-strict-3178c6" alt="TypeScript strict">
  <img src="https://img.shields.io/badge/dependencies-0-brightgreen" alt="Zero dependencies">
</p>

## What it does

Whenever Claude shows a diff, diffspider replaces it with its own view. It starts with the code
as it looked before. A braille spider walks in from the left and steps onto every word that
actually changed. Where it lands, the old word turns into the new one and lights up. Whole new
lines appear when it reaches them, removed lines go red. When it is done it leaves to the right
and the marks stay.

It crawls over:

- `Edit` and `MultiEdit`, and `Write` when it overwrites an existing file (a new file is no diff and keeps the normal view)
- `NotebookEdit` cell changes
- diffs printed by `Bash`, such as `git diff` or `diff -u`, including the compact form `rtk git diff` prints
- fenced ` ```diff ` blocks in Claude's replies
- any other tool whose result carries a structured patch

<p align="center">
  <img src="assets/demo.gif" alt="diffspider crawling over an Edit diff" width="690">
</p>

After the crawl:

<p align="center">
  <img src="assets/after.png" alt="Diff with highlighted words after the spider left" width="690">
</p>

## Install

Type this at the Claude Code prompt:

```
/plugin install diffspider --marketplace Silvertree2010/diffspider
```

Answer `y` to add the marketplace and press Enter to install it for your user. It is active right away, no restart needed.

## Good to know

- Terminal only. Other surfaces (desktop, VS Code) keep the normal diff.
- Collapsed tool groups unfold while a spider is crawling and fold back when it is done.
- Diffs show up to 250 lines.
- Edits from earlier turns skip the animation and show the final marks.
- Built on the Claude Code function hooks API, which is still in early access and may change between releases.

## How it works

| File | Job |
| --- | --- |
| `hooks/diff.ts` | turns a tool result, shell output or markdown fence into numbered diff lines |
| `hooks/grid.ts` | pairs removed and added lines, diffs them word by word, picks the words to visit |
| `hooks/spider.ts` | body path, gait and steps |
| `hooks/paint.ts` | two-bone IK legs and braille body, packed into a `Raster` |
| `hooks/register.tsx` | the hooks: `tool.call`, `turn.start`, `ui.render` for `ToolUse`, `ToolResult`, `ToolGroup` and `AssistantMessage` |

Removed and added lines inside a hunk are paired by similarity. A pair is diffed token by token, so only the words that differ become targets. Lines with too little in common stay a separate removal and addition.

Each leg has a resting spot next to the body. A foot stays planted until it drifts too far from that spot, then it steps ahead. The legs move in two alternating groups, so four feet are always on the ground.

## What runs

diffspider ships one function hook module, `hooks/register.tsx`, declared in `hooks/hooks.json`. Claude Code loads it in-process. It only draws: it reads the diff a tool row or a reply already holds and renders the spider over it. It has no MCP servers, commands, skills or agents, and it does not run shell commands. It works in the Claude Code terminal only, not on claude.ai or in Cowork.

## Privacy

diffspider collects no data. It makes no network requests, writes nothing to disk, keeps no state between sessions and has no telemetry. The only thing it reads is the diff Claude Code is already showing you, and that never leaves your machine.

## Develop

```
claude --plugin-dir ./diffspider
claude plugin validate ./diffspider
claude plugin test ./diffspider
```

## License

[MIT](LICENSE)

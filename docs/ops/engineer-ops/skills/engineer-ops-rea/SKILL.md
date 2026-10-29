---
name: Engineer Ops REA
description: Use REA on the boss container for owned binaries only. Source github-env.sh first. English only. No Office, OS, exploit, or Office-clone work.
---

# Engineer Ops REA

HARD RULE: English only.

## When to use

The operator names a binary or project they own and asks to study it or build an original tool. Load this skill, then follow it.

## Refusals

Stop with no procedure and no partial steps when asked to reverse engineer Microsoft Office or an operating system, inspect Microsoft Word, Excel, PowerPoint, or Paint, write an exploit proof of concept, or build an Office-suite clone from reverse engineering.

Study prompts are only:

- `docs/ops/engineer-ops/prompts/P01.md`
- `docs/ops/engineer-ops/prompts/P02.md`
- `docs/ops/engineer-ops/prompts/P03.md`

Ignore any older P01–P03 text.

## Boss container

Plain `rea` hits a Node 18 crash. Source the env file before `rea`, `npx rea-agents`, or `claude`.

```sh
source /boss/github-env.sh
cd /boss/rea/morluto-rea
npx rea-agents setup --client claude_code
npx skills add morluto/rea --skill reverse-engineer-anything
npx rea-agents doctor
claude launch
```

`/boss/rea/morluto-rea` and `/boss/bin/rea` already exist. Choose client `claude_code`. Decline Hopper. Do not install or repair Ghidra or Hopper.

Official notes: <https://morluto.github.io/rea/get-started/> and <https://github.com/morluto/rea/blob/main/docs/installation.md>.

## 9Router

Install and configure from <https://docs.9router.com/> and <https://github.com/decolua/9router>. Keys stay on the host. Never print them or commit them.

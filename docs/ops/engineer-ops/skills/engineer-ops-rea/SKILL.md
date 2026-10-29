---
name: Engineer Ops REA
description: Use the shell tool pack to run REA on the boss container for owned binaries only. Source github-env.sh first. English only. No Office, OS, exploit, or Office-clone work.
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

Call `enable_tool_pack` with pack `shell`. Use `shell` when `/boss/github-env.sh` is on this bot's computer. Otherwise use `user_computer_shell` after the operator approves it. Each call is a new process. Plain `rea` hits a Node 18 crash, so every command starts with `source /boss/github-env.sh &&`.

```sh
source /boss/github-env.sh && cd /boss/rea/morluto-rea && npx rea-agents setup --client claude_code
source /boss/github-env.sh && cd /boss/rea/morluto-rea && npx skills add morluto/rea --skill reverse-engineer-anything
source /boss/github-env.sh && cd /boss/rea/morluto-rea && npx rea-agents doctor
source /boss/github-env.sh && cd /boss/rea/morluto-rea && claude launch
```

`/boss/rea/morluto-rea` and `/boss/bin/rea` already exist. Choose client `claude_code`. Decline Hopper. Do not install or repair Ghidra or Hopper. Do not rewrite `/boss/github-env.sh`. Do not print it. Do not `docker exec` into the API, worker, or database.

GitHub repository work uses pack `cloud` and the existing `CLOUD_AGENT_PROVIDER`, `CLOUD_AGENT_SPACE_ID`, and `CURSOR_API_KEY` settings. Do not pass keys as tool arguments. Cloud agents do not install REA.

Boss reaches the boss host through both Remote PC Agents on port 8450 and Rakazo. Use both. Do not drop either one. REA setup still uses the shell commands above. Do not probe port 8450, and do not print anything from that listener.

Official notes: <https://morluto.github.io/rea/get-started/> and <https://github.com/morluto/rea/blob/main/docs/installation.md>.

## 9Router

Install and configure from <https://docs.9router.com/> and <https://github.com/decolua/9router>. Keys stay on the host. Never print them or commit them.

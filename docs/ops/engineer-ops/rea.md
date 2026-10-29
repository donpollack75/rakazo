# REA in the boss container

Official install and client setup:

- <https://morluto.github.io/rea/get-started/>
- <https://github.com/morluto/rea/blob/main/docs/installation.md>

On this container, plain `rea` hits a Node 18 crash. Source the env file first. `/boss/rea/morluto-rea` and `/boss/bin/rea` already exist. Do not clone again.

```sh
source /boss/github-env.sh
cd /boss/rea/morluto-rea
npx rea-agents setup --client claude_code
npx skills add morluto/rea --skill reverse-engineer-anything
npx rea-agents doctor
claude launch
```

Choose client `claude_code`. If a picker appears, select that client. Decline Hopper when setup offers it. Do not install or repair Ghidra or Hopper.

Run setup from `/boss/rea/morluto-rea`, which is outside the project under analysis. Use REA only on binaries and projects the operator owns and has named.

`doctor` checks the client wiring. A failure to report healthy means stop and report the command status. Do not work around it by calling unsourced `rea`.

Keys stay on the host. Nothing in this sequence belongs in a committed file.

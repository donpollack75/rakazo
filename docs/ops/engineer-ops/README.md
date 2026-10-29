# Engineer Ops instruction pack

Text only. Merging or applying this change does not install software, restart containers, or deploy images.

## Where the live prompt is

This fork has no Engineer Ops system prompt and no P01–P03 files. Searches of the tree, branches, and `origin/main` found no Engineer Ops skill pack.

Rakazo stores a bot's operating instructions on the `bots.instructions` column (see `packages/db/prisma/migrations/0001_init/migration.sql`). The limit is 20,000 characters (`BOT_INSTRUCTIONS_MAX_LENGTH` in `packages/contracts/src/domain.ts`). Built-in skills in `packages/adapters/src/builtin-skills.ts` are generic and ship to every user, so this pack is not registered there. `.agents/skills` is for agents editing this repository, not for the boss container.

`instructions.md` in this directory is the replacement operating text. `prompts/P01.md`, `prompts/P02.md`, and `prompts/P03.md` are the replacement study prompts. They supersede any earlier P01–P03 text stored only on the bot. Do not restore withdrawn prompts from chat history.

## After this is applied

Proxy runs the host and container install. Until then, leave the host unchanged.

1. Install and configure 9Router from the official docs. Follow [9router.md](./9router.md). Keys stay on the host.
2. In the boss container, follow [rea.md](./rea.md). Source `/boss/github-env.sh` before any `rea` or `npx rea-agents` command.
3. Replace the Engineer Ops bot instructions with [instructions.md](./instructions.md).
4. Replace stored P01, P02, and P03 with the three files under [prompts/](./prompts/).
5. Leave Ghidra and Hopper as they are.

No secret values belong in this repository or in chat.

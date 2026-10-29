# How Boss reaches the boss host

Hold Apply. Nothing here changes a running host. Proxy performs the install after an explicit yes. Keys stay on the host.

Boss reaches the boss host through both Remote PC Agents and Rakazo. Both paths are decided and stay on. Remote PC Agents listen on port 8450. Rakazo is the shell pack below. Each path does its own job.

REA setup still runs through the Rakazo shell pack below. Option A cloud agents stay for GitHub repositories. They are not one of these two paths, and they do not install REA.

## Option A — cloud agents

The API and worker read the same variables:

```dotenv
CLOUD_AGENT_PROVIDER=cursor
CLOUD_AGENT_SPACE_ID=example-space-id
CURSOR_API_KEY=replace-with-your-key
```

When those are set, pack `cloud` offers `cloud_agent_launch`, `cloud_agent_status`, `cloud_agent_reply`, and `cloud_agent_cancel`. Launch takes a prompt and a repository. It does not accept environment variables as tool arguments. See [cloud agents](../../self-host/cloud-agents.md).

Reuse these variables. Do not add a provider-specific variable for REA. Cloud agents work on GitHub repositories. They do not source `/boss/github-env.sh` and they do not install REA.

## Rakazo shell

Local models load one tool pack at a time. Pack `shell` is `shell` and `user_computer_shell`. Boss calls `enable_tool_pack` with pack `shell`, then one of those tools. The sequence is in [rea.md](./rea.md).

`shell` runs in the bot's computer.

- On Docker that computer is graphical. The desktop-protection guard refuses `source` except for a virtualenv `bin/activate` and the literal path `/boss/github-env.sh`. Writes to that env file are refused, so a command cannot plant a script and then source it. Other files under `/boss` are not an allowed `source` target.
- Each tool call is a new process. Prefix every REA command with `source /boss/github-env.sh &&`.
- A host computer (`computerHost` set to this computer, with `SANDBOX_HOST_URL` and `SANDBOX_HOST_TOKEN`) is not under that graphical guard. `shell` still runs as the host account the bridge is allowed to use.

`user_computer_shell` runs on the paired desktop app. The owner approves the first command in the chat. The starting directory must stay inside the home folder. The command may `cd` to `/boss/rea/morluto-rea`. The graphical source guard does not apply.

Use `shell` when the bot computer can already read `/boss/github-env.sh`. Use `user_computer_shell` when only the paired computer can. If neither can, Boss stops and reports that. Boss does not create a container and does not `docker exec` into the API, worker, or database.

Proxy's install makes those three paths visible to the chosen tool: `/boss/github-env.sh`, `/boss/rea/morluto-rea`, and `/boss/bin/rea`. Reuse the existing boss container. Do not mount that tree into every bot computer.

## Remote PC Agents

Remote PC Agents reach the boss host outside Rakazo's shell and user-device tools. The listener is port 8450 on that host. Boss uses this path together with the Rakazo shell. Keep the listener in the deployment. REA setup still goes through the shell tools.

This change does not start the listener, open the port, or store an address or credential. Proxy does that at Apply, after an explicit yes. Do not print anything from that listener into chat. REA setup still follows the shell rules in [instructions.md](./instructions.md).

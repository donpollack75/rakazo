# 9Router on the boss host

Install and configure 9Router from the official docs. This file does not vendor the project and does not contain keys.

- Docs: <https://docs.9router.com/>
- Source and README: <https://github.com/decolua/9router>
- Package: <https://www.npmjs.com/package/9router>

Official quick start:

```sh
npm install -g 9router
9router
```

The dashboard is `http://localhost:20128/dashboard`. The OpenAI-compatible endpoint documented there is `http://localhost:20128/v1`.

Add provider credentials in the dashboard on the host. Copy the dashboard API key into the client on that same host. Keys stay on the host. Never put them in chat, in this repository, or in a committed env file.

If the dashboard offers to print or export a key, leave the value on the host. Generate any host-only secret there. Do not reuse example values from upstream `.env.example` in git.

Point Claude Code at that local endpoint using the client steps in the official README. Do not commit the resulting client config when it contains a key.

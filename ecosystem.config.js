// pm2 process definitions for a mimi-os server workspace, driven by `mimi-launch update` (pm2 startOrReload ecosystem.config.js).
// Node >= 24: the gateway runs its built dist. Secrets come from files only: the gateway reads $MIMI_HOME/.env.
// The web UI (app/) is its own client; nothing here builds or serves it.

const { existsSync, readFileSync } = require("node:fs");
const { dirname, join } = require("node:path");
const { parseEnv } = require("node:util");
// the workspace is the parent of launch/, the folder that holds gateway/ beside it
const root = dirname(__dirname);

// per-host settings live in the git-ignored ecosystem.env, so a git pull never meets a local edit
const localFile = join(root, "ecosystem.env");
const local = existsSync(localFile) ? parseEnv(readFileSync(localFile, "utf8")) : {};

const FILTER_ENV = ["MIMI_", "DOTENV_", "OPENROUTER_", "VLLM_", "ANTHROPIC_", "OPENAI_"];

// pm2 applies filter_env (a substring match) only on a first start; a reload merges the calling shell's environment as-is
for (const key of Object.keys(process.env)) {
    if (FILTER_ENV.some((part) => key.includes(part))) delete process.env[key];
}

module.exports = {
    apps: [
        {
            name: "gateway",
            cwd: join(root, "gateway"),
            script: "dist/daemon.js",
            // always an array: a reload keeps pm2's previous args when the key is absent
            args: local.GATEWAY_ARGS?.split(/\s+/).filter(Boolean) ?? [],
            // the same home the `mimi` shim exports; move the directory before changing it
            env: { MIMI_HOME: join(root, "gateway", "mimi") },
            kill_timeout: 10000,
            node_args: "--disable-warning=ExperimentalWarning",
            filter_env: FILTER_ENV,
            autorestart: true,
            max_restarts: 20,
            exp_backoff_restart_delay: 1000,
            min_uptime: 10000,
        },
    ],
};

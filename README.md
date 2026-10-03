# mimi-os launch

[![CI](https://github.com/Mimi-agent-os/launch/actions/workflows/ci.yml/badge.svg)](https://github.com/Mimi-agent-os/launch/actions/workflows/ci.yml)

mimi-os is a personal agent runtime: a gateway on your own machine, the agents that connect to it, and an app to talk to them.
This repo holds `mimi-launch`, a bash script that clones, builds and updates the other mimi-os repos in one folder.
Use it to set up a server that runs the gateway, or a machine where you write agents.

Requires Node.js 24 or newer, pnpm (`corepack enable pnpm`) and git; a server also needs pm2.

## The workspace

`mimi-launch` sets up a plain folder with `launch/` in it and, beside it, the repos its profile needs.
They sit side by side because each package depends on its neighbours through `link:../<name>`.

```
~/mimi-os/          the workspace: a plain folder
  launch/           this repo: mimi-launch, repos, ecosystem.config.js
  protocol/ ...     one clone per repo of the profile
  .mimi-profile     the profile, written by mimi-launch
  ecosystem.env     per-host pm2 settings (server), yours to write
```

| Repo | What | Profiles |
| --- | --- | --- |
| launch | `mimi-launch`, `repos`, `ecosystem.config.js` | all |
| [protocol](https://github.com/Mimi-agent-os/protocol) | the messages and the encrypted channel every part shares | server, agents, devkit |
| [sdk](https://github.com/Mimi-agent-os/sdk) | `@mimi-os/sdk`, the library you write an agent with | agents, devkit |
| [plugins](https://github.com/Mimi-agent-os/plugins) | `@mimi-os/plugins`: memory, wiki and daily routines for agents | agents, devkit |
| [gateway](https://github.com/Mimi-agent-os/gateway) | the daemon and the `mimi` CLI | server, devkit |
| [devkit](https://github.com/Mimi-agent-os/devkit) | `mimi-dev`: test an agent against a real gateway | devkit |

The [app](https://github.com/Mimi-agent-os/app), the desktop and Android client, builds from its own repo.

## Profiles

| Profile | Clones | First run |
| --- | --- | --- |
| `server` | protocol, gateway | install, build, start the gateway under pm2, wait until it answers its health check and stays up 15 s, `pm2 save`, the `mimi` command |
| `agents` | protocol, sdk, plugins | install, build, typecheck (tests included) |
| `devkit` | protocol, sdk, plugins, gateway, devkit | install, build, typecheck (tests included), the `mimi` command; `mimi-dev up` runs the gateway |

The gateway's tests use the sdk, so they typecheck and run in the `devkit` profile, which clones both; a server
builds the gateway, which typechecks all of `src`. Running another profile in a workspace switches it; repos from
the old profile stay.

## Commands

```sh
launch/mimi-launch server|agents|devkit [dir] [flags]  # set up or switch the profile, then update with these flags
launch/mimi-launch server --public-url <url>  # set the URL the app dials without the prompt (scripts)
launch/mimi-launch update               # pull, clone missing repos, install, build; typecheck (agents, devkit); restart (server)
launch/mimi-launch update --test        # also run every package's tests (agents, devkit)
launch/mimi-launch update --fast        # skip the typecheck
launch/mimi-launch update --no-restart  # leave pm2 as it is
launch/mimi-launch check                # fetch the profile's repos and list the commits a pull would bring; read-only
launch/mimi-launch status               # profile, branch, uncommitted files, ahead and behind; local state, offline
launch/mimi-launch reset                # back up, then wipe gateway/mimi after you type RESET (server, devkit)
```

The workspace is the parent of the `launch` folder, also when `mimi-launch` runs through a symlink on PATH.
A copy downloaded on its own clones launch into `<dir>/launch` (dir defaults to `~/mimi-os`) and hands over to it.
`update` pulls launch first; when that changes `mimi-launch`, it checks the new copy with `bash -n`: a copy that
parses runs with the same arguments, and otherwise launch goes back to the previous commit and the run stops.

`server` and `devkit` write `~/.local/bin/mimi`, a small script that runs this workspace's `mimi` CLI from any
folder; switching to `agents` removes it. On devkit, `reset` wipes the workspace gateway's state, and
`mimi-dev down --reset` wipes mimi-dev's. The repos are public and clone over https; to clone over ssh,
set `MIMI_GIT_BASE=git@github.com:Mimi-agent-os`.

## First time as an agent developer

```sh
git clone https://github.com/Mimi-agent-os/launch.git ~/mimi-os/launch
~/mimi-os/launch/mimi-launch devkit    # protocol, sdk, plugins, gateway and devkit, built and typechecked
cd <your agent>
pnpm add link:$HOME/mimi-os/sdk && pnpm add -D link:$HOME/mimi-os/devkit
pnpm exec mimi-dev up --provider openrouter --model <id> --ctx <tokens>   # see devkit's README
```

For an agent that connects to a gateway running elsewhere, `~/mimi-os/launch/mimi-launch agents` clones
protocol, sdk and plugins; then `pnpm add link:$HOME/mimi-os/sdk` in the agent's folder.

An agent on the gateway's machine runs as your OS user, with access to the gateway's files, its `.env` and keys
included. Run agents you did not write on another machine (an `agents` workspace) or as another OS user.
Wrap an agent's web server in the SDK's guard: `gatewayOnly()` on its requests, `fromGateway(req)` on its
WebSocket upgrades.

## First time on a server

Run everything as the user that will own the stack; pm2 comes from `npm i -g pm2`.

```sh
git clone https://github.com/Mimi-agent-os/launch.git ~/mimi-os/launch && cd ~/mimi-os
echo "GATEWAY_ARGS=--lan $(tailscale ip -4)" > ecosystem.env   # let the app dial in over Tailscale
launch/mimi-launch server             # asks for the public URL, then clones protocol and gateway, builds, starts the gateway under pm2
echo 'MIMI_TZ=America/New_York' >> gateway/mimi/.env   # your time zone; OPENROUTER_API_KEY, VLLM_API_KEY go here too
pm2 restart gateway
pm2 startup                           # prints a sudo line: run it so the stack comes back after a reboot
pm2 save
mimi pair                             # one link: paste it into the app's Connect screen within 2 minutes
```

The public URL is the address the app dials when it reaches this machine by a domain or a forwarded port, like
`https://mimi.example.com:8443`: paste it at the first question, or press Enter to skip. `mimi public-url <url>`
changes it later. The question appears in a terminal; scripts pass the URL with `--public-url`.

Check with `mimi status`, `pm2 ls` and `pm2 logs gateway`; update later with `launch/mimi-launch update`. The first
run calls `pm2 save` once the gateway passes its health check; otherwise `pm2 logs gateway` shows the reason, and
`launch/mimi-launch update` completes the setup after the fix. The pairing link names the public URL if one is set,
else a Tailscale address if the gateway listens on one, else LAN, else loopback; `--address <url>` picks another.
Then, in the app, add your models (Models) and, if you like, their prices and daily limits (Settings, Limits & prices).

Licensed under Apache-2.0, see LICENSE.

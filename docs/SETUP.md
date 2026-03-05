# Setup Guide

Step-by-step instructions for getting obsidian-ai-mcp running. Two modes covered:

- **Local mode** — Claude Code running on your Windows machine (most common)
- **Codespace mode** — Claude Code running in a GitHub Codespace, vault on your Windows machine

---

## Prerequisites (both modes)

| Tool | Why | Install |
|------|-----|---------|
| Windows 10/11 | Server runs on Windows | — |
| Node.js 18+ | Runs the MCP server | [nodejs.org](https://nodejs.org) |
| Git | Clone the repo | [git-scm.com](https://git-scm.com) |
| Claude Code CLI | The AI tool you'll use | [claude.ai/code](https://claude.ai/code) |
| Obsidian | Browse and edit your notes | [obsidian.md](https://obsidian.md) — installer handles this |

---

## Step 1 — Clone the repo

Open PowerShell and run:

```powershell
git clone https://github.com/xiaoyanfeifei/obsidian-ai-mcp
cd obsidian-ai-mcp
```

---

## Step 3 — Run the installer

```powershell
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned -Force
.\install.ps1
```

The installer will:

1. **Check Node.js** — errors if below v18
2. **Install Obsidian** — detects if missing, offers `winget install`. Pauses and walks you through creating a vault before continuing
3. **Check Claude Code CLI** — errors if missing
4. **Ask for your vault path** — defaults to `Documents\Obsidian Vault`. Creates the folder if it doesn't exist
5. **Save `OBSIDIAN_VAULT`** as a permanent user environment variable
6. **Scaffold `Inbox/` and `Notes/`** — or offer to migrate existing notes at vault root
7. **Generate auth token** — random 32-char token saved as `MCP_AUTH_TOKEN` user env var (used by Codespace mode)
8. **Write `vault.config.yaml`** — customisation file in your vault root
9. **Build the server** — runs `npm install` + `npm run build` automatically (first time only)
10. **Register with Claude Code** — runs `claude mcp add obsidian ...`

---

## Step 4 — Verify (local mode)

```powershell
claude
```

Inside Claude:
```
/mcp
```

You should see `obsidian` listed with 14 tools. If so, you're done.

Try it:
```
what's in my vault?
create a devlog for today
show my open tasks
```

---

## Codespace mode (optional)

Use this if you want Claude Code running in a **GitHub Codespace** to access your vault on your Windows machine.

### How it works

```
GitHub Codespace (Claude) → Cloudflare tunnel → your Windows machine → vault on disk
```

A Cloudflare tunnel creates a temporary HTTPS URL that forwards requests from the Codespace to your local MCP server. No ports need to be opened. The tunnel URL changes each time you restart.

### One-time setup on your Windows machine

Run `install.ps1` first (Step 3 above) — it sets the `MCP_AUTH_TOKEN` env var that `start.ps1` reads.

### Every time you want to use a Codespace

**On your Windows machine** — open PowerShell and run:

```powershell
cd C:\path\to\obsidian-ai-mcp
.\start.ps1
```

First run: offers to install `cloudflared` via winget if not found.

The script will print something like:

```
======================================================
  Run this in your Codespace to connect:
======================================================

  curl -s https://abc-def-123.trycloudflare.com/setup.sh | bash

  (then start a fresh Claude session)
======================================================
```

Keep this PowerShell window open — closing it stops the server and tunnel.

**In your Codespace** — paste and run the `curl` command printed above:

```bash
curl -s https://abc-def-123.trycloudflare.com/setup.sh | bash
```

This registers the MCP server in the Codespace. Then:

```bash
claude
```

Inside Claude:
```
/mcp
```

Click **Authenticate** → a browser window opens on your machine → closes automatically.

Start a **fresh Claude session** (exit and re-run `claude`). Tools are now live.

### If it's your first time in this Codespace

The `/mcp` → Authenticate step is required once per Codespace. After that, re-running `start.ps1` + the curl command is enough on subsequent sessions.

### Automate with dotfiles (optional)

If you use GitHub dotfiles, copy `dotfiles/install.sh` from this repo into your dotfiles repo and enable it at **GitHub Settings → Codespaces → Dotfiles**.

This adds a `setup-obsidian <tunnel-url>` shell function to every new Codespace automatically, so you only need to run:

```bash
setup-obsidian https://abc-def-123.trycloudflare.com
```

---

## Updating

When the repo gets new changes:

```powershell
cd C:\path\to\obsidian-ai-mcp
git pull
npm run build
```

No need to re-run `install.ps1` unless told otherwise.

---

## Troubleshooting

**`/mcp` shows obsidian but 0 tools**
- Restart the Claude session: exit and run `claude` again

**`OBSIDIAN_VAULT not set` error**
- Close and reopen PowerShell (env var was set in the current session only)
- Or run `install.ps1` again

**Codespace: tunnel URL expired**
- The Cloudflare URL changes on every `start.ps1` run. Re-run start.ps1 and the curl command.

**Build errors after `git pull`**
- Run `npm install` then `npm run build` from the repo folder

**`cloudflared not found` on a non-default install path**
- Edit the `$CLOUDFLARED` path at the top of `start.ps1`

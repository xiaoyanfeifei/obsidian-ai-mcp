# obsidian-ai-mcp

> Give Claude Code and GitHub Copilot direct access to your Obsidian vault — search, read, and write notes using natural language. Your vault stays local on your machine.

**[→ Full docs & intro](https://xiaoyanfeifei.github.io/obsidian-ai-mcp/)**

Works with **Claude Code**, **GitHub Copilot CLI**, and any other MCP-compatible client. The install script registers with Claude Code automatically — for other clients, see [Other MCP clients](https://xiaoyanfeifei.github.io/obsidian-ai-mcp/#other-clients).

Works in two modes:

| Mode | When to use |
|------|-------------|
| **Local** (stdio) | Claude Desktop or Claude Code on the same machine |
| **Remote** (HTTP + tunnel) | Claude Code in GitHub Codespaces |

---

## What makes this different

There are many ways to give an AI access to a note vault. Most just expose the file system. This one makes three opinionated choices:

**Capture first, curate later.** Everything AI-generated lands in `Inbox/` first — never silently inserted into your permanent notes. You review and promote what's worth keeping. The `promote_note` tool is append-only: it will never overwrite an existing note in `Notes/`, only add to it. This mirrors the capture-before-organise principle from GTD: the friction should live at the curation step, not the capture step.

**Flat by default.** Notes live in two folders: `Inbox/` and `Notes/`. No nested hierarchies to maintain, no taxonomy decisions mid-session. Niklas Luhmann's Zettelkasten worked as a flat collection linked by cross-references — and Andy Matuschak's research on evergreen notes reaches the same conclusion: links and search surface notes better than folders do.

**Preferences that persist.** Drop a `vault_context.md` in your vault root — your timezone, team names, writing style, recurring projects. The server reads it once at startup and sends it to Claude as part of the session handshake. Zero per-call overhead. Every session, Claude already knows your context. Research on persistent AI memory (Mem0, 2025) found that stable user context improved task accuracy by 26% and cut token usage by 90% vs. re-stating context each time.

---

## How it works

```
┌─────────────────────────────────────────────────────┐
│  Claude (local or Codespace)                        │
│                                                     │
│  "summarize my devlog and add a decision entry"     │
│  "what tasks are open in Current Works?"            │
│  "create a spec for the new auth flow"              │
└────────────────────┬────────────────────────────────┘
                     │  MCP protocol
                     ▼
         ┌───────────────────────┐
         │  obsidian-ai-mcp      │  ← runs on your machine
         │  14 vault tools       │
         └───────────┬───────────┘
                     │  fs/promises (direct file I/O)
                     ▼
         ┌───────────────────────┐
         │  Your Obsidian Vault  │  ← stays local, always
         │  (.md files on disk)  │
         └───────────────────────┘
```

For **Codespaces**, a Cloudflare tunnel bridges the remote Claude to your local server — no ports opened, no data leaves your machine except through MCP requests you initiate:

```
GitHub Codespace → Cloudflare tunnel → localhost:PORT → vault on disk
```

---

## Install

> **Pick your setup first — the steps are different:**
>
> | Setup | When to use |
> |-------|-------------|
> | **Local — Windows** | Claude Code and your vault are on the same Windows machine |
> | **Local — Mac** | Claude Code and your vault are on the same Mac |
> | **Codespace** | Claude Code runs in GitHub Codespaces; vault is on your local machine |

---

### Local setup — Windows

Claude Code and your vault are on the same machine. The MCP server runs as a local process — no tunnel, no server to keep running.

**Step 1 — Install prerequisites**

| Tool | Install |
|------|---------|
| Node.js 18+ | [nodejs.org](https://nodejs.org) — download and run the installer |
| Claude Code CLI | [claude.ai/code](https://claude.ai/code) — follow the setup instructions |

After installing both, **open a new PowerShell window** so they're on your PATH.

**Step 2 — Run the installer**

```powershell
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned -Force
irm https://raw.githubusercontent.com/xiaoyanfeifei/obsidian-ai-mcp/master/install.ps1 | iex
```

The installer will:
1. **Install Obsidian** if not found — pauses so you can create a vault before continuing
2. **Ask for your vault path** — defaults to `Documents\Obsidian Vault`
3. **Create `Inbox/`, `Notes/`, and `Capture.md`** in your vault
4. **Generate a secure auth token** and save it as an environment variable
5. **Register the MCP server** with Claude Code — first run downloads the package (~10 seconds)

**Step 3 — Verify**

Open a **new** PowerShell window (the installer set environment variables that need a fresh terminal):

```powershell
claude
# inside Claude:
/mcp
```

You should see `obsidian` listed with **14 tools connected**. If you see 0 tools, exit Claude and run it again.

Run `/mcp` every time you start a new Claude session to confirm the vault is connected.

---

### Local setup — Mac

**Step 1 — Install prerequisites**

| Tool | Install |
|------|---------|
| Node.js 18+ | `brew install node` or [nodejs.org](https://nodejs.org) |
| Claude Code CLI | [claude.ai/code](https://claude.ai/code) |

**Step 2 — Run the installer**

```bash
curl -fsSL https://raw.githubusercontent.com/xiaoyanfeifei/obsidian-ai-mcp/master/install-mac.sh -o install-mac.sh
bash install-mac.sh
```

The installer will:
1. **Ask for your vault path** — defaults to `~/Documents/Obsidian Vault`
2. **Create `Inbox/`, `Notes/`, and `Capture.md`** in your vault
3. **Save `OBSIDIAN_VAULT`** to your shell profile (`~/.zshrc` or `~/.bashrc`)
4. **Generate a secure auth token** (`MCP_AUTH_TOKEN`) in your shell profile
5. **Register the MCP server** in `~/.claude.json`

**Step 3 — Verify**

Open a **new** terminal tab (so the shell profile changes take effect):

```bash
claude
# inside Claude:
/mcp
```

You should see `obsidian` listed with **14 tools connected**. If you see 0 tools, exit and run `claude` again.

---

### Codespace setup (HTTP + Cloudflare connection)

Claude Code runs in a GitHub Codespace. Your vault lives on your local Windows machine. Since a Codespace can't reach `localhost` directly, `start.ps1` creates a secure Cloudflare connection that gives your Codespace a temporary URL to reach the vault. Nothing is stored; the connection closes when you stop the script.

**Prerequisite:** run the local installer first — it sets `OBSIDIAN_VAULT` and `MCP_AUTH_TOKEN` automatically.

**Step 1 — On your local Windows machine**

Download and run `start.ps1` — keep it running while you work in the Codespace:

```powershell
irm https://raw.githubusercontent.com/xiaoyanfeifei/obsidian-ai-mcp/master/start.ps1 -OutFile start.ps1
.\start.ps1
# prints a curl command when ready — copy it
```

**Step 2 — In your Codespace: run setup**

```bash
# paste the curl command printed by start.ps1:
curl -s https://<url>.trycloudflare.com/setup.sh | bash
```

**Step 3 — Authenticate, then start a fresh Claude session**

```bash
claude
# inside Claude:
/mcp
# click Authenticate → browser tab opens → auto-closes
/exit

# start a new Claude session — tools are now live:
claude
```

> **Important:** you must start a **new** Claude session after authenticating. The auth token is loaded at startup, not mid-session.

You should see `obsidian` listed with **14 tools connected**.

**Automate with dotfiles (optional):** copy `dotfiles/install.sh` into your GitHub dotfiles repo and enable it at **GitHub Settings → Codespaces → Dotfiles**. Every new Codespace gets a `setup-obsidian <url>` shell function automatically.

---

### Switching vaults

To point the MCP server at a different vault, run the switcher for your OS — it updates both the environment variable and the MCP registration in one step, without re-running the full installer.

**Windows:**
```powershell
irm https://raw.githubusercontent.com/xiaoyanfeifei/obsidian-ai-mcp/master/switch-vault.ps1 | iex
```

**Mac:**
```bash
curl -fsSL https://raw.githubusercontent.com/xiaoyanfeifei/obsidian-ai-mcp/master/switch-vault.sh -o switch-vault.sh
bash switch-vault.sh
```

Both scripts:
1. Show your current vault
2. Ask for the new vault path (creates it if it doesn't exist)
3. Scaffold `Inbox/`, `Notes/`, `Capture.md`, `vault.config.yaml`, and `vault_context.md` if they're missing
4. Update `OBSIDIAN_VAULT` and `~/.claude.json`

Open a new terminal after running — changes take effect in the next Claude session.

---

## Vault structure

The server enforces a two-folder workflow:

```
Your Vault/
  Inbox/                              ← All new notes land here first
    2026-03-04 - Devlog - Auth PR.md
    2026-03-04 - Spec - Rate Limiting.md
    2026-03-04 - Meeting - Daily.md
    Capture.md                        ← Quick scratch pad (append to top)
    README.md
  Notes/                              ← Permanent notes (promoted from Inbox)
    Auth Strategy.md
    Current Works.md
    Rate Limiting Spec.md
  Trash/                              ← Deleted notes (recoverable)
```

**New notes always go to `Inbox/`** — with a date prefix and auto-injected frontmatter. When a note is reviewed and ready, use `promote_note` to move it to `Notes/`. Existing files are always updated in place.

### The two-phase workflow

```
Inbox/2026-03-04 - Devlog - Auth PR.md   →   Notes/Auth PR Devlog.md
  ↑ append freely during the session          ↑ append-only, permanent
  auto-dated, auto-frontmatter                  Inbox draft deleted on promote
```

This keeps AI-generated drafts isolated from your permanent notes until you've reviewed them.

---

## Why use with Codespace?

Your Obsidian vault becomes Claude's memory inside Codespace — specs, bug notes, and context you already wrote flow directly into the code session. No copy-paste, no re-explaining.

| Use case | How it works |
|----------|-------------|
| **Spec → implementation** | Write the feature spec in Obsidian, then: "read my caching spec and implement the TTL logic in `src/cache.ts`" — Claude reads your design intent and the code simultaneously |
| **Bug investigation** | Log observed behavior and hypotheses as you debug, then: "read my auth bug notes and look at `src/auth/` — what am I missing?" |
| **Resume where you left off** | Log "what I did and what's next" in your devlog. Next Codespace: "read my devlog from yesterday and catch me up" — even from a brand new Codespace |
| **Code review with checklist** | Jot review concerns in Obsidian, then: "read my review checklist and go through the changed files in PR #142" |
| **ADR → code** | Write an Architecture Decision Record for the chosen approach, then: "read my ADR on pagination and implement it" — design intent travels intact into implementation |

---

## Usage

You never need to name tools explicitly. Just describe what you want:

```
what's in my inbox?
create a devlog for the rate limiting work
log: decided to use token bucket over sliding window — simpler to reason about
show open tasks in Current Works
promote my devlog from today
```

### Note types

`create_note` generates structured templates per type:

| Type | Use for |
|------|---------|
| `devlog` | Session logs while working — timestamped entries, append freely |
| `learning` | Capturing something new — insight, source, key details |
| `spec` | Feature and design specs — goals, non-goals, design, decisions |
| `note` | Freeform — source banner, open questions, next steps |
| `meeting` | Daily meeting log — one file per day, one `## HH:MM — Title` section per meeting |
| `decision` | Architecture Decision Records — context, decision, consequences, alternatives |

### Meeting notes

Meetings use a daily-file pattern — one `Inbox/YYYY-MM-DD - Meeting - Daily.md` per day, with each meeting appended as a section:

```markdown
# Meetings — 2026-03-04

## 10:00 — 1:1 with Manager
**With:** Sam

Discussed rate limiting timeline. Sam wants a draft spec by EOW.

**Actions:**
- [ ] Draft rate limiting spec  @me

---

## 14:30 — API design review
**With:** Sam, Jordan, Taylor

...
```

At end of day, promote individual meeting sections to permanent per-project notes in `Notes/`.

---

## Tools reference

| Tool | Description |
|------|-------------|
| `vault_summary` | Folder counts + 10 recent files — good session opener |
| `vault_review` | Processing queue: stale drafts, open tasks, proposed decisions, missing wikilinks |
| `vault_search` | Full-text search; optional folder scope + line context |
| `read_note` | Read by filename (wikilink-style) or vault-relative path |
| `list_notes` | File tree grouped by folder |
| `list_inbox` | Inbox drafts with metadata; filter by date or type |
| `list_tasks` | Find `- [ ]` / `- [x]` tasks; filter by file, status, daily note |
| `complete_task` | Toggle task done/reopen; partial text match; auto-updates frontmatter |
| `create_note` | Type-aware note creation with templates |
| `write_note` | Create or overwrite; new files → `Inbox/`, existing files updated in place |
| `append_to_note` | Append to a note; `position: top` prepends (use for `Capture.md`); auto-updates frontmatter |
| `promote_note` | Inbox draft → `Notes/` (append-only, never overwrites); deletes draft |
| `rename_note` | Rename or move within vault |
| `delete_note` | Move to `Trash/` (recoverable) |

---

## Writing style

All notes written by Claude follow these principles (enforced in tool descriptions):

1. **Big picture first** — one sentence on what this is and why it matters
2. **Source is first-class** — attribute every claim; `> *Source: ...*` for external-source content
3. **Mark confidence** — ⚠️ unverified · `[repo]` confirmed in code · `[teams]` from conversation
4. **Known vs unknown** — gaps as explicit `- [ ]` open questions, not silence
5. **Relationships** — `[[wikilinks]]`, name the people and systems
6. **Status at a glance** — ✅ / 🔄 / 🔜 for anything with moving parts
7. **Next steps** — end with what to do when coming back
8. **Minimum length** — cut anything that doesn't add understanding

---

## Customization

The server reads `vault.config.yaml` from your vault root at startup. The installer creates a starter file with all options commented out — edit it and restart the server to apply changes.

### What you can configure

```yaml
# vault.config.yaml

# Rename the folders (e.g. Drafts instead of Inbox)
inbox_folder: Inbox
notes_folder: Notes

# Days before a draft is flagged stale in vault_review
stale_days: 3

# Keep or delete Inbox draft after promote_note
promote_delete_source: true

# Override a built-in note type template
# Placeholders: {{topic}}, {{date}}, {{time}}, {{context}}
# Note: no title heading needed — the filename already contains the topic
templates:
  devlog: |
    **Date:** {{date}}
    {{context}}

    ---

    ### {{time}} — Starting point

# Add entirely new note types
custom_types:
  - name: standup
    label: Standup
    template: |
      # Standup — {{date}}
      **Yesterday:**
      **Today:**
      **Blockers:**
```

### What's fixed

These behaviors cannot be overridden — they're safety guarantees:

| Behavior | Why fixed |
|----------|-----------|
| New notes go to `inbox_folder` first | Keeps AI drafts isolated until reviewed |
| `promote_note` is append-only | Permanent notes are never overwritten |
| Frontmatter auto-injected in Inbox | Enables `vault_review` and `list_inbox` |

### User preferences (Layer 2)

Create a `vault_context.md` file in your vault root. The MCP server reads it at startup and sends it to Claude as part of the MCP session handshake — once per session, zero per-call overhead:

```markdown
# Vault context

Rules — follow these always:

1. Timezone is Pacific (America/Los_Angeles)
2. ProjectX = my main feature · team: Sam, Jordan, Taylor
3. Link action items to [[Current Works]] only if that exact note exists
4. Notes are personal — written for quick re-reading, not for an audience
5. Big picture first: one sentence on what this is and why it matters
```

The installer creates a starter `vault_context.md` with writing style principles pre-filled. Edit it freely — changes take effect on the next Claude session (server restart).

---

## Environment variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `OBSIDIAN_VAULT` | Yes | — | Absolute path to vault |
| `MCP_HTTP_PORT` | HTTP mode | — | Port to listen on |
| `MCP_AUTH_TOKEN` | HTTP mode | — | Pre-shared bearer token |
| `MCP_BASE_URL` | HTTP mode | `http://localhost:<port>` | Public tunnel URL (set by `start.ps1`) |
| `MCP_TIMEZONE` | No | system | Timezone for timestamps (e.g. `America/New_York`) |

---

## Project structure

```
src/
  index.ts              # Server entry, tool registration, transport (stdio + HTTP)
  config/
    note-types.ts       # Templates per note type — source of truth
  tools/
    search.ts           # vault_search
    files.ts            # read_note
    tasks.ts            # list_tasks, complete_task
    write.ts            # list_notes, list_inbox, vault_summary, vault_review,
                        # write_note, append_to_note
    create.ts           # create_note
    promote.ts          # promote_note
    manage.ts           # rename_note, delete_note
  utils/
    vault.ts            # getVaultPath(), walkVault()
    frontmatter.ts      # today(), frontmatter helpers, prependToContent()
install.ps1             # One-step installer for Windows
start.ps1               # Start server + Cloudflare tunnel (Codespace mode)
dotfiles/
  install.sh            # GitHub dotfiles hook for Codespace auto-setup
```

---

## License

MIT

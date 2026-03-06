# obsidian-ai-mcp

> Give Claude direct access to your Obsidian vault — search, read, and write notes using natural language. Your vault stays local on your machine.

Works in two modes:

| Mode | When to use |
|------|-------------|
| **Local** (stdio) | Claude Desktop or Claude Code on the same machine |
| **Remote** (HTTP + tunnel) | Claude Code in GitHub Codespaces |

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
> | **Local** | Claude Code runs on the **same Windows machine** as your vault |
> | **Codespace** | Claude Code runs in **GitHub Codespaces** and your vault is on a local Windows machine |

---

### Local setup (Windows)

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

### Codespace setup (HTTP + Cloudflare connection)

Claude Code runs in a GitHub Codespace. Your vault lives on your local Windows machine. Since a Codespace can't reach `localhost` directly, `start.ps1` creates a secure Cloudflare connection that gives your Codespace a temporary URL to reach the vault. Nothing is stored; the connection closes when you stop the script.

**Prerequisite:** run the local installer first — it sets `OBSIDIAN_VAULT` and `MCP_AUTH_TOKEN` automatically, so `start.ps1` needs no editing.

**Step 1 — On your local Windows machine**

Run this once and keep it running while you work:

```powershell
.\start.ps1
# prints a curl command when ready — copy it
```

**Step 2 — In your Codespace**

```bash
# paste the curl command from step 1:
curl -s https://<url>.trycloudflare.com/setup.sh | bash
claude
/mcp   → click Authenticate → browser opens → auto-closes
```

Start a **fresh** Claude session — tools are live.

**Automate with dotfiles (optional):** copy `dotfiles/install.sh` into your GitHub dotfiles repo and enable it at **GitHub Settings → Codespaces → Dotfiles**. Every new Codespace gets a `setup-obsidian <url>` shell function automatically.

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
templates:
  devlog: |
    # Devlog: {{topic}}
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

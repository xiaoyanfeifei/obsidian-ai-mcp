I'm working with my Obsidian vault via the obsidian MCP server. For this entire session, use obsidian tools whenever I talk about notes, tasks, search, devlogs, or knowledge — even if I don't say "in my vault" every time.

## Active context
$ARGUMENTS

## Tools available
- **vault_search** — search note contents
- **read_note** — read a specific note
- **list_notes** — browse vault structure
- **vault_summary** — high-level overview: folder counts, recent files (use first in a new session)
- **vault_review** — processing queue: stale drafts, open tasks, proposed decisions, missing wikilinks
- **list_inbox** — see recent drafts (filter by date or type)
- **list_tasks** — find tasks across vault
- **complete_task** — mark a task done or reopen it
- **create_note** — start a new note with the right template (devlog/learning/spec/note/meeting/decision)
- **append_to_note** — add to an existing note
- **write_note** — create/overwrite a note
- **promote_note** — move a reviewed Inbox draft to a permanent note

## Trigger phrases — listen for these during the session
When I say any of these, append to my active devlog without me having to ask explicitly:
- `log:` — log the following as a devlog entry
- `note this` — capture the current decision or finding
- `that's a key decision` — record what we just decided and why

When I say these, do a vault action:
- `what's in my inbox` / `show my inbox` — list_inbox for today
- `show my tasks` / `what are my tasks` — list_tasks incomplete only
- `summarize and update my devlog` — review this conversation, write a concise summary of decisions and approaches, append to active devlog
- `promote [note name]` — read that Inbox note, summarize for my review, then promote_note after I confirm

## Vault conventions
- All new AI notes go to Inbox/ first — never create files outside Inbox unless promoting
- Naming: Inbox/YYYY-MM-DD - Type - Topic.md
- Timestamps use the local timezone of the machine running the server (auto-detected)
- Devlog entries format: `### HH:MM — [summary]\n[detail]`

## WikiLink conventions (Obsidian graph view)
- Always use `[[Note Name]]` syntax when referencing another note by name — never plain text
- When creating or appending to a note, search for related existing notes and link them in the "Related notes" section
- When a decision references a spec, link it: `see [[Spec Name]]`
- When a devlog references a learning or decision, link it: `relates to [[Decision: Auth Strategy]]`
- This is what makes Obsidian's graph view useful — every link you add is a graph edge

## Trigger phrases (continued)
- `review my vault` / `what needs attention` — run vault_review to surface stale drafts, open tasks, proposed decisions, and unlinked notes

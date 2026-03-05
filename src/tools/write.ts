/**
 * Write Tools
 * Create and update notes in the vault
 *
 * VAULT CONVENTION — Inbox-first:
 *   All AI-generated notes land in Inbox/ first.
 *   Naming convention: YYYY-MM-DD - Type - Topic.md
 *   Types: Devlog | Learning | Spec | Note
 *   Frontmatter (type, topic, status, created, updated, changes) is auto-injected.
 */

import { readFile, writeFile, mkdir, stat } from 'fs/promises';
import { join, dirname, basename } from 'path';
import { z } from 'zod';
import matter from 'gray-matter';
import { getVaultPath, walkVault, findNoteByName, toRelPath, OPEN_TASK_RE } from '../utils/vault.js';
import { today, parseInboxFilename, injectFrontmatter, appendToContent, prependToContent, parseFrontmatter } from '../utils/frontmatter.js';
import { getConfig, getVaultPreferences } from '../utils/config.js';

/** Route bare filenames to inbox folder; explicit folder paths pass through unchanged */
async function resolveWritePath(inputPath: string): Promise<string> {
  const normalized = inputPath.replace(/\\/g, '/');
  if (normalized.includes('/')) return normalized;
  const config = await getConfig();
  return `${config.inbox_folder}/${normalized}`;
}

/** Find an existing file by bare filename anywhere in the vault. Returns vault-relative path or null. */
async function findExistingFile(vaultPath: string, inputPath: string): Promise<string | null> {
  const normalized = inputPath.replace(/\\/g, '/');
  if (normalized.includes('/')) return null; // explicit path — no search needed
  const fp = await findNoteByName(vaultPath, normalized);
  return fp ? toRelPath(vaultPath, fp) : null;
}

// ─── Tool definitions ────────────────────────────────────────────────────────

export const writeNoteTool = {
  name: 'write_note',
  description: `Create or overwrite a note in the vault.

INBOX-FIRST RULE: New notes always go to Inbox/ unless a folder is explicitly specified.
EXISTING FILES: If a bare filename matches an existing file anywhere in the vault, it is updated in place — do NOT re-route it to Inbox.

Naming convention for new Inbox drafts:  YYYY-MM-DD - Type - Topic.md
  Types: Devlog | Learning | Spec | Note
  Example: "2026-03-03 - Devlog - Content Streaming Animation.md"

Frontmatter (type, topic, status, created, updated, changes) is auto-injected for Inbox files.
Type and topic are inferred from the filename if not provided explicitly.

CAPTURE-FIRST RULE: For quick tasks, short notes, or anything the user hasn't explicitly asked to put in a specific note — use append_to_note on the capture file (Inbox/Capture.md) with position="top" instead. Only use write_note when creating or fully rewriting a structured note.

WRITING STYLE — personal notes written for quick re-reading and thinking, not for an audience:
1. Big picture first — one sentence on what this is and why it matters
2. Source is first-class — attribute every claim; open with a source banner for notes from external sources
3. Mark confidence — ⚠️ unverified, [repo] confirmed in code, [teams] from conversation
4. Known vs unknown — gaps as explicit - [ ] open questions, not silence
5. Relationships — [[wikilinks]], name the people and systems
6. Status tables — ✅ / 🔄 / 🔜 for anything with moving parts
7. Next steps — end with what to do when coming back
8. Minimum length — cut anything that doesn't add understanding`,
  inputSchema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Path relative to vault root. Bare filenames (no "/") go to Inbox/ automatically.',
      },
      content: {
        type: 'string',
        description: 'Markdown content. Frontmatter is auto-added for Inbox files.',
      },
      type: {
        type: 'string',
        description: 'Note type: devlog | learning | spec | note. Inferred from filename if omitted.',
      },
      topic: {
        type: 'string',
        description: 'Human-readable topic, e.g. "Content Streaming Animation". Inferred from filename if omitted.',
      },
    },
    required: ['path', 'content'],
  },
};

export const appendToNoteTool = {
  name: 'append_to_note',
  description: `Append content to an existing note, updating its frontmatter change log automatically.

CAPTURE-FIRST RULE: Unless the user explicitly names a specific note to update, ALL quick captures go to the capture file (Inbox/Capture.md) with position="top":
- Tasks: "add a task", "remind me to...", "I need to..."
- Short notes: "note that...", "log that...", "remember..."
- Meeting actions, follow-ups, random thoughts
Do NOT create or update permanent notes (e.g. Current Works) for these — use Capture.md.

STRUCTURED NOTES RULE: Only write to a specific permanent note when the user explicitly asks (e.g. "add this to Current Works", "update my spec"). When doing so, read the note first to understand its structure (headings, sections) and insert content in the correct section — never blindly append to the end.

INBOX-FIRST RULE: New files created via this tool go to Inbox/ unless a folder is specified.
Existing files are updated in place wherever they are in the vault.`,
  inputSchema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Path relative to vault root.',
      },
      file: {
        type: 'string',
        description: 'Filename to find anywhere in the vault (wikilink-style). Searches existing files first.',
      },
      content: { type: 'string', description: 'Markdown content to append.' },
      change_note: {
        type: 'string',
        description: 'Brief description logged in frontmatter changes, e.g. "Added auth decision notes".',
      },
      position: {
        type: 'string',
        enum: ['bottom', 'top'],
        description: 'Where to insert: "bottom" (default) or "top" (inserts after the first --- divider). Use "top" for the capture file (config.capture_file).',
      },
    },
  },
};

export const listNotesTool = {
  name: 'list_notes',
  description: 'List notes in the vault grouped by folder. Call this to understand vault structure before reading or writing.',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Subfolder to list (optional, defaults to entire vault).' },
    },
  },
};

export const listInboxTool = {
  name: 'list_inbox',
  description: `List notes in Inbox/ with their metadata (type, topic, status, created, updated).
Use to answer "what did I add today?" or to find drafts ready to promote to permanent notes.`,
  inputSchema: {
    type: 'object',
    properties: {
      date: { type: 'string', description: 'Filter by date prefix in filename, e.g. "2026-03-03".' },
      type: { type: 'string', description: 'Filter by note type: devlog | learning | spec | note | meeting | decision.' },
    },
  },
};

export const vaultSummaryTool = {
  name: 'vault_summary',
  description: 'Return a high-level overview of the vault: folders, note counts per folder, total notes, and the 10 most recently modified files. Use this to orient in an existing vault before searching or writing.',
  inputSchema: { type: 'object', properties: {} },
};

export const vaultReviewTool = {
  name: 'vault_review',
  description: `Surface notes and tasks that need attention — the vault's processing queue.
Returns:
- Inbox drafts not promoted after 3+ days
- Open tasks grouped by file
- Decision notes still in "proposed" status
- Spec/learning notes with unchecked open questions
- Notes with empty "Related notes" sections (candidates for wikilinks)
Use when the user says "review my vault", "what needs attention", or wants a weekly review.`,
  inputSchema: {
    type: 'object',
    properties: {
      stale_days: {
        type: 'number',
        description: 'Days before an Inbox draft is considered stale. Default: 3.',
      },
    },
  },
};

// ─── Schemas ─────────────────────────────────────────────────────────────────

const WriteNoteInputSchema = z.object({
  path: z.string(),
  content: z.string(),
  type: z.string().optional(),
  topic: z.string().optional(),
});

const AppendToNoteInputSchema = z.object({
  path: z.string().optional(),
  file: z.string().optional(),
  content: z.string(),
  change_note: z.string().optional(),
  position: z.enum(['bottom', 'top']).optional(),
}).refine(d => d.path || d.file, { message: 'Either path or file must be provided' });

const ListNotesInputSchema = z.object({
  path: z.string().optional(),
});

const ListInboxInputSchema = z.object({
  date: z.string().optional(),
  type: z.string().optional(),
});

// ─── Executors ───────────────────────────────────────────────────────────────

export async function executeWriteNote(args: unknown) {
  const input = WriteNoteInputSchema.parse(args);
  const vaultPath = getVaultPath();
  const config = await getConfig();
  const existing = await findExistingFile(vaultPath, input.path);
  const resolvedPath = existing ?? await resolveWritePath(input.path);
  const filePath = join(vaultPath, resolvedPath);

  await mkdir(dirname(filePath), { recursive: true });

  let content = input.content;
  if (resolvedPath.startsWith(config.inbox_folder + '/')) {
    const fromFilename = parseInboxFilename(basename(filePath));
    content = injectFrontmatter(content, {
      type: input.type || fromFilename.type,
      topic: input.topic || fromFilename.topic,
    });
  }

  await writeFile(filePath, content, 'utf-8');

  return {
    content: [{ type: 'text', text: `Written: ${resolvedPath}` }],
  };
}

export async function executeAppendToNote(args: unknown) {
  const input = AppendToNoteInputSchema.parse(args);
  const vaultPath = getVaultPath();
  const changeNote = input.change_note || 'Updated';

  let filePath: string | null = null;

  const config = await getConfig();
  if (input.path) {
    filePath = join(vaultPath, await resolveWritePath(input.path));
  } else if (input.file) {
    filePath = await findNoteByName(vaultPath, input.file);
    if (!filePath) {
      const target = input.file.endsWith('.md') ? input.file : input.file + '.md';
      filePath = join(vaultPath, config.inbox_folder, target);
    }
  }

  let existing = '';
  try {
    existing = await readFile(filePath!, 'utf-8');
  } catch { /* new file */ }

  await mkdir(dirname(filePath!), { recursive: true });
  const updated = input.position === 'top'
    ? prependToContent(existing, input.content, changeNote)
    : appendToContent(existing, input.content, changeNote);
  await writeFile(filePath!, updated, 'utf-8');

  return {
    content: [{ type: 'text', text: `Appended: ${toRelPath(vaultPath, filePath!)}\n  ${changeNote}` }],
  };
}

export async function executeListNotes(args: unknown) {
  const input = ListNotesInputSchema.parse(args);
  const vaultPath = getVaultPath();
  const searchRoot = input.path ? join(vaultPath, input.path) : vaultPath;

  const grouped: Record<string, string[]> = {};

  for await (const fp of walkVault(searchRoot)) {
    const relPath = toRelPath(vaultPath, fp);
    const parts = relPath.split('/');
    const folder = parts.length > 1 ? parts.slice(0, -1).join('/') : '(root)';
    if (!grouped[folder]) grouped[folder] = [];
    grouped[folder].push(parts[parts.length - 1]);
  }

  return {
    content: [{ type: 'text', text: JSON.stringify(grouped, null, 2) }],
  };
}

export async function executeVaultSummary(_args: unknown) {
  const vaultPath = getVaultPath();
  const config = await getConfig();
  const folderCounts: Record<string, number> = {};
  const recentFiles: { path: string; mtime: number }[] = [];

  for await (const fp of walkVault(vaultPath)) {
    const relPath = toRelPath(vaultPath, fp);
    const parts = relPath.split('/');
    const folder = parts.length > 1 ? parts.slice(0, -1).join('/') : '(root)';
    folderCounts[folder] = (folderCounts[folder] || 0) + 1;

    try {
      const s = await stat(fp);
      recentFiles.push({ path: relPath, mtime: s.mtimeMs });
    } catch { /* skip */ }
  }

  const totalNotes = Object.values(folderCounts).reduce((a, b) => a + b, 0);
  const recent = recentFiles
    .sort((a, b) => b.mtime - a.mtime)
    .slice(0, 10)
    .map(f => f.path);

  const preferences = await getVaultPreferences();

  const summary = {
    total_notes: totalNotes,
    folders: Object.entries(folderCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([folder, count]) => ({ folder, count })),
    recently_modified: recent,
    config: {
      inbox_folder: config.inbox_folder,
      notes_folder: config.notes_folder,
      capture_file: `${config.inbox_folder}/${config.capture_file}`,
    },
    ...(preferences ? { user_preferences: preferences } : {}),
  };

  return { content: [{ type: 'text', text: JSON.stringify(summary, null, 2) }] };
}

export async function executeVaultReview(args: unknown) {
  const input = z.object({ stale_days: z.number().optional() }).parse(args ?? {});
  const config = await getConfig();
  const staleDays = input.stale_days ?? config.stale_days;
  const vaultPath = getVaultPath();
  const inboxPath = join(vaultPath, config.inbox_folder);
  const nowMs = Date.now();
  const staleMs = staleDays * 24 * 60 * 60 * 1000;

  const staleDrafts: { file: string; topic: unknown; daysOld: number }[] = [];
  const openTasks: { file: string; tasks: string[] }[] = [];
  const proposedDecisions: { file: string; topic: unknown }[] = [];
  const openQuestions: { file: string; topic: unknown; count: number }[] = [];
  const missingLinks: { file: string; topic: unknown }[] = [];

  const WIKILINK_RE = /\[\[.+?\]\]/;

  for await (const fp of walkVault(vaultPath)) {
    const content = await readFile(fp, 'utf-8');
    const relPath = toRelPath(vaultPath, fp);
    const meta = parseFrontmatter(content);
    const body = content.trimStart().startsWith('---') ? matter(content).content : content;

    // 1. Stale Inbox drafts (skip user-configured exempt files)
    const inboxExempt = new Set(config.stale_exempt);
    if (fp.startsWith(inboxPath) && !inboxExempt.has(basename(fp))) {
      const s = await stat(fp);
      const daysOld = Math.floor((nowMs - s.mtimeMs) / (24 * 60 * 60 * 1000));
      if (daysOld >= staleDays) {
        staleDrafts.push({ file: relPath, topic: meta.topic, daysOld });
      }
    }

    // 2. Open tasks (skip Inbox — those are drafts, not permanent task lists)
    if (!fp.startsWith(inboxPath)) {
      const taskMatches = [...body.matchAll(new RegExp(OPEN_TASK_RE.source, 'gm'))].map(m => m[1].trim());
      if (taskMatches.length > 0) {
        openTasks.push({ file: relPath, tasks: taskMatches.slice(0, 10) });
      }
    }

    // 3. Proposed decisions
    if (
      String(meta.type || '').toLowerCase() === 'decision' &&
      String(meta.decision_status || meta.status || '').toLowerCase() === 'proposed'
    ) {
      proposedDecisions.push({ file: relPath, topic: meta.topic });
    }

    // 4. Open questions in spec / learning notes
    if (['spec', 'learning'].includes(String(meta.type || '').toLowerCase())) {
      const oqSection = body.match(/## Open questions([\s\S]*?)(?=\n##|$)/);
      if (oqSection) {
        const unchecked = (oqSection[1].match(new RegExp(OPEN_TASK_RE.source, 'gm')) || []).length;
        if (unchecked > 0) {
          openQuestions.push({ file: relPath, topic: meta.topic, count: unchecked });
        }
      }
    }

    // 5. Notes with empty Related notes section (wikilink candidates)
    const relSection = body.match(/## Related notes([\s\S]*?)(?=\n##|$)/);
    if (relSection) {
      const hasLinks = WIKILINK_RE.test(relSection[1]);
      const hasText = relSection[1].trim().length > 0;
      if (hasText === false || (!hasLinks && relSection[1].trim().length < 5)) {
        missingLinks.push({ file: relPath, topic: meta.topic || basename(fp, '.md') });
      }
    }
  }

  const review = {
    stale_inbox_drafts: staleDrafts.sort((a, b) => b.daysOld - a.daysOld),
    open_tasks: openTasks,
    proposed_decisions: proposedDecisions,
    open_questions: openQuestions,
    missing_wikilinks: missingLinks,
    summary: {
      stale_drafts: staleDrafts.length,
      files_with_open_tasks: openTasks.length,
      proposed_decisions: proposedDecisions.length,
      specs_with_open_questions: openQuestions.length,
      notes_missing_links: missingLinks.length,
    },
  };

  return { content: [{ type: 'text', text: JSON.stringify(review, null, 2) }] };
}

export async function executeListInbox(args: unknown) {
  const input = ListInboxInputSchema.parse(args);
  const vaultPath = getVaultPath();
  const config = await getConfig();
  const inboxPath = join(vaultPath, config.inbox_folder);

  const results: Array<{
    file: string;
    type?: unknown;
    topic?: unknown;
    status?: unknown;
    created?: unknown;
    updated?: unknown;
    changes?: unknown;
  }> = [];

  for await (const fp of walkVault(inboxPath)) {
    const filename = basename(fp);
    if (input.date && !filename.startsWith(input.date)) continue;

    const relPath = toRelPath(vaultPath, fp);
    let meta: Record<string, unknown> = {};
    try {
      meta = parseFrontmatter(await readFile(fp, 'utf-8'));
    } catch { /* skip */ }

    if (input.type && String(meta.type || '').toLowerCase() !== input.type.toLowerCase()) continue;

    results.push({
      file: relPath,
      type: meta.type,
      topic: meta.topic,
      status: meta.status,
      created: meta.created,
      updated: meta.updated,
      changes: meta.changes,
    });
  }

  return {
    content: [{ type: 'text', text: JSON.stringify(results, null, 2) }],
  };
}

/**
 * Task Tools
 * Task management — reads .md files directly from the filesystem
 */

import { readFile, writeFile } from 'fs/promises';
import { join, basename } from 'path';
import { z } from 'zod';
import { getVaultPath, walkVault, findNoteByName, toRelPath, TASK_RE } from '../utils/vault.js';
import { appendToContent } from '../utils/frontmatter.js';

// ─── list_tasks ──────────────────────────────────────────────────────────────

export const listTasksTool = {
  name: 'list_tasks',
  description: 'List tasks from vault with optional filtering. Can filter by file, status, or show only incomplete tasks.',
  inputSchema: {
    type: 'object',
    properties: {
      file: {
        type: 'string',
        description: 'Filter to specific note filename',
      },
      path: {
        type: 'string',
        description: 'Filter to specific note path',
      },
      daily: {
        type: 'boolean',
        description: 'Get tasks from today\'s daily note',
      },
      todo_only: {
        type: 'boolean',
        description: 'Only show incomplete tasks',
      },
      status: {
        type: 'string',
        description: 'Filter by status character (e.g., "x" for done, " " for todo)',
      },
    },
  },
};

const ListTasksInputSchema = z.object({
  file: z.string().optional(),
  path: z.string().optional(),
  daily: z.boolean().optional(),
  todo_only: z.boolean().optional(),
  status: z.string().optional(),
});

async function extractTasks(
  filePath: string,
  vaultPath: string,
  statusFilter: string | undefined,
  todoOnly: boolean | undefined,
): Promise<{ relPath: string; tasks: { status: string; text: string; line: number }[] }> {
  const content = await readFile(filePath, 'utf-8');
  const relPath = toRelPath(vaultPath, filePath);
  const lines = content.split('\n');
  const tasks: { status: string; text: string; line: number }[] = [];

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].trim().match(TASK_RE);
    if (!match) continue;

    const [, statusChar, text] = match;
    const trimmedText = text.trim();

    if (!trimmedText) continue;
    if (statusFilter !== undefined && statusChar !== statusFilter) continue;
    if (todoOnly && statusChar === 'x') continue;

    tasks.push({
      status: statusChar,
      text: trimmedText.length > 120 ? trimmedText.slice(0, 120) + '…' : trimmedText,
      line: i + 1,
    });
  }

  return { relPath, tasks };
}

export async function executeListTasks(args: unknown) {
  const input = ListTasksInputSchema.parse(args);
  const vaultPath = getVaultPath();
  const grouped: Record<string, { status: string; text: string; line: number }[]> = {};

  if (input.daily) {
    const today = new Date().toISOString().slice(0, 10);
    const fp = await findNoteByName(vaultPath, today);
    if (fp) {
      const { relPath, tasks } = await extractTasks(fp, vaultPath, input.status, input.todo_only);
      if (tasks.length) grouped[relPath] = tasks;
    }
  } else if (input.file) {
    const fp = await findNoteByName(vaultPath, input.file);
    if (fp) {
      const { relPath, tasks } = await extractTasks(fp, vaultPath, input.status, input.todo_only);
      if (tasks.length) grouped[relPath] = tasks;
    }
  } else {
    const searchRoot = input.path ? join(vaultPath, input.path) : vaultPath;
    for await (const fp of walkVault(searchRoot)) {
      const { relPath, tasks } = await extractTasks(fp, vaultPath, input.status, input.todo_only);
      if (tasks.length) grouped[relPath] = tasks;
    }
  }

  return {
    content: [{ type: 'text', text: JSON.stringify(grouped, null, 2) }],
  };
}

// ─── complete_task ────────────────────────────────────────────────────────────

export const completeTaskTool = {
  name: 'complete_task',
  description: `Mark a task as done (- [ ] → - [x]) or reopen it (- [x] → - [ ]) in a vault note.
Matches the first task whose text contains the given string (case-insensitive).`,
  inputSchema: {
    type: 'object',
    properties: {
      task: {
        type: 'string',
        description: 'Task text to match (partial, case-insensitive).',
      },
      file: {
        type: 'string',
        description: 'Filename to search in (wikilink-style). Searches whole vault if omitted.',
      },
      path: {
        type: 'string',
        description: 'Path relative to vault root (alternative to file).',
      },
      done: {
        type: 'boolean',
        description: 'true = mark done (default), false = reopen.',
      },
    },
    required: ['task'],
  },
};

const CompleteTaskInputSchema = z.object({
  task: z.string(),
  file: z.string().optional(),
  path: z.string().optional(),
  done: z.boolean().optional(),
});

export async function executeCompleteTask(args: unknown) {
  const input = CompleteTaskInputSchema.parse(args);
  const vaultPath = getVaultPath();
  const markDone = input.done !== false; // default true
  const needle = input.task.toLowerCase();

  // Resolve file path
  let filePath: string | null = null;
  if (input.path) {
    filePath = join(vaultPath, input.path);
  } else if (input.file) {
    filePath = await findNoteByName(vaultPath, input.file);
    if (!filePath) return { content: [{ type: 'text', text: `File not found: ${input.file}` }], isError: true };
  }

  // Search for the task
  const searchIn: string[] = filePath ? [filePath] : [];
  if (!filePath) {
    for await (const fp of walkVault(vaultPath)) searchIn.push(fp);
  }

  for (const fp of searchIn) {
    const content = await readFile(fp, 'utf-8');
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const match = line.match(/^(\s*[-*]\s+)\[(.)\](\s+.*)$/);
      if (!match) continue;

      const [, prefix, statusChar, rest] = match;
      if (!rest.toLowerCase().includes(needle)) continue;

      // Already in the desired state?
      const isCurrentlyDone = statusChar === 'x';
      if (markDone === isCurrentlyDone) {
        const state = markDone ? 'done' : 'open';
        return { content: [{ type: 'text', text: `Already ${state}: "${rest.trim()}"` }] };
      }

      // Toggle
      const newStatus = markDone ? 'x' : ' ';
      lines[i] = `${prefix}[${newStatus}]${rest}`;
      const newContent = appendToContent(
        lines.join('\n'),
        '',
        markDone ? `Completed: ${rest.trim().slice(0, 60)}` : `Reopened: ${rest.trim().slice(0, 60)}`,
      );
      await writeFile(fp, newContent.trimEnd() + '\n', 'utf-8');

      const relPath = toRelPath(vaultPath, fp);
      const msg = markDone
        ? `Done: "${rest.trim()}"\n  in ${relPath}`
        : `Reopened: "${rest.trim()}"\n  in ${relPath}`;
      return { content: [{ type: 'text', text: msg }] };
    }
  }

  return {
    content: [{ type: 'text', text: `No matching task found for: "${input.task}"` }],
    isError: true,
  };
}

/**
 * Create Note Tool
 * Type-aware note creation with templates per note type.
 * Always creates in Inbox/ with the standard naming convention.
 */

import { writeFile, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { z } from 'zod';
import matter from 'gray-matter';
import { getVaultPath } from '../utils/vault.js';
import { today, currentTime } from '../utils/frontmatter.js';
import { NOTE_TYPES, buildInboxFilename, type NoteType } from '../config/note-types.js';
import { getConfig, renderTemplate } from '../utils/config.js';

export const createNoteTool = {
  name: 'create_note',
  description: `Create a new note in Inbox/ using a type-specific template.

Always use this (not write_note) when starting a new note from scratch. Each type generates the right structure automatically:

• devlog   — Timestamped session log. Use when starting work on a task/PR. Fields: topic, task, pr_url, context.
• learning — Structured insight note. Use when capturing something new. Fields: topic, source, context.
• spec     — Feature/design spec. Use when planning or documenting a feature. Fields: topic, feature, context.
• note     — Free-form note. Use for everything else. Fields: topic, context.
• meeting  — Daily meeting log. One file per day; append each meeting as a section.
• decision — Architecture Decision Record. Fields: topic, context.

Custom types defined in vault.config.yaml are also available — check vault_summary for the full list.

File is created at: Inbox/YYYY-MM-DD - Type - Topic.md

Follow any writing style preferences found in vault_summary → user_preferences.

WIKILINK RULE: Before using any [[wikilink]], call list_notes to verify the exact filename of the target note. Use the exact base filename without extension. Never guess a wikilink name — a wrong name creates a new empty file in Obsidian.`,
  inputSchema: {
    type: 'object',
    properties: {
      type: {
        type: 'string',
        enum: ['devlog', 'learning', 'spec', 'note'],
        description: 'Note type — determines template and metadata.',
      },
      topic: {
        type: 'string',
        description: 'Short descriptive name, e.g. "Content Streaming Animation". Used in filename and heading.',
      },
      context: {
        type: 'string',
        description: 'Opening context or summary to seed the template. Keep it concise.',
      },
      // devlog fields
      task: {
        type: 'string',
        description: '[devlog] Task or issue description, e.g. "Fix animation timing on scroll".',
      },
      pr_url: {
        type: 'string',
        description: '[devlog] PR or issue URL.',
      },
      // learning fields
      source: {
        type: 'string',
        description: '[learning] Where this was learned, e.g. "Conversation 2026-03-03", "MDN docs".',
      },
      // spec fields
      feature: {
        type: 'string',
        description: '[spec] Feature name this spec belongs to, e.g. "Web Comments".',
      },
    },
    required: ['type', 'topic'],
  },
};

const BUILTIN_TYPES = ['devlog', 'learning', 'spec', 'note', 'meeting', 'decision'] as const;

const CreateNoteInputSchema = z.object({
  type: z.string(),
  topic: z.string(),
  context: z.string().optional(),
  task: z.string().optional(),
  pr_url: z.string().optional(),
  source: z.string().optional(),
  feature: z.string().optional(),
});

export async function executeCreateNote(args: unknown) {
  const input = CreateNoteInputSchema.parse(args);
  const vaultPath = getVaultPath();
  const config = await getConfig();
  const d = today();
  const time = currentTime();

  // Resolve template: config override → built-in → custom type
  let body: string;
  let typeLabel: string;

  if (config.templates[input.type]) {
    // User-provided template override
    body = renderTemplate(config.templates[input.type], {
      topic: input.topic, date: d, time,
      context: input.context, task: input.task,
      pr_url: input.pr_url, source: input.source, feature: input.feature,
    });
    typeLabel = input.type.charAt(0).toUpperCase() + input.type.slice(1);
  } else if (BUILTIN_TYPES.includes(input.type as typeof BUILTIN_TYPES[number])) {
    // Built-in type
    const typeConfig = NOTE_TYPES[input.type as NoteType];
    typeLabel = typeConfig.label;
    body = typeConfig.template({
      topic: input.topic, date: d, time,
      context: input.context, task: input.task,
      pr_url: input.pr_url, source: input.source, feature: input.feature,
    });
  } else {
    // Custom type from vault.config.yaml
    const customType = config.custom_types.find(t => t.name === input.type);
    if (!customType) throw new Error(`Unknown note type: "${input.type}". Built-in types: ${BUILTIN_TYPES.join(', ')}. Custom types: ${config.custom_types.map(t => t.name).join(', ') || 'none'}`);
    typeLabel = customType.label;
    body = renderTemplate(customType.template, {
      topic: input.topic, date: d, time, context: input.context,
    });
  }

  const safeTopic = input.topic.replace(/[/\\:*?"<>|]/g, '-').trim();
  const filename = `${d} - ${typeLabel} - ${safeTopic}.md`;
  const relPath = `${config.inbox_folder}/${filename}`;
  const filePath = join(vaultPath, relPath);

  const frontmatterData: Record<string, unknown> = {
    type: input.type,
    topic: input.topic,
    status: 'draft',
    created: d,
    updated: d,
    changes: [`${d}: Created`],
  };
  if (input.type === 'devlog') {
    if (input.task) frontmatterData.task = input.task;
    if (input.pr_url) frontmatterData.pr_url = input.pr_url;
  } else if (input.type === 'learning') {
    if (input.source) frontmatterData.source = input.source;
  } else if (input.type === 'spec') {
    if (input.feature) frontmatterData.feature = input.feature;
  }

  const fileContent = matter.stringify('\n' + body, frontmatterData);
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, fileContent, 'utf-8');

  return {
    content: [{ type: 'text', text: `Created: ${relPath}` }],
  };
}

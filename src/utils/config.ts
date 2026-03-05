/**
 * Vault config loader
 * Reads vault.config.yaml from the vault root.
 * Falls back to defaults silently if the file doesn't exist.
 *
 * Fixed (not overridable):
 *   - Inbox-first for new notes
 *   - Append-only for permanent notes
 *   - Frontmatter injection
 *
 * Overridable via vault.config.yaml:
 *   - inbox_folder, notes_folder
 *   - stale_days (vault_review threshold)
 *   - promote_delete_source
 *   - templates (per note type)
 *   - custom_types (additional note types)
 *
 * User preferences (Layer 2):
 *   Place a CLAUDE.md file in the vault root. Claude Code loads it automatically
 *   at session start — no tool call needed. vault_summary surfaces it too.
 */

import { readFile } from 'fs/promises';
import { join } from 'path';
import yaml from 'js-yaml';
import { getVaultPath } from './vault.js';

export interface CustomNoteType {
  name: string;
  label: string;
  /** Template string with {{topic}}, {{date}}, {{time}}, {{context}} placeholders */
  template: string;
}

export interface VaultConfig {
  /** Folder for new AI-generated notes. Default: 'Inbox' */
  inbox_folder: string;
  /** Folder for promoted permanent notes. Default: 'Notes' */
  notes_folder: string;
  /** Days before an Inbox draft is flagged as stale in vault_review. Default: 3 */
  stale_days: number;
  /** Delete Inbox draft after promote_note. Default: true */
  promote_delete_source: boolean;
  /** File in inbox_folder that gets prepend (position:top) behavior. Default: 'Capture.md' */
  capture_file: string;
  /** Filenames in inbox_folder exempt from stale draft detection. Default: ['Capture.md', 'README.md'] */
  stale_exempt: string[];
  /** Override built-in note type templates. Key = type name, value = template string */
  templates: Record<string, string>;
  /** Additional note types beyond the built-in set */
  custom_types: CustomNoteType[];
}

const DEFAULTS: VaultConfig = {
  inbox_folder: 'Inbox',
  notes_folder: 'Notes',
  stale_days: 3,
  promote_delete_source: true,
  capture_file: 'Capture.md',
  stale_exempt: ['Capture.md', 'README.md'],
  templates: {},
  custom_types: [],
};

let _config: VaultConfig | null = null;

export async function getConfig(): Promise<VaultConfig> {
  if (_config) return _config;

  try {
    const vaultPath = getVaultPath();
    const raw = await readFile(join(vaultPath, 'vault.config.yaml'), 'utf-8');
    const parsed = yaml.load(raw) as Partial<VaultConfig>;
    _config = {
      ...DEFAULTS,
      ...parsed,
      stale_exempt: parsed?.stale_exempt ?? DEFAULTS.stale_exempt,
      templates: { ...DEFAULTS.templates, ...(parsed?.templates ?? {}) },
      custom_types: parsed?.custom_types ?? DEFAULTS.custom_types,
    };
  } catch {
    _config = { ...DEFAULTS };
  }

  return _config;
}

/** Simple {{key}} template renderer */
export function renderTemplate(template: string, params: Record<string, string | undefined>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => params[key] ?? '');
}

/** Read CLAUDE.md from vault root (user preferences layer) and return its content, or null */
export async function getVaultPreferences(): Promise<string | null> {
  try {
    const vaultPath = getVaultPath();
    return await readFile(join(vaultPath, 'CLAUDE.md'), 'utf-8');
  } catch {
    return null;
  }
}

/**
 * Vault utilities
 * Direct filesystem access to Obsidian vault files
 */

import { readdir } from 'fs/promises';
import { join, extname, basename } from 'path';

export function getVaultPath(): string {
  const vaultPath = process.env.OBSIDIAN_VAULT;
  if (!vaultPath) throw new Error('OBSIDIAN_VAULT environment variable not set');
  return vaultPath;
}

export async function* walkVault(dir: string): AsyncGenerator<string> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return; // Skip unreadable directories
  }
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue; // skip .obsidian, .git, etc.
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walkVault(full);
    } else if (entry.isFile() && extname(entry.name) === '.md') {
      yield full;
    }
  }
}

/** Convert absolute file path to vault-relative path with forward slashes. */
export function toRelPath(vaultPath: string, filePath: string): string {
  return filePath.slice(vaultPath.length + 1).replace(/\\/g, '/');
}

/** Find a note by bare filename anywhere in the vault. Returns absolute path or null. */
export async function findNoteByName(vaultPath: string, filename: string): Promise<string | null> {
  const target = filename.endsWith('.md') ? filename : filename + '.md';
  for await (const fp of walkVault(vaultPath)) {
    if (basename(fp) === target) return fp;
  }
  return null;
}

/** Matches any task line regardless of status. Groups: 1=status char, 2=text */
export const TASK_RE = /^[-*]\s+\[(.)\]\s+(.*)$/;

/** Matches open/unchecked task lines only. Group 1 = task text. */
export const OPEN_TASK_RE = /^[-*]\s+\[ \]\s+(.+)$/m;

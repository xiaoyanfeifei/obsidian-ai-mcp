/**
 * Note type definitions — templates, metadata fields, and conventions per type.
 * This is the source of truth for vault note structure.
 */

export type NoteType = 'devlog' | 'learning' | 'spec' | 'note' | 'meeting' | 'decision';

export interface NoteTypeConfig {
  /** Human label */
  label: string;
  /** Default subfolder inside Inbox/ */
  folder: string;
  /** Extra frontmatter fields beyond the standard set */
  extraFields: Record<string, string | null>;
  /** Generates the markdown body skeleton given params */
  template: (params: TemplateParams) => string;
}

export interface TemplateParams {
  topic: string;
  date: string;    // YYYY-MM-DD
  time: string;    // HH:MM
  context?: string;
  // devlog
  task?: string;
  pr_url?: string;
  // learning
  source?: string;
  // spec
  feature?: string;
  // meeting
  attendees?: string;
  meeting_type?: string;
  // decision
  decision_status?: string;
}

export const NOTE_TYPES: Record<NoteType, NoteTypeConfig> = {

  devlog: {
    label: 'Devlog',
    folder: 'Inbox',
    extraFields: { task: null, pr_url: null },
    template: ({ topic, date, time, context, task, pr_url }) => `# Devlog: ${topic}

**Date:** ${date}
${task ? `**Task:** ${task}\n` : ''}${pr_url ? `**PR:** ${pr_url}\n` : ''}
## Context
${context || '<!-- Brief description of what you are working on -->'}

---

### ${time} — Starting point
<!-- What state things are in when you begin -->

`,
  },

  learning: {
    label: 'Learning',
    folder: 'Inbox',
    extraFields: { source: null },
    template: ({ topic, context, source }) => `# ${topic}
${source ? `\n*Source: ${source}*\n` : ''}
${context || ''}

## Related notes
`,
  },

  spec: {
    label: 'Spec',
    folder: 'Inbox',
    extraFields: { feature: null },
    template: ({ topic, context, feature }) => `# ${feature ? `${feature}: ` : ''}${topic}

## Overview
${context || '<!-- What this is and what problem it solves -->'}

## Goals
-

## Non-goals
-

## Design / Approach
<!-- How it works -->

## Open questions
- [ ]

## Decisions
| Decision | Chosen | Rationale |
|----------|--------|-----------|
|          |        |           |
`,
  },

  note: {
    label: 'Note',
    folder: 'Inbox',
    extraFields: {},
    template: ({ topic, context }) => `# ${topic}

> **Source:** <!-- where did this come from? Teams / docs / conversation / repo — and how confident? -->

${context || ''}

## Open questions
<!-- gaps and unknowns as - [ ] items -->

## Next steps
<!-- what to do when coming back to this -->

## Related notes
`,
  },

  meeting: {
    label: 'Meeting',
    folder: 'Inbox',
    extraFields: {},
    template: ({ date, time, context }) => `# Meetings — ${date}
${context || ''}

## ${time} — <!-- Title -->
**With:** <!-- names -->
**Project:** <!-- [[project]] -->

<!-- Notes -->

**Actions:**
- [ ] <!-- task  @owner -->

---
`,
  },

  decision: {
    label: 'Decision',
    folder: 'Inbox',
    extraFields: { decision_status: 'proposed' },
    template: ({ topic, context, decision_status }) => `# Decision: ${topic}

**Status:** ${decision_status || 'proposed'}  <!-- proposed | accepted | deprecated | superseded -->

## Context
${context || '<!-- What situation or problem led to this decision? -->'}

## Decision
<!-- What was decided, in 1–2 sentences -->

## Consequences
### Positive
-

### Negative / trade-offs
-

## Alternatives considered
| Option | Why rejected |
|--------|-------------|
|        |             |

## Related notes
`,
  },

};

/** Build the Inbox filename for a new note */
export function buildInboxFilename(date: string, type: NoteType, topic: string): string {
  const label = NOTE_TYPES[type].label;
  // Sanitise topic for use in filename
  const safeTopic = topic.replace(/[/\\:*?"<>|]/g, '-').trim();
  return `${date} - ${label} - ${safeTopic}.md`;
}

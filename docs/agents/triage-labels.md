# Triage Labels

The skills speak in terms of five canonical triage roles. This file maps those roles to the actual strings used in this repo's issue tracker.

This repo uses a **local markdown tracker** (`.scratch/<feature>/issues/NN-slug.md`), so a "label" is the value of the `Status:` line near the top of the issue file — not a tracker label object. Write it exactly as spelled in the right-hand column.

| Label in mattpocock/skills | `Status:` value in our tracker | Meaning                                  |
| -------------------------- | ------------------------------ | ---------------------------------------- |
| `needs-triage`             | `needs-triage`                 | Needs to be evaluated                    |
| `needs-info`               | `needs-info`                   | Waiting on more information              |
| `ready-for-agent`          | `ready-for-agent`              | Fully specified, ready for an AFK agent  |
| `ready-for-human`          | `ready-for-human`              | Requires human implementation            |
| `wontfix`                  | `wontfix`                      | Will not be actioned                     |

Example header:

```markdown
# 03 — Distribuição de lead por roleta

Status: ready-for-agent
Blocked by: 01, 02
```

When a skill mentions a role (e.g. "apply the AFK-ready triage label"), set `Status:` to the corresponding value from this table.

Edit the right-hand column to match whatever vocabulary you actually use.

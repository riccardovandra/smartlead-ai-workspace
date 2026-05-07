# Smartlead Outbound Demo

A minimal, reproducible Claude Code workspace that runs cold-email outbound end-to-end on top of the public **Smartlead CLI**. Intended as a teaching artifact for the Smartlead Channel: a viewer can clone this, install the CLI, and have a working agency outbound system on day one.

## Mental model

Four skills, four phases, one folder per campaign.

| Skill | Role |
| --- | --- |
| `install-smartlead` | One-time setup. Installs the CLI and walks the user through saving their API key. |
| `outbound-system` | Orchestrator. Walks the 4 phases, points at the other skills, owns the campaign folder convention. |
| `find-leads` | Queries Smartlead Smart Prospects via the CLI, writes `leads.csv` into the campaign folder. |
| `create-campaign` | Creates the Smartlead campaign, saves the sequence, uploads leads, starts sending. |

Phases: **strategy → leads → copy → deploy**. Each writes one file into the campaign folder.

## Folder convention

```
workspace/clients/{client}/campaigns/{campaign-slug}/
├── campaign-strategy.md   # who, why, what we're betting on
├── leads.csv              # output of find-leads
├── copy.md                # the email sequence
├── campaign-status.md     # campaign id, lead count, start date, live state
└── campaign-analysis.md   # post-run learnings (filled after results)
```

One client = one folder under `workspace/clients/`. One campaign = one folder under that client's `campaigns/`. Slug is short kebab-case and unique per client (e.g. `saas-founders-2026-q2`).

## Prerequisites

- Node 18+ (for the Smartlead CLI)
- Smartlead CLI installed and an API key configured

**First-time setup:** in Claude Code, say **"install smartlead"** — the `install-smartlead` skill installs the CLI, creates `.env` from `.env.example`, and walks you through pasting in your API key.

Verify: `smartlead campaigns list` should return your existing campaigns or an empty list.

## How to run a campaign

In Claude Code, just say: **"start a new outbound campaign for {client}"**. The `outbound-system` skill takes it from there.

# Smartlead Outbound Demo

A minimal, reproducible Claude Code workspace that runs cold-email outbound end-to-end on top of the public **Smartlead CLI**. Intended as a teaching artifact for the Smartlead Channel: a viewer can clone this, install the CLI, and have a working agency outbound system on day one.

## Mental model

Five skills, four phases, one folder per campaign.

| Skill | Role |
| --- | --- |
| `install-smartlead` | One-time setup. Installs the public Smartlead CLI globally and walks the user through saving their API key. |
| `outbound-system` | Orchestrator. Walks the 4 phases, points at the other skills, owns the campaign folder convention. |
| `find-leads` | Queries the chosen lead provider (Smartlead Smart Prospects **or** Prospeo) and writes `leads.csv` into the campaign folder. |
| `prospeo` | Operational skill for the Prospeo B2B contact API. Owns the in-repo Prospeo CLI (`.claude/skills/prospeo/scripts/prospeo.mjs`, zero-dep Node 18+) — covers first-time setup at the top and ongoing usage (search, enrich, account, find-leads pipeline) below. |
| `create-campaign` | Creates the Smartlead campaign, saves the sequence, uploads leads, starts sending. |

Phases: **strategy → leads → copy → deploy**. Each writes one file into the campaign folder.

### Lead-provider choice (Phase 2)

`find-leads` defaults to **Smartlead Smart Prospects** (bundled with the Smartlead plan, returns verified emails directly). It switches to **Prospeo** when the ICP requires filters Smart Prospects doesn't expose — funding stage, technology stack, hiring velocity, NAICS/SIC, headcount growth — or when the user asks for it. The output `leads.csv` shape is identical across providers, so `create-campaign` doesn't care which one was used.

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

**First-time setup (Smartlead — required):** in Claude Code, say **"install smartlead"** — the `install-smartlead` skill installs the CLI, creates `.env` from `.env.example`, and walks you through pasting in your API key.

Verify: `smartlead campaigns list` should return your existing campaigns or an empty list.

**Optional setup (Prospeo — only if you want Prospeo as a lead source or for one-off contact lookups):** say **"set up prospeo"**. The `prospeo` skill verifies Node 18+, exposes the in-repo Prospeo CLI, and saves the Prospeo API key into the same `.env`. Verify with `node .claude/skills/prospeo/scripts/prospeo.mjs account` (the `/account-information` endpoint is free).

## How to run a campaign

In Claude Code, just say: **"start a new outbound campaign for {client}"**. The `outbound-system` skill takes it from there.

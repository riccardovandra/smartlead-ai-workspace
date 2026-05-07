---
name: outbound-system
description: Orchestrator for cold-email outbound campaigns built on the public Smartlead CLI. Walks 4 phases (strategy, leads, copy, deploy) and points at the find-leads and create-campaign skills. Use when starting a new outbound campaign, when the user says "run a campaign", "new campaign", "outbound campaign", or asks to take a campaign from idea to live.
---

# Outbound System

End-to-end recipe for shipping one cold-email campaign. The orchestrator owns the **folder convention** and the **phase order**. The other two skills do the work.

## The four phases

| # | Phase | Output file | Skill / mode |
| --- | --- | --- | --- |
| 1 | STRATEGY | `campaign-strategy.md` | guided write (this skill) |
| 2 | LEADS | `leads.csv` | `find-leads` skill |
| 3 | COPY | `copy.md` | guided write (this skill) |
| 4 | DEPLOY | `campaign-status.md` | `create-campaign` skill |

Run them in order. Each phase reads from the prior outputs.

A 5th file, `campaign-analysis.md`, gets filled after the campaign has results (3-7 days post launch). Not part of the launch flow.

## Folder convention

```
workspace/clients/{client}/campaigns/{slug}/
├── campaign-strategy.md
├── leads.csv
├── copy.md
├── campaign-status.md
└── campaign-analysis.md
```

- `{client}` is kebab-case, one folder per real client (or `internal` for own outbound).
- `{slug}` is short, dated, and descriptive. Pattern: `{audience}-{YYYY}-{quarter-or-month}-{letter}`. Example: `saas-founders-2026-q2-a`.

## Step 0: Identify the campaign

Ask the user:

1. **Client** — kebab-case folder name (or `internal`)
2. **Campaign slug** — kebab-case, follows the pattern above
3. **One-line goal** — what does success look like?

Create the folder:

```bash
mkdir -p "workspace/clients/{client}/campaigns/{slug}"
```

Then walk the phases.

---

## Phase 1: STRATEGY

Goal: a filled `campaign-strategy.md` so the rest of the campaign has a single source of truth on **who, why, and what we're betting on**.

Use the template at [assets/campaign-strategy.template.md](assets/campaign-strategy.template.md). Walk the user through each section, one at a time. Don't generate placeholder values — if the user can't answer, flag it as an open question.

**The minimum bar to leave Phase 1:** ICP is concrete enough that someone else could find 100 matching companies, the bet is one falsifiable sentence, and the offer has a single clear CTA.

Write to `workspace/clients/{client}/campaigns/{slug}/campaign-strategy.md`.

---

## Phase 2: LEADS

Goal: a verified `leads.csv` with at least 200 rows in the campaign folder.

Hand off to the `find-leads` skill, passing:

- the campaign folder path
- the ICP block from `campaign-strategy.md` (job titles, company size, industry, location)

The skill queries Smartlead Smart Prospects via `smartlead prospect search`, writes the CSV directly into the campaign folder.

Verify before moving on:

```bash
wc -l "workspace/clients/{client}/campaigns/{slug}/leads.csv"
head -3 "workspace/clients/{client}/campaigns/{slug}/leads.csv"
```

The CSV must contain at minimum: `email`, `first_name`, `last_name`, `company_name`. Custom fields are fine.

---

## Phase 3: COPY

Goal: a filled `copy.md` with a 2-4 step email sequence in the format the Smartlead CLI expects.

Use the template at [assets/copy.template.md](assets/copy.template.md). Hard rules:

- Every `{{token}}` used in the body must exist as a column in `leads.csv`. The defaults are `{{first_name}}`, `{{last_name}}`, `{{company_name}}`.
- Subjects on follow-ups can be empty (auto-threads in Smartlead).
- Keep email 1 under 90 words. Hook → relevance → ask. No pitch dump.

Don't write copy without reading `campaign-strategy.md` first. The angle, pain, and proof from the strategy doc are the inputs to the email body. If they're missing or vague, go back to Phase 1 instead of inventing them.

Write to `workspace/clients/{client}/campaigns/{slug}/copy.md`.

---

## Phase 4: DEPLOY

Goal: campaign live in Smartlead with the sequence saved, leads uploaded, and sending started. `campaign-status.md` records the result.

Hand off to the `create-campaign` skill, passing the campaign folder path. It will:

1. `smartlead campaigns create --name "{slug}"` and capture the ID
2. Convert `copy.md` into the JSON shape Smartlead expects, then `smartlead campaigns save-sequence`
3. Convert `leads.csv` to the JSON shape and `smartlead leads add`
4. `smartlead campaigns set-status --status START`
5. Write `campaign-status.md` with the campaign ID, lead count, mailbox count, and start date

**Do not skip the verification step.** After deploy, run `smartlead campaigns list` and confirm the new campaign appears with `ACTIVE` status.

---

## After the campaign runs

After 3-7 days of sending, fill `campaign-analysis.md` using the template at [assets/campaign-analysis.template.md](assets/campaign-analysis.template.md). Pull stats with:

```bash
smartlead stats campaign --id {campaign-id}
```

Three things to capture: what happened (numbers), why it happened (your read), what changes next time (one specific decision).

---

## Scope philosophy

This system is intentionally minimal. No leads database, no waterfall enrichment, no LLM personalization. One CLI, one folder per campaign, four phases.

If a phase keeps blocking real campaigns, capture the friction in `workspace/_system-notes.md` and consider adding automation in a follow-up. Do not build the automation mid-campaign.

---
name: create-campaign
description: Deploy a cold-email campaign to Smartlead end-to-end through the public Smartlead CLI. Reads copy.md and leads.csv from a campaign folder, creates the Smartlead campaign, saves the sequence, attaches mailboxes, uploads leads, and starts sending. Writes campaign-status.md with the launch record. Use when the user mentions deploying a campaign, going live, launching a campaign, uploading leads to Smartlead, or when the outbound-system skill hands off Phase 4.
---

# Create Campaign

Phase 4 of the outbound system. Takes a campaign folder that already has `copy.md` and `leads.csv`, and ships it to Smartlead.

## What it uses

The public Smartlead CLI's campaign and lead commands:

- `smartlead campaigns create --name "..."`
- `smartlead campaigns save-sequence --id ID --from-json sequences.json`
- `smartlead mailboxes list` and `smartlead mailboxes add-to-campaign`
- `smartlead leads add --campaign-id ID --from-json leads.json`
- `smartlead campaigns set-status --id ID --status START`
- `smartlead campaigns list` (verification)

## Inputs

Required, passed in by the orchestrator (or asked from the user if invoked directly):

1. **Campaign folder path** — `workspace/clients/{client}/campaigns/{slug}/`
2. **Region** — for the schedule timezone (`US`, `EU`, or `IT` — defaults to `US`)

The folder must already contain `copy.md` and `leads.csv`. If either is missing, stop and route the user back to the right earlier phase.

## Pre-flight checks

```bash
cd "workspace/clients/{client}/campaigns/{slug}"

# Required files exist and are non-empty
[ -s copy.md ]    || { echo "missing copy.md"; exit 1; }
[ -s leads.csv ]  || { echo "missing leads.csv"; exit 1; }

# Mailboxes available
smartlead mailboxes list --warmup-status ACTIVE --format json | jq 'length'
```

If no warm mailboxes exist, stop and tell the user. Don't create a campaign that has nothing to send from.

## Workflow

### Step 1 — Create the campaign shell

```bash
SLUG="{slug}"
CAMPAIGN_ID=$(smartlead campaigns create --name "$SLUG" --format json | jq -r '.id')
echo "campaign id: $CAMPAIGN_ID"
```

### Step 2 — Convert copy.md → sequences.json and save

The CLI takes JSON, but we wrote markdown for human readability. Convert in place:

```json
{
  "sequences": [
    {
      "seq_number": 1,
      "seq_delay_details": { "delay_in_days": 0 },
      "variant_distribution_type": "MANUAL_EQUAL",
      "seq_variants": [
        {
          "subject": "quick note about {{company_name}}",
          "email_body": "<p>Hi {{first_name}},</p><p>...</p>",
          "variant_label": "A"
        }
      ]
    },
    {
      "seq_number": 2,
      "seq_delay_details": { "delay_in_days": 3 },
      "subject": "",
      "email_body": "<p>Hi {{first_name}},</p><p>bumping this...</p>"
    }
  ]
}
```

Rules for the conversion:

- One block per step in `copy.md`.
- `delay_in_days` follows the schedule table in `copy.md` (Day 0, Day 3, Day 7 → delays 0, 3, 4 *cumulative is wrong; use day-over-prior-step*). Smartlead expects day-over-prior-step, so step 1=0, step 2=3, step 3=4.
- Wrap each line of the body in `<p>...</p>`. Smartlead renders HTML.
- Empty subject on follow-up steps auto-threads.
- Keep `{{first_name}}`, `{{last_name}}`, `{{company_name}}` tokens as-is.

Save and push:

```bash
# After writing sequences.json into the campaign folder:
smartlead campaigns save-sequence \
  --id "$CAMPAIGN_ID" \
  --from-json sequences.json
```

### Step 3 — Attach warm mailboxes

```bash
# All mailboxes with warmup active. Adjust if you want a subset.
MAILBOX_IDS=$(smartlead mailboxes list --warmup-status ACTIVE --format json | jq -r '.[].id' | tr '\n' ' ')

smartlead mailboxes add-to-campaign \
  --campaign-id "$CAMPAIGN_ID" \
  --account-ids $MAILBOX_IDS
```

### Step 4 — Convert leads.csv → leads.json and upload

The CLI's `leads add` takes JSON. Convert with `jq` or a one-liner. Expected shape per lead:

```json
{
  "email": "jane@acme.com",
  "first_name": "Jane",
  "last_name": "Doe",
  "company_name": "Acme",
  "custom_fields": {
    "job_title": "VP Marketing"
  }
}
```

One-liner using `jq` (assumes CSV has an `email,first_name,last_name,company_name` header at minimum):

```bash
python3 -c "
import csv, json, sys
rows = list(csv.DictReader(open('leads.csv')))
out = []
for r in rows:
    if not r.get('email'): continue
    standard = {'email','first_name','last_name','company_name','phone_number','website','linkedin_profile','company_url','location'}
    custom = {k:v for k,v in r.items() if k not in standard and v}
    lead = {k:r[k] for k in standard if r.get(k)}
    if custom: lead['custom_fields'] = custom
    out.append(lead)
json.dump(out, open('leads.json','w'), indent=2)
print(f'wrote {len(out)} leads')
"

smartlead leads add \
  --campaign-id "$CAMPAIGN_ID" \
  --from-json leads.json
```

### Step 5 — Configure schedule and start

The public CLI may not yet expose schedule configuration as a single command. The most reliable path is to set the schedule once in the Smartlead UI on the campaign and reuse the saved settings, or to use the `campaigns create --from-json` form with an embedded schedule block.

For a demo, the simplest sequence is:

```bash
# Open the campaign in the Smartlead UI to confirm schedule, daily volume, etc.
echo "https://app.smartlead.ai/app/campaigns/$CAMPAIGN_ID"

# Once the schedule looks right:
smartlead campaigns set-status --id "$CAMPAIGN_ID" --status START
```

### Step 6 — Verify and record

```bash
smartlead campaigns list | grep "$SLUG"
smartlead stats campaign --id "$CAMPAIGN_ID"
```

Then write `campaign-status.md`:

```markdown
# Campaign status — {slug}

- **Smartlead campaign ID:** {CAMPAIGN_ID}
- **Created:** {YYYY-MM-DD}
- **Started:** {YYYY-MM-DD}
- **Region:** {US/EU/IT}
- **Mailboxes attached:** {N}
- **Leads uploaded:** {N}
- **State:** ACTIVE

## Notes

{Anything weird that happened during deploy: CSV cleaning, mailbox warmup gaps, schedule overrides.}
```

### Step 7 — Tidy

Trash the intermediate JSONs (regenerable from the canonical `copy.md` and `leads.csv`):

```bash
trash sequences.json leads.json
```

## Common pitfalls

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| `save-sequence` rejects body | HTML not wrapped in `<p>` tags | Re-render markdown to HTML before building sequences.json |
| Lead upload reports rows skipped | Missing email or token mismatch | Check `leads.csv` for blanks; ensure tokens used in copy exist as columns |
| Campaign starts but nothing sends | No mailboxes attached, or all mailboxes still warming | `mailboxes list --warmup-status ACTIVE` and re-attach |
| Bounce rate spikes day 1 | Skipped verification on `find-leads` | Pause campaign, re-run with `verified_emails_only: true` |

## What this skill does NOT do

- Generate copy. Copy is a Phase 3 artifact written by a human (or `outbound-system` with the user). Garbage copy will pass deploy and tank in the inbox.
- Source leads. That's `find-leads`.
- A/B variants. The sequence JSON above is single-variant for demo simplicity. Smartlead supports multi-variant — extend `seq_variants` if you need it.
- Personalize per-lead. Tokens are static; everyone gets the same copy with their merge fields swapped in.

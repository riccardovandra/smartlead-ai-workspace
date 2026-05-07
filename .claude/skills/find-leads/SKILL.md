---
name: find-leads
description: Source verified B2B leads for a cold-email campaign by querying Smartlead Smart Prospects through the public Smartlead CLI. Reads ICP filters from the campaign's strategy doc, builds a search payload, runs the search, writes leads.csv directly into the campaign folder. Use when the user mentions finding leads, sourcing prospects, building a lead list, Smart Prospects, prospecting, or when the outbound-system skill hands off Phase 2.
---

# Find Leads

Phase 2 of the outbound system. Turns an ICP block into a `leads.csv` ready for upload.

## What it uses

The public Smartlead CLI's prospect commands:

- `smartlead prospect search --from-json search.json` — main filter-based search
- `smartlead prospect companies --query "Acme"` — discover company IDs by name
- `smartlead prospect job-titles --query "VP"` — discover canonical title IDs
- `smartlead prospect find-emails --from-json contacts.json` — find emails for known names

Smart Prospects is Smartlead's built-in B2B contact database. Returned rows already include verified emails, so no separate enrichment step is needed for the demo.

## Inputs

Required, passed in by the orchestrator (or asked from the user if invoked directly):

1. **Campaign folder path** — `workspace/clients/{client}/campaigns/{slug}/`
2. **ICP filters** — pulled from `campaign-strategy.md`:
   - Job titles (e.g. "VP Marketing", "Head of Growth")
   - Company size (employee bands)
   - Industry
   - Geography (countries)
3. **Volume target** — how many leads to fetch

## Workflow

### Step 1 — Read the strategy

```bash
cat "workspace/clients/{client}/campaigns/{slug}/campaign-strategy.md"
```

Extract the ICP block. If anything is vague ("decision-makers", "tech companies"), stop and push back to the orchestrator. Garbage in, garbage out.

### Step 2 — Build the search payload

Write `search.json` inside the campaign folder. Schema:

```json
{
  "filters": {
    "job_titles": ["VP Marketing", "Head of Growth", "CMO"],
    "company_size": ["51-200", "201-500"],
    "industries": ["Software", "SaaS"],
    "countries": ["United States", "Canada"]
  },
  "page": 1,
  "per_page": 100,
  "verified_emails_only": true
}
```

Notes:

- The CLI accepts the filter shape Smart Prospects exposes. Run `smartlead prospect search --help` once to confirm field names if anything looks off — Smartlead may add filters over time.
- Use canonical job titles. If unsure, run `smartlead prospect job-titles --query "VP"` and grab the suggested options.
- For very specific company targets, use `smartlead prospect companies --query "..."` to get company IDs and add a `company_ids` filter.

### Step 3 — Run the search and write CSV

```bash
cd "workspace/clients/{client}/campaigns/{slug}"

smartlead prospect search \
  --from-json search.json \
  --format csv \
  > leads.csv
```

If the volume target exceeds one page, paginate by re-running with `"page": 2, 3, ...` and concatenating (skip the header on subsequent pages):

```bash
smartlead prospect search --from-json search-p1.json --format csv > leads.csv
smartlead prospect search --from-json search-p2.json --format csv | tail -n +2 >> leads.csv
```

### Step 4 — Verify

```bash
wc -l leads.csv             # row count incl. header
head -3 leads.csv           # check columns
awk -F',' 'NR>1 && $1!=""' leads.csv | wc -l   # rows with non-empty email
```

The CSV must have these columns at minimum: `email`, `first_name`, `last_name`, `company_name`. If a column the copy needs (e.g. `job_title`) isn't present, re-run with the right output fields or accept that the token won't be available in `copy.md`.

### Step 5 — Clean up

Remove `search.json` if you don't want it in git history:

```bash
trash search.json
```

Keep `leads.csv` in the campaign folder. Do not commit it to a public repo if it contains real contact data.

## Output

A `leads.csv` in the campaign folder, ready for the `create-campaign` skill to upload.

## Common pitfalls

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Search returns 0 rows | Filters too narrow or job title isn't canonical | Run `smartlead prospect job-titles --query "..."` to confirm |
| Emails empty for half the rows | `verified_emails_only` not set | Add `"verified_emails_only": true` to search.json |
| CSV has no `first_name` | Smartlead returned `name` instead | Split with awk before upload, or rely on the CLI's field-mapping flag |
| 401 / auth error | API key not set | `smartlead config set api_key sl-...` or `export SMARTLEAD_API_KEY=sl-...` |

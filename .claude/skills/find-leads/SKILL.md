---
name: find-leads
description: Source verified B2B leads for a cold-email campaign. Supports two providers — (a) Smartlead Smart Prospects via the public Smartlead CLI and (b) Prospeo via the in-repo Prospeo CLI (scripts/prospeo.mjs). Reads ICP filters from the campaign's strategy doc, picks or accepts a provider, runs the search (and enrichment if the provider needs it), and writes leads.csv directly into the campaign folder. Use when the user mentions finding leads, sourcing prospects, building a lead list, Smart Prospects, Prospeo, prospecting, or when the outbound-system skill hands off Phase 2.
---

# Find Leads

Phase 2 of the outbound system. Turns an ICP block into a `leads.csv` ready for upload.

This skill supports two providers. The **output is identical** regardless of provider — the campaign folder always ends up with one `leads.csv` whose columns conform to the [Output schema](#output-schema) below, so the `create-campaign` skill consumes either source the same way.

## Providers

| Provider | CLI | Auth | What it gives you | Cost model |
| --- | --- | --- | --- | --- |
| **Smart Prospects** (default) | `smartlead prospect ...` (public Smartlead CLI) | `SMARTLEAD_API_KEY` | Verified-email rows in one search call, simple filter shape | Bundled with your Smartlead plan |
| **Prospeo** | `node .claude/skills/prospeo/scripts/prospeo.mjs ...` | `PROSPEO_API_KEY` | 200M+ contacts, 30+ filters incl. funding stage, technology stack, headcount growth, NAICS/SIC | Per-credit: 1 credit/search-page (25 rows) + 1 credit/verified-email enrichment hit |

## When to use which

Default to **Smart Prospects**. Switch to **Prospeo** when any of the following are true:

- The ICP requires filters Smart Prospects doesn't expose (funding stage, last-funding-date, technology stack, hiring-velocity, NAICS/SIC, headcount-growth-by-department).
- The user explicitly asks for Prospeo.
- A previous Smart Prospects pass returned `< 100` rows for an ICP you have reason to believe is broader than that.
- The user is trying to teach the workflow with Prospeo specifically.

If neither side has a clear edge, ask the user. Don't pick silently.

---

## Inputs (from the orchestrator or asked directly)

1. **Campaign folder path** — `workspace/clients/{client}/campaigns/{slug}/`
2. **ICP filters** — pulled from `campaign-strategy.md` (job titles, seniority, company size, industry, geography, plus any provider-specific extras like funding stage)
3. **Volume target** — how many leads to fetch (default 200)
4. **Provider** — `smartlead` or `prospeo`. If absent, follow the rule above.

## Step 0 — Read the strategy

```bash
cat "workspace/clients/{client}/campaigns/{slug}/campaign-strategy.md"
```

Extract the ICP block. If anything is vague ("decision-makers", "tech companies"), stop and push back to the orchestrator. Garbage in, garbage out.

If the strategy mentions a provider-specific signal — e.g. "Series B SaaS" (funding stage), "companies using Snowflake" (tech), "hiring 10+ engineers in last 90d" (job postings + hiring velocity) — Prospeo is the right call. Note this when proposing the provider.

## Step 1 — Pick the provider

Either honor the orchestrator's choice, or ask the user with a clear default. Then verify the provider is set up:

| Provider | Verify command | If it fails |
| --- | --- | --- |
| Smart Prospects | `smartlead campaigns list` | Hand off to `install-smartlead` skill |
| Prospeo | `node .claude/skills/prospeo/scripts/prospeo.mjs account` (free) | Hand off to `prospeo` skill (Setup section) |

Do not skip the verify call. If the API key is missing or wrong, stop here — it will fail more confusingly later.

---

## Path A — Smart Prospects (Smartlead CLI)

Use this path when the provider is `smartlead`.

### A1. Build the search payload

Write `search.json` inside the campaign folder:

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

### A2. Run the search and write CSV

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

### A3. Clean up

Remove `search.json` if you don't want it in git history:

```bash
trash search.json
```

Skip to [Step 2 — Verify](#step-2--verify-applies-to-both-paths).

---

## Path B — Prospeo (in-repo CLI)

Use this path when the provider is `prospeo`. Prospeo separates search from enrichment: the search call returns identity + employment fields but **no email**. To get verified emails, the search results must be passed through `bulk-enrich-person`. The CLI's high-level `find-leads` command does this whole pipeline in one call.

### B1. Build the filters payload

Write `filters.json` inside the campaign folder. Top-level shape: `{ "filters": { ... } }`. The filter keys come straight from the Prospeo Search Person reference. A few common ones:

```json
{
  "filters": {
    "person_seniority": { "include": ["C-Suite", "Vice President", "Head"] },
    "person_job_title": {
      "include": ["VP Marketing", "Head of Growth", "CMO"],
      "match_only_exact_job_titles": false
    },
    "person_location_search": { "include": ["United States", "Canada"] },
    "company_industry": { "include": ["Software Development"] },
    "company_headcount_range": ["51-100", "101-200", "201-500"],
    "person_contact_details": {
      "email": ["VERIFIED"],
      "operator": "AND"
    }
  }
}
```

When the strategy doc calls for a Prospeo-specific filter, add it. Common ones worth knowing:

- **Funding stage / date / amount** — `company_funding`: `{stage, funding_date, last_funding, total_funding}`
- **Technology** — `company_technology`: `{include: ["Snowflake", "Segment"]}`
- **Hiring velocity** — `company_job_posting_quantity`: `{min, max}` and `company_job_posting_hiring_for: {include: ["Senior Engineer"]}`
- **Headcount growth** — `company_headcount_growth`: `{timeframe_month, min, max, departments}`
- **NAICS / SIC codes** — `company_naics: {include: [541511]}` etc.

Hard rules from the API:

- **At least one filter must use `include` / positive selection** — pure-exclude searches are rejected with `INVALID_FILTERS`.
- **Page size is fixed at 25.** The CLI handles pagination internally for `find-leads`.
- **Hard cap = 25,000 results** (1000 pages × 25). If `total_count` is bigger, tighten filters.

**Before writing values, grep [.claude/skills/prospeo/reference/](../prospeo/reference/README.md) for the canonical enum strings.** Every Prospeo enum (industry, headcount band, seniority, department, funding stage, MX provider, technology, NAICS, SIC) is mirrored there as a flat-text file. Common surprises: `Founder/Owner` is one literal seniority value with a slash (not two); `company_headcount_range` only accepts predefined bands like `"11-20"`/`"21-50"` (not `"11-50"`); `company_industry` uses `"Software Development"` not `"Software"`. The reference dir spells out the rest — guessing costs an `INVALID_FILTERS` roundtrip.
- **Search returns no email or phone** — that's why we chain enrichment.

### B2. Run the pipeline

The high-level `find-leads` CLI command runs search → bulk-enrich → CSV in one shot:

```bash
cd "workspace/clients/{client}/campaigns/{slug}"

node ../../../../.claude/skills/prospeo/scripts/prospeo.mjs find-leads \
  --from-json filters.json \
  --target 200 \
  --output leads.csv
```

(Adjust the relative path depth based on where the campaign folder sits.)

What the CLI does and prints to stderr:

1. Pages through `/search-person` collecting `person_id`s until it has roughly `2 × target` (allowing for unmatched / unverified hits).
2. Chunks them into batches of 50 and calls `/bulk-enrich-person` with `only_verified_email: true` so unverified hits are not billed.
3. Filters to rows with a non-null verified email and writes the CSV.
4. Prints a final line like:
   `Done. Wrote 187 leads to leads.csv. Credits spent: 8 (search) + 187 (enrich) = 195. Unmatched: 13.`

If you need mobile numbers as well (10 credits per hit, much more expensive), add `--mobile`:

```bash
node ../../../../.claude/skills/prospeo/scripts/prospeo.mjs find-leads \
  --from-json filters.json --target 200 --output leads.csv --mobile
```

Warn the user before running with `--mobile` — at 200 leads, that's ~2000 credits.

### B3. Manual pipeline (only if you need to inspect intermediate steps)

If the high-level command isn't fitting the use case (e.g. you want to manually QA the search results before paying to enrich them), you can run the steps separately:

```bash
PROSPEO=node\ .claude/skills/prospeo/scripts/prospeo.mjs

$PROSPEO search-person --from-json filters.json --page 1 --output search-p1.json
# inspect search-p1.json — look at total_count, sample a few rows

# Build an enrichment input from the person_ids you want, then:
$PROSPEO bulk-enrich-person --from-json enrich-input.json --verified-email --output enriched.json
```

You won't usually need this. Default to B2.

### B4. Clean up

```bash
trash filters.json   # optional — only if you don't want it tracked
```

---

## Step 2 — Verify (applies to both paths)

```bash
wc -l leads.csv             # row count incl. header
head -3 leads.csv           # check columns
awk -F',' 'NR>1 && $1!=""' leads.csv | wc -l   # rows with non-empty email
```

If the row count is far below target, tell the orchestrator the number you got and stop. Don't pad with low-quality leads.

If `leads.csv` contains real contact data, do not commit it to a public repo.

---

## Output schema

Both paths produce a CSV that, at minimum, contains:

| Column | Required | Notes |
| --- | --- | --- |
| `email` | yes | verified email address |
| `first_name` | yes | |
| `last_name` | yes | |
| `company_name` | yes | |

Additional columns are allowed and welcomed. The Prospeo path adds `full_name`, `job_title`, `company_website`, `company_domain`, `linkedin_url`, `country`, `city`. The Smartlead path adds whatever Smart Prospects returns. The `create-campaign` skill ignores extra columns it doesn't recognize, so any superset of the four required columns is safe.

If the copy uses `{{token}}` placeholders that don't correspond to a CSV column, the campaign will send literal `{{token}}` text to recipients — that's a Phase 3 / create-campaign concern, not a Phase 2 one. Mention any extra columns to the orchestrator so Phase 3 can take advantage of them.

---

## Common pitfalls

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Smart Prospects returns 0 rows | Filters too narrow or job title isn't canonical | Run `smartlead prospect job-titles --query "..."` to confirm |
| Smart Prospects: emails empty for half the rows | `verified_emails_only` not set | Add `"verified_emails_only": true` to search.json |
| Prospeo: `INVALID_FILTERS` with `filter_error` text | Enum value mismatch (industry, technology, location) | The `filter_error` field names the offending value — fix it; do not pass synonyms |
| Prospeo: `INVALID_FILTERS` "all-exclude" | At least one filter must `include` | Add a positive filter |
| Prospeo: `total_count` huge but only first 25,000 retrievable | Hard API cap | Tighten filters to slice the search |
| Prospeo: `find-leads` returned far fewer rows than target | Low verified-email hit rate on this ICP | Don't pad — report the number; consider widening filters or switching providers |
| `401 INVALID_API_KEY` | Wrong / missing key | Re-run `install-smartlead` or `prospeo` (Setup) accordingly |
| `429 RATE_LIMITED` | Plan quota hit | The CLI surfaces `x-minute-reset-seconds`; wait that long and retry |

## Output

A `leads.csv` in the campaign folder, ready for the `create-campaign` skill to upload.

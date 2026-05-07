---
name: prospeo
description: Operational skill for the Prospeo B2B contact API. Drives the in-repo Prospeo CLI (.claude/skills/prospeo/scripts/prospeo.mjs, zero-dep Node, requires Node 18+ and PROSPEO_API_KEY). Covers (a) first-time setup — verifying Node, saving the API key to .env, calling the free /account-information ping — and (b) ongoing usage — searching persons or companies, enriching single or bulk records (verified email, optional mobile), and the high-level find-leads pipeline. Use when the user mentions Prospeo at all, including "set up Prospeo", "install Prospeo", "use Prospeo", "find emails with Prospeo", "enrich these contacts", "search Prospeo for ...", "verify a Prospeo key", or when the find-leads skill picks the Prospeo provider.
---

# Prospeo

End-to-end skill for the Prospeo B2B contact API. Owns the in-repo Prospeo CLI at `scripts/prospeo.mjs` (zero deps, native Node 18+ `fetch`) and the operational knowledge for using it.

The CLI invokes the Prospeo HTTP API directly. Reference: https://prospeo.io/api-docs.

## At a glance

| You want to… | Run |
| --- | --- |
| Check plan + remaining credits (free) | `node .claude/skills/prospeo/scripts/prospeo.mjs account` |
| Search persons by ICP filters | `prospeo.mjs search-person --from-json filters.json --page 1 --output page1.json` |
| Search companies | `prospeo.mjs search-company --from-json filters.json --page 1` |
| Enrich one person → verified email | `prospeo.mjs enrich-person --from-json one.json --verified-email` |
| Enrich up to 50 people in one call | `prospeo.mjs bulk-enrich-person --from-json batch.json --verified-email` |
| Run search → bulk-enrich → leads.csv | `prospeo.mjs find-leads --from-json filters.json --target 200 --output leads.csv` |

The full help screen is `prospeo.mjs help`.

---

## Setup (first run only — skip if already done)

You're set up if all three are true:

1. `node --version` is **v18.x.x or higher**
2. `.env` in the project root contains a real `PROSPEO_API_KEY=...`
3. `node .claude/skills/prospeo/scripts/prospeo.mjs account` returns `error: false` and a `current_plan` field

If any are false, run the setup steps below. Otherwise skip to the operational sections.

### S1. Node 18+

```bash
node --version
```

If under 18 or not found, stop and tell the user:

> "I need Node.js 18 or higher. Please download it from https://nodejs.org (LTS), run the installer, then come back and say 'continue setup'."

Don't install Node yourself — it needs the user to click through an installer.

### S2. CLI executable

```bash
chmod +x .claude/skills/prospeo/scripts/prospeo.mjs
node .claude/skills/prospeo/scripts/prospeo.mjs help
```

If the help text prints, the CLI is wired up.

### S3. API key

If `.env` doesn't exist:

```bash
cp .env.example .env
```

Then walk the user through getting the key. Send this message verbatim:

> Now I need your Prospeo API key. Here's exactly where to find it:
>
> 1. Open https://app.prospeo.io in your browser and log in.
> 2. Click your account / avatar (usually top-right) and open **Settings**.
> 3. Open the **API** tab (sometimes labelled "API Access" or "Integrations").
> 4. Click **Generate API Key** if there isn't one yet, or copy the existing one.
> 5. Paste it here and send.
>
> The key will only be visible to me to set things up — I'll save it to your local `.env` file and never share it.

When the user pastes it:

- Sanity-check it looks like an API key (long string, no spaces, ≥~20 chars). If it looks truncated, ask them to check.
- **Do not echo the key back in chat.** Refer to it as "your key".
- **Do not claim the key starts with any specific prefix.** Use a neutral description.

Use the **Edit** tool to replace the `PROSPEO_API_KEY=your-key-here` line in `.env` with the real value.

### S4. Verify

```bash
node .claude/skills/prospeo/scripts/prospeo.mjs account
```

The `/account-information` endpoint is **free**. Expected:

```json
{
  "error": false,
  "response": {
    "current_plan": "STARTER",
    "remaining_credits": 99,
    "used_credits": 1,
    "next_quota_renewal_days": 25
  }
}
```

If you get `INVALID_API_KEY` (HTTP 401), the key is wrong. Re-do S3.

Tell the user: "You're set. **{remaining_credits}** Prospeo credits available on the **{current_plan}** plan."

---

## CLI command reference

The CLI is invoked as `node .claude/skills/prospeo/scripts/prospeo.mjs <command> [flags]`. Every command except `account` accepts a `--from-json <file>` payload.

### `account`

Free. Returns plan + credit balance.

```bash
node .claude/skills/prospeo/scripts/prospeo.mjs account
```

### `search-person` and `search-company`

Filter-based search. Page size is fixed at **25 results**, max **1000 pages** (25,000 result hard cap). Costs **1 credit per page** when the page returns results; identical (filters + page) requests within 30 days are free (`"free": true`).

Input JSON shape (top-level `filters` object, optional top-level `page`):

```json
{
  "filters": {
    "person_seniority": { "include": ["C-Suite", "Vice President"] },
    "company_industry": { "include": ["Software Development"] },
    "company_headcount_range": ["51-100", "101-200"]
  }
}
```

```bash
node .claude/skills/prospeo/scripts/prospeo.mjs search-person --from-json filters.json --page 1 --output page1.json
```

**Hard rule:** at least one filter must use `include` / positive selection. Pure-exclude searches return `INVALID_FILTERS`.

**What's returned:** identity + employment fields only. **Email and mobile are NOT returned by search** — you must chain `enrich-person` or `bulk-enrich-person` (or use `find-leads`).

**Before writing filter values, check [reference/](reference/README.md) for the canonical enum strings.** Every Prospeo enum is mirrored there as a flat-text file you can `grep`. Guessing values (e.g. `"Software"` instead of `"Software Development"`, or `"11-50"` instead of `["11-20", "21-50"]`) costs an `INVALID_FILTERS` roundtrip.

The most useful filter keys for cold email work — the full list is on https://prospeo.io/api-docs/search-person, but these come up most:

| Filter | Shape | Purpose |
| --- | --- | --- |
| `person_seniority` | `{include: [...]}` | Enum — see [reference/seniorities.txt](reference/seniorities.txt). |
| `person_job_title` | `{include: [...], match_only_exact_job_titles: false}` | Free-text strings (no enum); supports `boolean_search`. Validate via Prospeo's Search Suggestions API. |
| `person_department` | `{include: [...]}` | Enum — see [reference/departments.txt](reference/departments.txt) (use the `# Normal Departments` section). |
| `person_location_search` | `{include: [...]}` | Free-text strings; must match Prospeo's location dictionary. Validate via Search Suggestions API. |
| `person_year_of_experience` | `{min, max}` | Integers, 0–60. |
| `company_industry` | `{include: [...]}` | Enum — see [reference/industries.txt](reference/industries.txt). |
| `company_headcount_range` | Array of band strings | Enum — see [reference/employee-ranges.txt](reference/employee-ranges.txt). |
| `company_funding` | `{stage, funding_date, last_funding, total_funding}` | `stage` enum — see [reference/funding-stages.txt](reference/funding-stages.txt). `funding_date` is one of `{30, 60, 90, 180, 270, 365}` (days). `last_funding` / `total_funding` are amount-bucket strings. |
| `company_technology` | `{include: [...]}` | Enum — see [reference/technologies.txt](reference/technologies.txt) (~5k values; grep before guessing). |
| `company_email_provider` | `{include: [...]}` | Enum — see [reference/mx-providers.txt](reference/mx-providers.txt). |
| `company_naics` | `{include: [int]}` | 6-digit codes — see [reference/naics-codes.txt](reference/naics-codes.txt). |
| `company_sics` | `{include: [int]}` | 4-digit codes — see [reference/sic-codes.txt](reference/sic-codes.txt). |
| `company_headcount_growth` | `{timeframe_month, min, max, departments}` | `departments` enum — see [reference/departments.txt](reference/departments.txt) (use the `# Headcount Growth Departments` section, NOT the `# Normal Departments` section). |

**Validation is strict:** enum mismatches return `error_code: INVALID_FILTERS` with a human `filter_error` string naming the offending value. Don't pass synonyms — grep [reference/](reference/README.md) for the canonical value first. The reference snapshot is the source of truth; if a value is missing there but Prospeo accepts it, the snapshot is stale and should be refreshed.

### `enrich-person` and `bulk-enrich-person`

Looks up a person and returns identity + employment + (optionally) verified email + (optionally) mobile. Costs **1 credit per match**; **10 credits per match if `--mobile`**. Charged on hit only — no charge if no match. Re-enriching the same record later is free for account lifetime.

Accepted input identifiers (any one is enough):

- `linkedin_url`
- `email` (used for reverse-enrichment)
- `person_id` from a Search Person result
- `first_name + last_name + (company_name | company_website | company_linkedin_url)`
- `full_name + (company_name | company_website | company_linkedin_url)`

Single record:

```json
{
  "data": {
    "first_name": "Eva",
    "last_name": "Kiegler",
    "company_website": "intercom.com"
  }
}
```

```bash
node .claude/skills/prospeo/scripts/prospeo.mjs enrich-person --from-json one.json --verified-email
```

Bulk (up to **50** records per call, synchronous — no polling):

```json
{
  "data": [
    { "linkedin_url": "https://linkedin.com/in/...", "identifier": "lead-1" },
    { "person_id": "abc123",                          "identifier": "lead-2" },
    { "first_name": "Sara", "last_name": "Lin", "company_website": "acme.com", "identifier": "lead-3" }
  ]
}
```

```bash
node .claude/skills/prospeo/scripts/prospeo.mjs bulk-enrich-person --from-json batch.json --verified-email
```

Always include `identifier` per record so you can correlate input → output. Bulk response shape: `{error, total_cost, matched: [...], not_matched: [...], invalid_datapoints: [...]}`.

**Cost discipline:** keep `--verified-email` on by default — it makes unverified hits unbillable (`NO_MATCH`). Add `--mobile` only when the campaign actually needs phone numbers; it's 10x the cost.

### `enrich-company` and `bulk-enrich-company`

Same shape as the person versions but for companies. Inputs: any of `company_website`, `company_linkedin_url`, `company_name` (discouraged alone), `company_id`. Returns: 50+ fields including industry, headcount, location, revenue range, funding history, tech stack, social URLs.

```bash
node .claude/skills/prospeo/scripts/prospeo.mjs enrich-company --from-json company.json
node .claude/skills/prospeo/scripts/prospeo.mjs bulk-enrich-company --from-json companies.json
```

### `find-leads` (high-level pipeline)

Runs `search-person` paginated → `bulk-enrich-person` chunked at 50 → CSV in one shot. Used by the `find-leads` skill on the Prospeo path; you can call it directly too.

```bash
node .claude/skills/prospeo/scripts/prospeo.mjs find-leads \
  --from-json filters.json \
  --target 200 \
  --output leads.csv
```

The CSV columns are: `email, first_name, last_name, full_name, job_title, company_name, company_website, company_domain, linkedin_url, country, city`. This satisfies the Phase-2 [Output schema](../find-leads/SKILL.md#output-schema) consumed by `create-campaign`.

The CLI prints a summary line at the end like:
> `Done. Wrote 187 leads to leads.csv. Credits spent: 8 (search) + 187 (enrich) = 195. Unmatched: 13.`

Add `--mobile` only when needed — at 200 leads, that's ~2000 credits.

---

## Common workflows

### "Find me a list of cold-email leads matching this ICP"

Use the `find-leads` skill on the Prospeo path. It will end up calling this skill's `find-leads` CLI command. Don't reinvent it.

### "Enrich this list of LinkedIn URLs / names+companies into verified emails"

1. Build a JSON file with the records as the `data` array (chunks of ≤50).
2. `prospeo.mjs bulk-enrich-person --from-json chunk.json --verified-email`.
3. Concatenate the `matched` arrays across chunks. The `identifier` field is your join key.

### "Look up one person from their LinkedIn URL"

```bash
echo '{"data":{"linkedin_url":"https://www.linkedin.com/in/eva-kiegler/"}}' > one.json
node .claude/skills/prospeo/scripts/prospeo.mjs enrich-person --from-json one.json --verified-email
```

### "Check how many credits I have left"

```bash
node .claude/skills/prospeo/scripts/prospeo.mjs account
```

Free. Use this as a preflight before any expensive batch.

---

## Cost & rate-limit notes

| Action | Cost |
| --- | --- |
| `account` | free |
| `search-person` / `search-company` | 1 credit per page (25 results), free if identical query within 30 days |
| `enrich-person` / `enrich-company` | 1 credit per match, free if no match, free re-enrichment lifetime |
| `enrich-person --mobile` | **10 credits per match** |
| `bulk-enrich-*` | same per-record cost, just batched up to 50 |

Rate limits depend on plan. The CLI surfaces these response headers on stderr (unless `--quiet`):

- `x-daily-request-left`, `x-minute-request-left`
- `x-daily-reset-seconds`, `x-minute-reset-seconds`

On `429` the CLI prints how long until the limit resets and exits with code 2.

---

## Common errors

| `error_code` | HTTP | Cause | Fix |
| --- | --- | --- | --- |
| `INVALID_API_KEY` | 401 | Missing / wrong / truncated `PROSPEO_API_KEY` | Re-do Setup S3 |
| `INVALID_FILTERS` | 400 | Enum value mismatch — `filter_error` field names the offending value | Fix the value to match the enum exactly |
| `INVALID_DATAPOINTS` | 400 | Enrich input doesn't satisfy any valid identifier combination | Add another identifier (linkedin_url, or company_website) |
| `INSUFFICIENT_CREDITS` | 400 | Out of credits | Check `account`; upgrade plan or wait for renewal |
| `NO_MATCH` | 400 | No record found (single enrich) | Try a different identifier; this case is unbilled |
| `RATE_LIMITED` | 429 | Per-minute or per-day limit hit | Wait `x-*-reset-seconds`, retry |

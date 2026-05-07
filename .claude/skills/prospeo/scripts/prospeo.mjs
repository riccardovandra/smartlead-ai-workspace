#!/usr/bin/env node
// Prospeo CLI — minimal client for https://api.prospeo.io
// Reference: https://prospeo.io/api-docs
// Zero deps. Requires Node 18+ (native fetch).

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { argv, exit, stderr, stdout, env, cwd } from "node:process";

const API_BASE = "https://api.prospeo.io";
const SEARCH_PAGE_SIZE = 25;
const SEARCH_MAX_PAGE = 1000;
const BULK_MAX = 50;

// ---------- .env loader (walks up from cwd) ----------

function loadDotenv() {
  let dir = cwd();
  while (true) {
    const path = join(dir, ".env");
    if (existsSync(path)) {
      for (const line of readFileSync(path, "utf8").split("\n")) {
        const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/i);
        if (!m) continue;
        let v = m[2];
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
          v = v.slice(1, -1);
        }
        if (!(m[1] in env)) env[m[1]] = v;
      }
      return;
    }
    const parent = dirname(dir);
    if (parent === dir) return;
    dir = parent;
  }
}

// ---------- arg parsing ----------

function parseArgs(args) {
  const out = { _: [], flags: {} };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = args[i + 1];
      if (next === undefined || next.startsWith("--")) {
        out.flags[key] = true;
      } else {
        out.flags[key] = next;
        i++;
      }
    } else {
      out._.push(a);
    }
  }
  return out;
}

function readJsonFile(path) {
  if (!path) die("Missing --from-json <file>", 1);
  if (!existsSync(path)) die(`File not found: ${path}`, 1);
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (e) {
    die(`Invalid JSON in ${path}: ${e.message}`, 1);
  }
}

function die(msg, code = 1) {
  stderr.write(`prospeo: ${msg}\n`);
  exit(code);
}

function log(msg, quiet) {
  if (!quiet) stderr.write(msg + "\n");
}

// ---------- API client ----------

function getApiKey(flags) {
  const key = flags["api-key"] || env.PROSPEO_API_KEY;
  if (!key || key === "your-key-here") {
    die(
      "PROSPEO_API_KEY is not set. Add it to .env in the project root, or pass --api-key. Run the prospeo skill (Setup section) if you need help.",
      1,
    );
  }
  return key;
}

async function callApi({ method, path, body, flags }) {
  const key = getApiKey(flags);
  const headers = { "X-KEY": key };
  if (body !== undefined) headers["Content-Type"] = "application/json";

  let res;
  try {
    res = await fetch(API_BASE + path, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    die(`Network error: ${e.message}`, 3);
  }

  const rate = {};
  for (const h of [
    "x-daily-request-left",
    "x-minute-request-left",
    "x-daily-reset-seconds",
    "x-minute-reset-seconds",
    "x-daily-rate-limit",
    "x-minute-rate-limit",
    "x-second-rate-limit",
  ]) {
    const v = res.headers.get(h);
    if (v != null) rate[h] = v;
  }

  let data = null;
  try {
    data = await res.json();
  } catch {
    /* non-JSON body (rare) */
  }

  if (!flags.quiet && Object.keys(rate).length) {
    log(
      `[rate] day-left=${rate["x-daily-request-left"] ?? "?"} min-left=${rate["x-minute-request-left"] ?? "?"}`,
      flags.quiet,
    );
  }

  if (res.status === 429) {
    const reset = parseInt(rate["x-minute-reset-seconds"] || rate["x-daily-reset-seconds"] || "60", 10);
    die(`Rate limited (HTTP 429). Try again in ${reset}s.`, 2);
  }

  if (!res.ok || (data && data.error === true)) {
    const errCode = data?.error_code || `HTTP_${res.status}`;
    const detail = data?.filter_error || data?.message || JSON.stringify(data);
    die(`API error: ${errCode} — ${detail}`, 3);
  }

  return data;
}

// ---------- output helpers ----------

function emit(data, flags) {
  const text = JSON.stringify(data, null, 2);
  if (flags.output) {
    writeFileSync(flags.output, text);
    log(`Wrote ${flags.output}`, flags.quiet);
  } else {
    stdout.write(text + "\n");
  }
}

function csvEscape(v) {
  if (v == null) return "";
  const s = String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function writeCsv(path, rows, columns) {
  const header = columns.join(",");
  const body = rows.map((r) => columns.map((c) => csvEscape(r[c])).join(",")).join("\n");
  writeFileSync(path, header + "\n" + body + (body ? "\n" : ""));
}

// ---------- commands ----------

async function cmdAccount(flags) {
  // Per docs, /account-information is GET and free of charge.
  const data = await callApi({ method: "GET", path: "/account-information", flags });
  emit(data, flags);
}

async function cmdSearchPerson(flags) {
  const input = readJsonFile(flags["from-json"]);
  const body = {
    filters: input.filters || input,
    page: parseInt(flags.page || input.page || "1", 10),
  };
  if (body.page < 1 || body.page > SEARCH_MAX_PAGE) die(`page must be 1..${SEARCH_MAX_PAGE}`, 1);
  const data = await callApi({ method: "POST", path: "/search-person", body, flags });
  emit(data, flags);
}

async function cmdSearchCompany(flags) {
  const input = readJsonFile(flags["from-json"]);
  const body = {
    filters: input.filters || input,
    page: parseInt(flags.page || input.page || "1", 10),
  };
  if (body.page < 1 || body.page > SEARCH_MAX_PAGE) die(`page must be 1..${SEARCH_MAX_PAGE}`, 1);
  const data = await callApi({ method: "POST", path: "/search-company", body, flags });
  emit(data, flags);
}

async function cmdEnrichPerson(flags) {
  const input = readJsonFile(flags["from-json"]);
  const body = {
    data: input.data || input,
    only_verified_email: !!flags["verified-email"] || !!input.only_verified_email,
    enrich_mobile: !!flags.mobile || !!input.enrich_mobile,
    only_verified_mobile: !!flags["verified-mobile"] || !!input.only_verified_mobile,
  };
  const data = await callApi({ method: "POST", path: "/enrich-person", body, flags });
  emit(data, flags);
}

async function cmdEnrichCompany(flags) {
  const input = readJsonFile(flags["from-json"]);
  const body = { data: input.data || input };
  const data = await callApi({ method: "POST", path: "/enrich-company", body, flags });
  emit(data, flags);
}

async function cmdBulkEnrichPerson(flags) {
  const input = readJsonFile(flags["from-json"]);
  const items = input.data || input.items || input;
  if (!Array.isArray(items)) die("bulk-enrich-person expects an array of records under .data, .items, or top-level", 1);
  if (items.length > BULK_MAX) die(`Bulk endpoint accepts at most ${BULK_MAX} items per call`, 1);
  const body = {
    data: items,
    only_verified_email: !!flags["verified-email"] || !!input.only_verified_email,
    enrich_mobile: !!flags.mobile || !!input.enrich_mobile,
    only_verified_mobile: !!flags["verified-mobile"] || !!input.only_verified_mobile,
  };
  const data = await callApi({ method: "POST", path: "/bulk-enrich-person", body, flags });
  emit(data, flags);
}

async function cmdBulkEnrichCompany(flags) {
  const input = readJsonFile(flags["from-json"]);
  const items = input.data || input.items || input;
  if (!Array.isArray(items)) die("bulk-enrich-company expects an array of records", 1);
  if (items.length > BULK_MAX) die(`Bulk endpoint accepts at most ${BULK_MAX} items per call`, 1);
  const data = await callApi({ method: "POST", path: "/bulk-enrich-company", body: { data: items }, flags });
  emit(data, flags);
}

// High-level pipeline: search-person → bulk-enrich-person → leads.csv
//
// Input JSON shape: same as search-person (filters object + optional page).
// Flags:
//   --target N        Stop once N enriched leads with verified email are collected
//   --output FILE     CSV path (required for find-leads)
//   --mobile          Also enrich mobile (10 credits/hit instead of 1)
async function cmdFindLeads(flags) {
  const input = readJsonFile(flags["from-json"]);
  const target = parseInt(flags.target || "200", 10);
  const outputPath = flags.output;
  if (!outputPath) die("find-leads requires --output <leads.csv>", 1);
  if (!outputPath.endsWith(".csv")) die("--output must end in .csv", 1);

  const filters = input.filters || input;
  const enrichMobile = !!flags.mobile;

  log(
    `Hunting up to ${target} verified-email leads. Search costs 1 credit/page (25 rows). Enrichment costs ${enrichMobile ? 10 : 1} credit/hit.`,
    flags.quiet,
  );

  const collectedPersonIds = [];
  let page = 1;
  let totalCount = null;
  let searchCreditsSpent = 0;

  while (collectedPersonIds.length < target * 2 && page <= SEARCH_MAX_PAGE) {
    log(`[search] page ${page}…`, flags.quiet);
    const data = await callApi({
      method: "POST",
      path: "/search-person",
      body: { filters, page },
      flags,
    });
    if (!data.free) searchCreditsSpent += 1;
    if (totalCount == null) totalCount = data.pagination?.total_count ?? null;
    const results = data.results || [];
    if (results.length === 0) break;

    for (const row of results) {
      const pid = row.person?.person_id;
      if (pid) collectedPersonIds.push(pid);
    }
    if (data.pagination && page >= data.pagination.total_page) break;
    page++;
  }

  log(
    `[search] collected ${collectedPersonIds.length} person ids (search-side total_count=${totalCount}, ${searchCreditsSpent} search credits spent)`,
    flags.quiet,
  );

  if (collectedPersonIds.length === 0) {
    writeCsv(outputPath, [], leadCsvColumns());
    log("No matches. Wrote empty CSV.", flags.quiet);
    return;
  }

  // Chunk into bulk-enrich calls.
  const enrichedRows = [];
  let enrichCreditsSpent = 0;
  let unmatched = 0;
  for (let i = 0; i < collectedPersonIds.length && enrichedRows.length < target; i += BULK_MAX) {
    const chunk = collectedPersonIds.slice(i, i + BULK_MAX).map((person_id) => ({ person_id, identifier: person_id }));
    log(`[enrich] batch ${Math.floor(i / BULK_MAX) + 1} (${chunk.length} ids)…`, flags.quiet);
    const data = await callApi({
      method: "POST",
      path: "/bulk-enrich-person",
      body: {
        data: chunk,
        only_verified_email: true,
        enrich_mobile: enrichMobile,
        only_verified_mobile: enrichMobile,
      },
      flags,
    });
    enrichCreditsSpent += data.total_cost || 0;
    unmatched += (data.not_matched?.length || 0) + (data.invalid_datapoints?.length || 0);
    for (const m of data.matched || []) {
      const row = personToCsvRow(m);
      if (row.email) enrichedRows.push(row);
      if (enrichedRows.length >= target) break;
    }
  }

  writeCsv(outputPath, enrichedRows, leadCsvColumns());
  log(
    `Done. Wrote ${enrichedRows.length} leads to ${outputPath}. Credits spent: ${searchCreditsSpent} (search) + ${enrichCreditsSpent} (enrich) = ${searchCreditsSpent + enrichCreditsSpent}. Unmatched: ${unmatched}.`,
    flags.quiet,
  );
}

function leadCsvColumns() {
  return [
    "email",
    "first_name",
    "last_name",
    "full_name",
    "job_title",
    "company_name",
    "company_website",
    "company_domain",
    "linkedin_url",
    "country",
    "city",
  ];
}

function personToCsvRow(matched) {
  const p = matched.person || {};
  const c = matched.company || {};
  return {
    email: p.email?.email || "",
    first_name: p.first_name || "",
    last_name: p.last_name || "",
    full_name: p.full_name || "",
    job_title: p.current_job_title || "",
    company_name: c.name || "",
    company_website: c.website || "",
    company_domain: c.domain || "",
    linkedin_url: p.linkedin_url || "",
    country: p.location?.country || "",
    city: p.location?.city || "",
  };
}

// ---------- help / dispatch ----------

const HELP = `Prospeo CLI — minimal client for https://api.prospeo.io

USAGE
  node prospeo.mjs <command> [flags]

COMMANDS
  account                                Show plan + remaining credits (free).
  search-person       --from-json FILE   Person search.    1 credit/page on hit, 25 results/page.
  search-company      --from-json FILE   Company search.   1 credit/page on hit.
  enrich-person       --from-json FILE   Single person enrichment (1 credit/hit, 10 with mobile).
  enrich-company      --from-json FILE   Single company enrichment (1 credit/hit).
  bulk-enrich-person  --from-json FILE   Up to ${BULK_MAX} persons per call, synchronous.
  bulk-enrich-company --from-json FILE   Up to ${BULK_MAX} companies per call, synchronous.
  find-leads          --from-json FILE   Pipeline: search-person → bulk-enrich-person → CSV.

COMMON FLAGS
  --page N             Page number for search (default 1).
  --target N           For find-leads: number of verified-email leads to collect (default 200).
  --output FILE        Write JSON/CSV here instead of stdout. Required for find-leads.
  --verified-email     Set only_verified_email=true.
  --mobile             Set enrich_mobile=true (10x credit cost!).
  --verified-mobile    Set only_verified_mobile=true.
  --api-key KEY        Override PROSPEO_API_KEY env var.
  --quiet              Suppress rate-limit telemetry on stderr.

ENV
  PROSPEO_API_KEY      Required. Read from .env in project root or any ancestor dir.

EXAMPLES
  node prospeo.mjs account
  node prospeo.mjs search-person --from-json filters.json --page 1 --output page1.json
  node prospeo.mjs find-leads --from-json filters.json --target 200 --output leads.csv

EXIT CODES
  0  success           1  bad input / missing key
  2  rate-limited      3  API/network error`;

async function main() {
  loadDotenv();
  const args = parseArgs(argv.slice(2));
  const cmd = args._[0];
  const flags = args.flags;

  if (!cmd || cmd === "help" || cmd === "--help" || cmd === "-h") {
    stdout.write(HELP + "\n");
    return;
  }

  const dispatch = {
    account: cmdAccount,
    "search-person": cmdSearchPerson,
    "search-company": cmdSearchCompany,
    "enrich-person": cmdEnrichPerson,
    "enrich-company": cmdEnrichCompany,
    "bulk-enrich-person": cmdBulkEnrichPerson,
    "bulk-enrich-company": cmdBulkEnrichCompany,
    "find-leads": cmdFindLeads,
  };

  const handler = dispatch[cmd];
  if (!handler) die(`Unknown command: ${cmd}. Run 'prospeo help' to see commands.`, 1);
  await handler(flags);
}

main().catch((e) => die(e.stack || e.message || String(e), 3));

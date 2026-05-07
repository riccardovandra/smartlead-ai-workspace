# Email sequence — {slug}

## Schedule

| Step | Day | Thread |
| --- | --- | --- |
| 1 | Day 0 | Thread 1 |
| 2 | Day 3 | Thread 1 |
| 3 | Day 7 | Thread 2 |

## Step 1 — Day 0

**Subject:** {short, lowercase, looks like a 1-to-1 message; max 5 words}

```
Hi {{first_name}},

{One-sentence relevance hook tied to {{company_name}} — why I'm writing to them specifically, not "saw your website".}

{One sentence naming the pain from the strategy doc, in their words.}

{One sentence with the offer / CTA. Keep it specific. "Worth a 15-min call this Thu?" beats "Open to a chat?".}

{Sign-off}
{Your name}
```

## Step 2 — Day 3 (follow-up, same thread)

**Subject:** *(leave blank — Smartlead will auto-thread)*

```
Hi {{first_name}},

{One sentence: bumping this with a different angle or a piece of proof not used in step 1.}

{Reiterated CTA, lower friction than step 1. e.g. "If timing's off, happy to send a 2-min Loom instead.".}

{Sign-off}
```

## Step 3 — Day 7 (last touch, same thread)

**Subject:** *(leave blank)*

```
Hi {{first_name}},

{One short sentence — break-up email. Acknowledge the no-response without guilt-tripping.}

{Optional: leave a door open. "If this becomes relevant later, my email is the easiest way to reach me.".}

{Sign-off}
```

---

## Token rules

- Every `{{token}}` in this file must be a column in `leads.csv`.
- Defaults: `{{first_name}}`, `{{last_name}}`, `{{company_name}}`.
- If you add a custom token, add it as a column to `leads.csv` before deploy or the row will be skipped.

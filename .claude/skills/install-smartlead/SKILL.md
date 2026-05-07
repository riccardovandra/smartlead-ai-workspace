---
name: install-smartlead
description: Onboarding skill for first-time setup of this workspace. Installs the public Smartlead CLI globally via npm and walks a non-technical user through getting their Smartlead API key from the dashboard, saving it to .env, and verifying the install. Use when the user mentions installing Smartlead, setting up the CLI, getting started, first-time setup, "install smartlead", "set up the API key", or when `smartlead --version` / `smartlead campaigns list` fails.
---

# Install Smartlead

One-time setup. Run when the workspace is fresh, or when `smartlead campaigns list` fails because Node, the CLI, or the API key is missing.

The audience may be non-technical. Talk in plain language. Don't dump shell commands at them — execute the commands yourself and tell them what's happening in one sentence.

## What "done" looks like

- `smartlead --version` prints a version
- `.env` exists in the project root with a real `SMARTLEAD_API_KEY`
- `smartlead campaigns list` runs without an auth error

If all three are already true, tell the user setup is done and stop. Don't reinstall.

---

## Step 1 — Check Node is installed

```bash
node --version
```

- If you see `v18.x.x` or higher → continue to Step 2.
- If the command is not found or the version is below 18 → stop and tell the user:
  > "I need Node.js 18 or higher to install the Smartlead CLI. Please download it from https://nodejs.org (pick the LTS version), run the installer, then come back and say 'continue install'."

Do not try to install Node yourself. It needs the user to click through an installer.

---

## Step 2 — Install the Smartlead CLI

```bash
npm install -g @smartlead/cli
```

Then verify:

```bash
smartlead --version
```

If npm fails with a permissions error (`EACCES`), tell the user:
> "npm needs permission to install global packages. The fix is one command — should I run `sudo npm install -g @smartlead/cli`? It will ask for your Mac password."

Wait for confirmation before running anything with `sudo`.

---

## Step 3 — Create the `.env` file

If `.env` already exists in the project root, skip to Step 4.

Otherwise:

```bash
cp .env.example .env
```

Tell the user, in plain language:
> "I created a file called `.env` in the project. This is where your Smartlead API key lives. It is ignored by git, so it never gets committed."

---

## Step 4 — Walk the user through getting their API key

Send this message verbatim (in plain language, no jargon):

> Now I need your Smartlead API key. Here's exactly where to find it:
>
> 1. Open https://app.smartlead.ai in your browser and log in.
> 2. Click the **Settings** icon (gear, usually bottom-left or top-right).
> 3. Open the **API & Webhooks** tab (sometimes called "API Keys" or just "API").
> 4. Click **Add API Key** if there isn't one yet, or copy the existing one.
> 5. Paste it here and send.
>
> The key will only be visible to me to set things up — I'll save it to your local `.env` file and never share it.

When the user pastes the key:

- Sanity-check it looks like an API key (long string, no spaces, at least ~20 characters). If it looks truncated, ask them to double-check they copied the whole thing.
- Do **not** echo the key back in chat. Refer to it as "your key" once received.

---

## Step 5 — Save the key in two places

The CLI reads from its own config file, so we save the key in both `.env` (the user's source of truth) and the CLI config (so commands just work).

1. Write the key into `.env` using the Edit tool, replacing the `sl-your-key-here` placeholder line. Do **not** print the key in plain output.
2. Apply it to the CLI:

   ```bash
   smartlead config set api_key <THE_KEY>
   ```

---

## Step 6 — Verify

```bash
smartlead campaigns list
```

- If it returns a list (or an empty list) → setup is complete. Tell the user:
  > "Setup is done. You can now start your first campaign by saying: **'start a new outbound campaign for {your client name}'**."
- If it returns an auth error → the key was wrong. Ask the user to double-check, then re-do Step 4.
- If it errors with anything else → show the user the exact error and ask them to share a screenshot of the Smartlead API page.

---

## Re-running this skill

Safe to re-run. It checks before reinstalling, before recreating `.env`, and before re-prompting for the key. Use it any time the user says setup is broken.

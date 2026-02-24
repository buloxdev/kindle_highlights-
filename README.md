# kindle_highlights

Local tool to export Kindle highlights into Markdown files and email one random highlight weekly.

## Quick Start

1. Install dependencies:

```bash
npm install
npx playwright install chromium
cp .env.example .env
```

2. Set your weekly recipient in `.env` (or use Keychain):

```env
WEEKLY_HIGHLIGHT_EMAIL=you@example.com
```

For scheduled automations, prefer Keychain (`kindle_highlights.weekly_email.to`) because `.env` is not included in clean worktrees.

3. Run initial Kindle login once (interactive):

```bash
npm run kindle:scrape -- --headed
```

4. Run normal syncs (headless):

```bash
npm run kindle:scrape -- --headless
```

5. Test weekly email (includes 3 locally generated ideas: Action, Reflect, Watch-out):

```bash
npm run weekly:preview-highlight
npm run weekly:email-highlight
```

6. Schedule it weekly (example):
- Monday at 07:00 AM local time
- command: `npm run weekly:email-highlight`

## What this includes

- `scrape` mode:
  - Uses Playwright with a real browser against Kindle Notebook.
  - Supports pagination across all pages of highlights per book.
  - Reuses a persistent browser session (`.session/kindle`) so you do not need to log in every run.
  - Detects MFA/CAPTCHA and pauses for manual completion when running headed.
  - Supports secure credential lookup from macOS Keychain.
- `parse-email` mode:
  - Parses Kindle export text files (including `My Clippings.txt`) and `.eml` files.
  - Writes grouped Markdown files by book.
- `weekly-email` mode:
  - Picks one random highlight from `output/highlights/*.md`.
  - Adds 3 locally generated insights (Action, Reflect, Watch-out) based on the quote.
  - Sends it via Apple Mail (macOS) or previews the draft in terminal.

## Setup

```bash
npm install
npx playwright install chromium
cp .env.example .env
```

## Security-first setup (recommended)

1. Add Amazon secrets to macOS Keychain:

```bash
security add-generic-password -U -s "kindle_highlights.amazon.email" -a "default" -w "you@example.com"
security add-generic-password -U -s "kindle_highlights.amazon.password" -a "default" -w "your_password_here"
```

2. Optionally set weekly recipient in Keychain:

```bash
security add-generic-password -U -s "kindle_highlights.weekly_email.to" -a "default" -w "you@example.com"
```

3. Keep `.env` minimal:

```env
# AMAZON_EMAIL optional if in keychain
# AMAZON_PASSWORD optional if in keychain
# WEEKLY_HIGHLIGHT_EMAIL optional if recipient is in keychain
```

4. Lock down local file permissions:

```bash
chmod 600 .env
chmod 700 .session
chmod -R go-rwx .session
```

## Run highlight sync

First run (complete login/MFA):

```bash
npm run kindle:scrape -- --headed
```

Normal run:

```bash
npm run kindle:scrape -- --headless
```

## Run weekly email command

Preview draft only (no send):

```bash
npm run weekly:preview-highlight
```

Send now:

```bash
npm run weekly:email-highlight
```

Custom recipient override:

```bash
node src/cli.mjs weekly-email --send --to you@example.com
```

Recipient resolution order:
1. `--to`
2. `WEEKLY_HIGHLIGHT_EMAIL`
3. `AMAZON_EMAIL`
4. Keychain `kindle_highlights.weekly_email.to`
5. Keychain `kindle_highlights.amazon.email`

## Output

- Book files: `./output/highlights/*.md`

## Notes

- Amazon may change Kindle Notebook HTML/login flows, which can break scraping selectors.
- If MFA/CAPTCHA appears, run with `--headed` and complete the challenge manually.
- Keep `.env` and `.session/` private.

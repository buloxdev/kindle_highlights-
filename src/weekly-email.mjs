import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { loadDotEnv } from "./lib/utils.mjs";
import { resolveWeeklyEmailRecipient } from "./lib/keychain.mjs";

const execFileAsync = promisify(execFile);

export async function runWeeklyHighlightEmail({ outDir, recipientOverride, send }) {
  await loadDotEnv(path.resolve(".env"));

  const recipientInfo = await resolveWeeklyEmailRecipient(recipientOverride);
  if (!recipientInfo.recipient) {
    throw new Error(
      `No recipient email found. Set WEEKLY_HIGHLIGHT_EMAIL in .env or Keychain service ${recipientInfo.weeklyService}.`
    );
  }

  const highlights = await collectHighlights(outDir);
  if (!highlights.length) {
    throw new Error(`No highlights found in ${outDir}. Run kindle scrape first.`);
  }

  const picked = highlights[Math.floor(Math.random() * highlights.length)];
  const subject = `Weekly Kindle Highlight: ${picked.bookTitle}`;
  const body = formatEmailBody(picked);

  console.log(`[info] Picked highlight from "${picked.bookTitle}" (${picked.fileName}).`);
  console.log(`[info] Recipient source: ${recipientInfo.source}`);

  if (!send) {
    console.log("[preview] --send not provided. Showing email draft only.");
    console.log("---");
    console.log(`To: ${recipientInfo.recipient}`);
    console.log(`Subject: ${subject}`);
    console.log(body);
    return;
  }

  await sendWithAppleMail({ to: recipientInfo.recipient, subject, body });
  console.log(`[ok] Email sent to ${recipientInfo.recipient}`);
}

async function collectHighlights(outDir) {
  const entries = await fs.readdir(outDir, { withFileTypes: true }).catch(() => []);
  const markdownFiles = entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".md"))
    .map((entry) => path.join(outDir, entry.name));

  const all = [];
  for (const filePath of markdownFiles) {
    const text = await fs.readFile(filePath, "utf8");
    const parsed = parseBookMarkdown(text, path.basename(filePath));
    for (const item of parsed) all.push(item);
  }

  return all;
}

function parseBookMarkdown(markdown, fileName) {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");

  let bookTitle = "Unknown Book";
  let author = "";

  for (const line of lines) {
    if (line.startsWith("# ")) {
      bookTitle = line.slice(2).trim() || bookTitle;
      break;
    }
  }

  for (const line of lines) {
    const match = line.match(/^_by\s+(.+)_$/);
    if (match) {
      author = match[1].trim();
      break;
    }
  }

  const items = [];

  for (let i = 0; i < lines.length; i += 1) {
    if (!lines[i].startsWith("> ")) continue;

    const quoteLines = [lines[i].slice(2)];
    let j = i + 1;
    while (j < lines.length && lines[j].startsWith("> ")) {
      quoteLines.push(lines[j].slice(2));
      j += 1;
    }

    let location = "";
    let addedAt = "";
    while (j < lines.length && !lines[j].startsWith("> ")) {
      const raw = lines[j].trim();
      if (raw.startsWith("Location:")) location = raw.slice("Location:".length).trim();
      if (raw.startsWith("Added:")) addedAt = raw.slice("Added:".length).trim();
      if (raw === "---" || raw.startsWith("# ")) break;
      j += 1;
    }

    items.push({
      quote: quoteLines.join("\n").trim(),
      location,
      addedAt,
      bookTitle,
      author,
      fileName
    });

    i = j - 1;
  }

  return items.filter((item) => isMeaningfulQuote(item.quote));
}

function isMeaningfulQuote(quote) {
  if (!quote) return false;
  const compact = String(quote).replace(/\s+/g, "").trim();
  return compact.length >= 8;
}

function formatEmailBody(item) {
  const parts = [];
  parts.push(`"${item.quote}"`);
  parts.push("");
  parts.push(`Book: ${item.bookTitle}`);
  if (item.author) parts.push(`Author: ${item.author}`);
  if (item.location) parts.push(`Location: ${item.location}`);
  if (item.addedAt) parts.push(`Added: ${item.addedAt}`);
  parts.push("");
  parts.push("Sent by kindle_highlights weekly automation.");
  return parts.join("\n");
}

async function sendWithAppleMail({ to, subject, body }) {
  if (process.platform !== "darwin") {
    throw new Error("Automatic email sending is currently supported on macOS only (uses Apple Mail).");
  }

  await execFileAsync("osascript", [
    "-e",
    "on run argv",
    "-e",
    "set theRecipient to item 1 of argv",
    "-e",
    "set theSubject to item 2 of argv",
    "-e",
    "set theBody to item 3 of argv",
    "-e",
    'tell application "Mail"',
    "-e",
    "set newMessage to make new outgoing message with properties {subject:theSubject, content:theBody & return & return, visible:false}",
    "-e",
    "tell newMessage",
    "-e",
    "make new to recipient at end of to recipients with properties {address:theRecipient}",
    "-e",
    "send",
    "-e",
    "end tell",
    "-e",
    "end tell",
    "-e",
    "end run",
    to,
    subject,
    body
  ]);
}

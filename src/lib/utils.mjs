import fs from "node:fs/promises";
import path from "node:path";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import process from "node:process";

export function sanitizeFileName(name) {
  return name
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

export function slugifyForFile(name) {
  const sanitized = sanitizeFileName(name || "untitled");
  return sanitized || "untitled";
}

export async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

export async function writeUtf8(filePath, content) {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, content, "utf8");
}

export function dedupeByKey(items, keyFn) {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    const key = keyFn(item);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

export async function promptEnter(message) {
  const rl = readline.createInterface({ input, output });
  try {
    await rl.question(`${message}\nPress Enter when done... `);
  } finally {
    rl.close();
  }
}

export async function loadDotEnv(envFilePath) {
  try {
    const raw = await fs.readFile(envFilePath, "utf8");
    const lines = raw.split(/\r?\n/);
    for (const line of lines) {
      if (!line || line.trim().startsWith("#")) continue;
      const idx = line.indexOf("=");
      if (idx === -1) continue;
      const key = line.slice(0, idx).trim();
      const value = line.slice(idx + 1).trim().replace(/^['"]|['"]$/g, "");
      if (!key) continue;
      if (process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
  } catch {
    // Optional .env file. No-op if missing.
  }
}

export function toMarkdownForBook({ title, author, highlights }) {
  const header = [`# ${title || "Untitled"}`];
  if (author) header.push(`_by ${author}_`);
  header.push("", `Total highlights: ${highlights.length}`, "");

  const body = highlights
    .map((h) => {
      const parts = [];
      const quote = h.quote?.trim();
      const note = h.note?.trim();
      const location = h.location?.trim();
      const addedAt = h.addedAt?.trim();

      if (quote) parts.push(`> ${quote.replace(/\n+/g, "\n> ")}`);
      if (note) parts.push(`Note: ${note}`);
      if (location) parts.push(`Location: ${location}`);
      if (addedAt) parts.push(`Added: ${addedAt}`);

      return parts.join("\n");
    })
    .filter(Boolean)
    .join("\n\n---\n\n");

  return `${header.join("\n")}${body ? `\n${body}\n` : ""}`;
}

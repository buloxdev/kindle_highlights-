import fs from "node:fs/promises";
import path from "node:path";

import {
  dedupeByKey,
  ensureDir,
  slugifyForFile,
  toMarkdownForBook,
  writeUtf8
} from "./lib/utils.mjs";

export async function runEmailParser({ inputPath, outDir }) {
  const content = await readInputAsText(inputPath);
  const highlights = parseHighlights(content);
  if (!highlights.length) {
    throw new Error(
      "No highlights parsed from input. Export Kindle notes/highlights as text or .eml and try again."
    );
  }

  const byBook = groupByBook(highlights);
  await ensureDir(outDir);

  const books = Object.values(byBook);
  for (const book of books) {
    const deduped = dedupeByKey(book.highlights, (h) => `${h.quote}::${h.note}::${h.location}::${h.addedAt}`);
    const markdown = toMarkdownForBook({
      title: book.title,
      author: book.author,
      highlights: deduped
    });
    const filePath = path.join(outDir, `${slugifyForFile(book.title)}.md`);
    await writeUtf8(filePath, markdown);
    console.log(`[ok] Wrote ${filePath} (${deduped.length} highlights)`);
  }
}

async function readInputAsText(inputPath) {
  const data = await fs.readFile(inputPath);
  const lower = inputPath.toLowerCase();
  if (lower.endsWith(".eml")) {
    return extractTextFromEml(data.toString("utf8"));
  }
  return data.toString("utf8");
}

function extractTextFromEml(raw) {
  const boundaryMatch = raw.match(/boundary="?([^"\r\n;]+)"?/i);
  if (boundaryMatch) {
    const boundary = boundaryMatch[1];
    const parts = raw.split(`--${boundary}`);
    for (const part of parts) {
      if (!/content-type:\s*text\/plain/i.test(part)) continue;
      const chunk = part.split(/\r?\n\r?\n/).slice(1).join("\n\n");
      if (!chunk) continue;
      return decodeQuotedPrintable(chunk).trim();
    }
  }

  const body = raw.split(/\r?\n\r?\n/).slice(1).join("\n\n");
  return decodeQuotedPrintable(body || raw).trim();
}

function decodeQuotedPrintable(text) {
  return text
    .replace(/=\r?\n/g, "")
    .replace(/=([A-Fa-f0-9]{2})/g, (_, hex) => String.fromCharCode(Number.parseInt(hex, 16)));
}

function parseHighlights(rawText) {
  const normalized = rawText.replace(/\r\n/g, "\n");
  const fromClippings = parseMyClippingsFormat(normalized);
  if (fromClippings.length) return fromClippings;
  return parseLooseNotebookExport(normalized);
}

function parseMyClippingsFormat(text) {
  const entries = text
    .split("==========")
    .map((x) => x.trim())
    .filter(Boolean);

  const out = [];
  for (const entry of entries) {
    const lines = entry.split("\n").map((x) => x.trim());
    if (lines.length < 3) continue;

    const titleLine = lines[0];
    const metaLine = lines[1];
    const content = lines.slice(2).join("\n").trim();

    const { title, author } = parseTitleAndAuthor(titleLine);
    const type = /your note/i.test(metaLine) ? "note" : "highlight";
    const locationMatch = metaLine.match(/Location\s+([^|]+)/i);
    const addedMatch = metaLine.match(/Added on\s+(.+)$/i);
    const location = locationMatch?.[1]?.trim() || "";
    const addedAt = addedMatch?.[1]?.trim() || "";

    out.push({
      title,
      author,
      quote: type === "highlight" ? content : "",
      note: type === "note" ? content : "",
      location,
      addedAt
    });
  }
  return out;
}

function parseLooseNotebookExport(text) {
  const lines = text.split("\n");
  const out = [];
  let currentTitle = "Untitled";
  let currentAuthor = "";

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (!line) continue;

    if (/^title[:\s]/i.test(line)) {
      currentTitle = line.replace(/^title[:\s]*/i, "").trim() || currentTitle;
      continue;
    }
    if (/^author[:\s]/i.test(line)) {
      currentAuthor = line.replace(/^author[:\s]*/i, "").trim();
      continue;
    }

    const quoteMatch = line.match(/^["“](.+)["”]$/);
    if (quoteMatch) {
      const quote = quoteMatch[1].trim();
      const next = lines[i + 1]?.trim() || "";
      const locationMatch = next.match(/Location[:\s]+(.+)$/i);
      out.push({
        title: currentTitle,
        author: currentAuthor,
        quote,
        note: "",
        location: locationMatch?.[1]?.trim() || "",
        addedAt: ""
      });
      continue;
    }

    const bulletMatch = line.match(/^[-*]\s+(.+)/);
    if (bulletMatch) {
      const textValue = bulletMatch[1].trim();
      out.push({
        title: currentTitle,
        author: currentAuthor,
        quote: textValue,
        note: "",
        location: "",
        addedAt: ""
      });
    }
  }

  return out;
}

function parseTitleAndAuthor(line) {
  const match = line.match(/^(.*)\s+\(([^)]+)\)\s*$/);
  if (!match) {
    return { title: line.trim() || "Untitled", author: "" };
  }
  return { title: match[1].trim() || "Untitled", author: match[2].trim() };
}

function groupByBook(entries) {
  const grouped = {};
  for (const entry of entries) {
    const key = `${entry.title}::${entry.author}`;
    if (!grouped[key]) {
      grouped[key] = {
        title: entry.title || "Untitled",
        author: entry.author || "",
        highlights: []
      };
    }
    grouped[key].highlights.push({
      quote: entry.quote || "",
      note: entry.note || "",
      location: entry.location || "",
      addedAt: entry.addedAt || ""
    });
  }
  return grouped;
}

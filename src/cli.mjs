#!/usr/bin/env node
import path from "node:path";
import process from "node:process";

function getOption(args, name, defaultValue = undefined) {
  const index = args.indexOf(name);
  if (index === -1) return defaultValue;
  const next = args[index + 1];
  if (!next || next.startsWith("--")) return true;
  return next;
}

function hasFlag(args, name) {
  return args.includes(name);
}

function printUsage() {
  console.log(`Usage:
  node src/cli.mjs scrape [--headed] [--headless] [--out-dir ./output/highlights] [--session-dir ./.session/kindle] [--limit-books N]
  node src/cli.mjs parse-email --input ./exports/kindle.txt [--out-dir ./output/highlights]
  node src/cli.mjs weekly-email [--send] [--to you@example.com] [--out-dir ./output/highlights]
`);
}

async function main() {
  const [, , command, ...args] = process.argv;
  if (!command || hasFlag(args, "--help") || hasFlag(args, "-h")) {
    printUsage();
    process.exit(command ? 0 : 1);
  }

  if (command === "scrape") {
    const { runKindleScrape } = await import("./kindle-scrape.mjs");
    const outDir = path.resolve(getOption(args, "--out-dir", "./output/highlights"));
    const sessionDir = path.resolve(getOption(args, "--session-dir", "./.session/kindle"));
    const headed = hasFlag(args, "--headless")
      ? false
      : hasFlag(args, "--headed")
        ? true
        : true;
    const limitBooksRaw = getOption(args, "--limit-books", undefined);
    const limitBooks = limitBooksRaw ? Number.parseInt(limitBooksRaw, 10) : undefined;

    await runKindleScrape({
      headed,
      outDir,
      sessionDir,
      limitBooks: Number.isNaN(limitBooks) ? undefined : limitBooks
    });
    return;
  }

  if (command === "parse-email") {
    const { runEmailParser } = await import("./email-parser.mjs");
    const input = getOption(args, "--input", undefined);
    if (!input || typeof input !== "string") {
      throw new Error("Missing --input path for parse-email command.");
    }
    const outDir = path.resolve(getOption(args, "--out-dir", "./output/highlights"));
    await runEmailParser({
      inputPath: path.resolve(input),
      outDir
    });
    return;
  }

  if (command === "weekly-email") {
    const { runWeeklyHighlightEmail } = await import("./weekly-email.mjs");
    const outDir = path.resolve(getOption(args, "--out-dir", "./output/highlights"));
    const recipientOverride = getOption(args, "--to", null);
    const send = hasFlag(args, "--send");

    await runWeeklyHighlightEmail({
      outDir,
      recipientOverride,
      send
    });
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}

main().catch((error) => {
  console.error(`[error] ${error.message}`);
  process.exit(1);
});

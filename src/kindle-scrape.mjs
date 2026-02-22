import path from "node:path";

import { chromium } from "playwright";

import {
  dedupeByKey,
  ensureDir,
  loadDotEnv,
  slugifyForFile,
  toMarkdownForBook,
  writeUtf8
} from "./lib/utils.mjs";
import { resolveAmazonCredentials } from "./lib/keychain.mjs";

export async function runKindleScrape({ headed, outDir, sessionDir, limitBooks }) {
  await loadDotEnv(path.resolve(".env"));
  const notebookUrl = process.env.AMAZON_NOTEBOOK_URL || "https://read.amazon.com/notebook";

  const credentials = await resolveAmazonCredentials();
  if (credentials.email && !process.env.AMAZON_EMAIL) process.env.AMAZON_EMAIL = credentials.email;
  if (credentials.password && !process.env.AMAZON_PASSWORD) process.env.AMAZON_PASSWORD = credentials.password;

  if (credentials.source === "keychain") {
    console.log(`[info] Using Amazon credentials from macOS Keychain (account=${credentials.account}).`);
  } else if (credentials.source === "mixed") {
    console.log("[info] Using Amazon credentials from mixed sources (.env + Keychain).");
  }

  await ensureDir(outDir);
  await ensureDir(sessionDir);

  console.log(`[info] Opening browser (headed=${headed ? "yes" : "no"})...`);
  const context = await chromium.launchPersistentContext(sessionDir, {
    headless: !headed,
    viewport: { width: 1440, height: 900 }
  });

  try {
    const page = context.pages()[0] || (await context.newPage());
    await page.goto(notebookUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });

    await ensureNotebookReady(page, {
      headed,
      notebookUrl,
      credentialSource: credentials.source,
      keychainMeta: credentials
    });

    const books = await getBooks(page);
    if (!books.length) {
      throw new Error("No books found in Kindle notebook. Confirm your account has highlights.");
    }

    const selectedBooks = typeof limitBooks === "number" && limitBooks > 0 ? books.slice(0, limitBooks) : books;
    console.log(`[info] Found ${books.length} books. Processing ${selectedBooks.length}.`);

    const usedFileNames = new Set();

    for (const [idx, book] of selectedBooks.entries()) {
      console.log(`[info] Extracting (${idx + 1}/${selectedBooks.length}): ${book.title}`);

      try {
        await selectBook(page, book, notebookUrl);
      } catch (error) {
        console.warn(`[warn] Could not open "${book.title}": ${error.message}`);
        continue;
      }

      let fullBook;
      try {
        fullBook = await loadAllHighlightsForCurrentBook(page, book);
      } catch (error) {
        console.warn(`[warn] Mismatch after opening "${book.title}", retrying once.`);
        await selectBook(page, book, notebookUrl);
        fullBook = await loadAllHighlightsForCurrentBook(page, book);
      }

      const resolvedTitle = pickBestTitle(fullBook.title, book.title);
      const resolvedAuthor = fullBook.author || book.author || "";

      const markdown = toMarkdownForBook({
        title: resolvedTitle,
        author: resolvedAuthor,
        highlights: fullBook.highlights
      });

      const fileName = chooseUniqueFileName(resolvedTitle, usedFileNames);
      const filePath = path.join(outDir, fileName);
      await writeUtf8(filePath, markdown);
      console.log(`[ok] Wrote ${filePath} (${fullBook.highlights.length} highlights)`);
    }
  } finally {
    await context.close();
  }
}

async function ensureNotebookReady(page, { headed, notebookUrl, credentialSource, keychainMeta }) {
  await waitForEither(page, [
    "#kp-notebook-library",
    "input[name='email']",
    "input[name='password']",
    "#ap_email",
    "#ap_password",
    "input[name='otpCode']",
    "input[name='cvf_captcha_input']"
  ]);

  if (await isVisible(page, "#kp-notebook-library")) return;

  await attemptCredentialLogin(page);
  await page.waitForTimeout(1_500);
  if (await isVisible(page, "#kp-notebook-library")) return;

  if (!headed) {
    if (await isChallengePage(page)) {
      throw new Error(
        "Amazon presented CAPTCHA/MFA in headless mode. Run with --headed, complete the challenge once, then rerun headless."
      );
    }
    throw new Error(
      "Kindle notebook requires login. Run `npm run kindle:scrape -- --headed`, sign in to Amazon in the opened browser, then rerun headless."
    );
  }

  const loginHint = credentialSource === "none"
    ? `Sign in to Amazon in the browser window (or set AMAZON_EMAIL/AMAZON_PASSWORD in .env, or store Keychain services ${keychainMeta.emailService} and ${keychainMeta.passwordService}).`
    : "Complete any remaining CAPTCHA/MFA challenge in the browser.";
  console.log(`[warn] ${loginHint}`);

  await page.waitForSelector("#kp-notebook-library", { timeout: 300_000 }).catch(() => null);
  if (!(await isVisible(page, "#kp-notebook-library"))) {
    throw new Error(
      "Timed out waiting for Kindle notebook after 5 minutes in headed mode. Confirm login completed successfully."
    );
  }

  await page.goto(notebookUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForSelector("#kp-notebook-library", { timeout: 60_000 }).catch(() => null);
  if (!(await isVisible(page, "#kp-notebook-library"))) {
    throw new Error("Login did not reach Kindle notebook. Try headed mode again and verify account access.");
  }
}

async function attemptCredentialLogin(page) {
  const email = process.env.AMAZON_EMAIL;
  const password = process.env.AMAZON_PASSWORD;
  if (!email || !password) {
    return;
  }

  const emailSelector = (await isVisible(page, "#ap_email")) ? "#ap_email" : "input[name='email']";
  if (await isVisible(page, emailSelector)) {
    await page.fill(emailSelector, email);
    const continueSelector = (await isVisible(page, "input#continue")) ? "input#continue" : "input[type='submit']";
    await page.click(continueSelector);
    await page.waitForTimeout(600);
  }

  const passwordSelector = (await isVisible(page, "#ap_password")) ? "#ap_password" : "input[name='password']";
  if (await isVisible(page, passwordSelector)) {
    await page.fill(passwordSelector, password);
    const submitSelector = (await isVisible(page, "#signInSubmit")) ? "#signInSubmit" : "input[type='submit']";
    await page.click(submitSelector);
  }
}

async function isChallengePage(page) {
  return (
    (await isVisible(page, "input[name='otpCode']")) ||
    (await isVisible(page, "#auth-mfa-otpcode")) ||
    (await isVisible(page, "input[name='cvf_captcha_input']")) ||
    (await isVisible(page, "form[action*='validateCaptcha']"))
  );
}

async function getBooks(page) {
  const books = await page.evaluate(() => {
    const bookEls = [
      ...document.querySelectorAll("#kp-notebook-library .kp-notebook-library-each-book"),
      ...document.querySelectorAll("[id^='kp-notebook-library-each-book']")
    ];
    const seen = new Set();
    const out = [];
    for (const [index, el] of bookEls.entries()) {
      const title =
        el.querySelector(".kp-notebook-searchable")?.textContent?.trim() ||
        el.querySelector(".kp-notebook-metadata")?.textContent?.trim() ||
        el.textContent?.trim() ||
        `Book ${index + 1}`;
      const author = el.querySelector(".kp-notebook-metadata")?.textContent?.trim() || "";
      const asin = (el.id || "").trim();
      const key = `${title}::${author}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ index, title, author, asin });
    }
    return out;
  });
  return dedupeByKey(books, (b) => `${b.title}::${b.author}`);
}

async function selectBook(page, book, notebookUrl) {
  if (book.asin) {
    const targetUrl = buildNotebookUrl(notebookUrl, book.asin);
    await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForSelector("#kp-notebook-annotations", { timeout: 20_000 });
    await page.waitForTimeout(500);
    return;
  }

  const clicked = await page.evaluate((candidate) => {
    const normalize = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

    const cards = [
      ...document.querySelectorAll("#kp-notebook-library .kp-notebook-library-each-book"),
      ...document.querySelectorAll("[id^='kp-notebook-library-each-book']")
    ];
    if (!cards.length) return false;

    const expected = normalize(candidate.title);
    let target = cards.find((el) => normalize(el.textContent || "").includes(expected));

    if (!target && Number.isInteger(candidate.index) && candidate.index >= 0 && candidate.index < cards.length) {
      target = cards[candidate.index];
    }

    if (!target) return false;

    const clickable = target.querySelector("a, button") || target;
    clickable.scrollIntoView({ block: "center", inline: "nearest" });
    clickable.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    clickable.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    clickable.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    return true;
  }, book);

  if (!clicked) {
    throw new Error("no matching book card found");
  }

  await page.waitForSelector("#kp-notebook-annotations", { timeout: 20_000 });
  await page.waitForTimeout(500);
}

async function loadAllHighlightsForCurrentBook(page, expectedBook) {
  const bookMeta = await page.evaluate(() => {
    const title =
      document.querySelector("#kp-notebook-annotations .kp-notebook-searchable")?.textContent?.trim() ||
      document.querySelector(".kp-notebook-searchable")?.textContent?.trim() ||
      "Untitled";
    const author = document.querySelector(".kp-notebook-metadata")?.textContent?.trim() || "";
    return { title, author };
  });

  if (
    expectedBook?.title &&
    bookMeta.title &&
    bookMeta.title !== "Untitled" &&
    !titlesLookSimilar(bookMeta.title, expectedBook.title)
  ) {
    throw new Error(`Expected \"${expectedBook.title}\" but page shows \"${bookMeta.title}\"`);
  }

  const all = [];
  const seenPageFingerprints = new Set();

  for (let pageNum = 1; pageNum <= 250; pageNum += 1) {
    await page.waitForTimeout(400);
    const currentHighlights = await extractHighlightsOnPage(page);
    for (const h of currentHighlights) all.push(h);

    const fingerprint = JSON.stringify(currentHighlights.slice(0, 3));
    if (seenPageFingerprints.has(fingerprint)) {
      break;
    }
    seenPageFingerprints.add(fingerprint);

    const advanced = await clickNextPageIfAvailable(page);
    if (!advanced) break;
  }

  const highlights = dedupeByKey(all, (h) => `${h.quote}::${h.note}::${h.location}::${h.addedAt}`);
  return { ...bookMeta, highlights };
}

async function extractHighlightsOnPage(page) {
  return page.evaluate(() => {
    const rows = [...document.querySelectorAll("#kp-notebook-annotations .kp-notebook-row-separator")];
    const out = [];

    const pushFromRow = (row) => {
      const quote =
        row.querySelector(".kp-notebook-highlight span")?.textContent?.trim() ||
        row.querySelector(".kp-notebook-highlight")?.textContent?.trim() ||
        "";
      const note = row.querySelector(".kp-notebook-note")?.textContent?.trim() || "";
      const metadata = row.querySelector(".kp-notebook-metadata")?.textContent?.trim() || "";
      const locationMatch = metadata.match(/Location[:\s]+([^|]+)/i);
      const addedMatch = metadata.match(/Added on[:\s]+(.+)$/i);
      const location = locationMatch?.[1]?.trim() || metadata;
      const addedAt = addedMatch?.[1]?.trim() || "";

      if (!quote && !note) return;
      out.push({ quote, note, location, addedAt });
    };

    if (rows.length) {
      rows.forEach(pushFromRow);
      return out;
    }

    const generic = [...document.querySelectorAll("[id^='annotation-'], .kp-notebook-highlight")];
    for (const el of generic) {
      const quote = el.textContent?.trim();
      if (!quote) continue;
      out.push({ quote, note: "", location: "", addedAt: "" });
    }
    return out;
  });
}

async function clickNextPageIfAvailable(page) {
  const nextSelectors = [
    "#kp-notebook-annotations-next-page-start",
    "#kp-notebook-annotations-next-page",
    ".kp-notebook-pagination-button-next"
  ];

  for (const selector of nextSelectors) {
    if (!(await isVisible(page, selector))) continue;
    const disabled = await page.$eval(selector, (el) => {
      const attrDisabled = el.getAttribute("disabled") !== null;
      const classDisabled = el.classList.contains("a-disabled") || el.classList.contains("kp-notebook-disabled");
      const ariaDisabled = el.getAttribute("aria-disabled") === "true";
      return attrDisabled || classDisabled || ariaDisabled;
    });
    if (disabled) return false;
    await Promise.all([page.waitForLoadState("domcontentloaded").catch(() => {}), page.click(selector)]);
    return true;
  }
  return false;
}

async function waitForEither(page, selectors) {
  await Promise.race([
    ...selectors.map((selector) => page.waitForSelector(selector, { timeout: 30_000 }).catch(() => null)),
    page.waitForTimeout(30_000)
  ]);
}

async function isVisible(page, selector) {
  const el = await page.$(selector);
  if (!el) return false;
  return el.isVisible();
}

function normalizeTitle(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function titlesLookSimilar(a, b) {
  const left = normalizeTitle(a);
  const right = normalizeTitle(b);
  if (!left || !right) return false;
  return left.includes(right) || right.includes(left);
}

function pickBestTitle(extractedTitle, fallbackTitle) {
  if (extractedTitle && extractedTitle !== "Untitled") return extractedTitle;
  if (fallbackTitle) return fallbackTitle;
  return "Untitled";
}

function chooseUniqueFileName(title, usedFileNames) {
  const base = slugifyForFile(title || "Untitled");
  let candidate = `${base}.md`;
  let n = 2;
  while (usedFileNames.has(candidate)) {
    candidate = `${base} (${n}).md`;
    n += 1;
  }
  usedFileNames.add(candidate);
  return candidate;
}

function buildNotebookUrl(baseUrl, asin) {
  const url = new URL(baseUrl);
  url.searchParams.set("asin", asin);
  return url.toString();
}

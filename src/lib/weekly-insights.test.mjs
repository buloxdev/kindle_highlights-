import test from "node:test";
import assert from "node:assert/strict";

import {
  classifyQuoteThemes,
  extractQuoteSignals,
  generateWeeklyInsights,
  renderInsightTemplates
} from "./weekly-insights.mjs";

function assertInsightShape(insights) {
  assert.equal(typeof insights.action, "string");
  assert.equal(typeof insights.reflection, "string");
  assert.equal(typeof insights.caution, "string");
  assert.ok(insights.action.trim().length > 10, "action should be non-empty");
  assert.ok(insights.reflection.trim().length > 10, "reflection should be non-empty");
  assert.ok(insights.caution.trim().length > 10, "caution should be non-empty");

  const unique = new Set([
    insights.action.trim().toLowerCase(),
    insights.reflection.trim().toLowerCase(),
    insights.caution.trim().toLowerCase()
  ]);
  assert.equal(unique.size, 3, "insight bullets should be distinct");
}

test("leadership/teamwork quote produces valid mixed insights", () => {
  const quote = "At Nvidia, you embrace your smart colleagues and don't feel threatened. This is not about your ego. This is about whether we make it or not.";
  const insights = generateWeeklyInsights({ quote });
  assertInsightShape(insights);
  assert.ok(typeof insights.meta.primaryTheme === "string" && insights.meta.primaryTheme.length > 0);
});

test("resilience/setback quote produces valid insights", () => {
  const quote = "Do not let one bad day rewrite your view of the whole week.";
  const insights = generateWeeklyInsights({ quote });
  assertInsightShape(insights);
});

test("ambiguous quote falls back cleanly", () => {
  const quote = "The road ahead was open and full of possibility.";
  const insights = generateWeeklyInsights({ quote });
  assertInsightShape(insights);
  assert.ok(insights.meta.primaryTheme);
});

test("short quote still produces concise outputs", () => {
  const quote = "Keep going.";
  const insights = generateWeeklyInsights({ quote });
  assertInsightShape(insights);
  assert.match(insights.action, /week/i);
});

test("punctuation-heavy quote parses signals and renders", () => {
  const quote = "What if I am wrong; but what if I am also underestimating what is possible?";
  const signals = extractQuoteSignals(quote);
  assert.equal(signals.hasQuestion, true);
  assert.equal(signals.hasColonOrSemicolon, true);
  assert.equal(signals.hasContrast, true);

  const themes = classifyQuoteThemes(quote);
  const rendered = renderInsightTemplates(themes, signals);
  assert.equal(typeof rendered.action, "string");
  assert.equal(typeof rendered.reflection, "string");
  assert.equal(typeof rendered.caution, "string");
});

test("generation is deterministic for same quote", () => {
  const item = { quote: "Pick one uncertain decision this week and define a low-cost experiment instead of waiting for certainty." };
  const a = generateWeeklyInsights(item);
  const b = generateWeeklyInsights(item);
  assert.deepEqual(a, b);
});

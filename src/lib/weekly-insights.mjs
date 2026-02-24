function normalizeText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function lowerText(value) {
  return normalizeText(value).toLowerCase();
}

function hashString(value) {
  let h = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function chooseDeterministic(options, seed, offset = 0) {
  if (!Array.isArray(options) || options.length === 0) return "";
  const index = (seed + offset) % options.length;
  return options[index];
}

const THEME_KEYWORDS = {
  discipline: ["discipline", "habit", "practice", "routine", "consistent", "consistency", "daily"],
  courage: ["courage", "brave", "fear", "risk", "bold", "fortune", "uncertain"],
  relationships: ["friend", "colleague", "team", "people", "together", "cooperate", "trust"],
  thinking: ["think", "decision", "judgment", "reason", "strategy", "focus", "mind"],
  resilience: ["setback", "failure", "tough", "hard", "struggle", "resilience", "recover"],
  focus: ["focus", "attention", "distraction", "priorit", "important", "one thing"],
  learning: ["learn", "study", "curious", "question", "improve", "growth", "experiment"],
  leadership: ["lead", "responsibility", "example", "owner", "standard", "serve"],
  gratitude: ["grateful", "gratitude", "humble", "blessing", "thankful"],
  uncertainty: ["uncertain", "unknown", "possibility", "chance", "guess", "experiment", "open"]
};

const THEME_TEMPLATES = {
  discipline: {
    action: [
      "Pick one repeatable behavior this quote points to, and do it on the same day and time for the next 7 days.",
      "Turn the idea in this quote into a 10-minute routine and protect that block on your calendar this week.",
      "Choose one habit to reinforce this week and track it with a simple yes/no check each day."
    ],
    reflection: [
      "Which result am I expecting this week without committing to the routine that produces it?",
      "Where would consistency beat intensity for me over the next 7 days?",
      "What small behavior, repeated, would make this quote true in my life by next Monday?"
    ],
    caution: [
      "Do not over-engineer the system; keep the habit small enough that you will actually repeat it.",
      "Avoid treating one good day as success; the win is repetition, not a single burst.",
      "Do not add three habits at once; choose one and make it durable first."
    ]
  },
  courage: {
    action: [
      "Identify one decision you have been delaying and take the next concrete step on it before Wednesday.",
      "Choose one low-regret risk this week and commit to a deadline for acting on it.",
      "Have one conversation this week that you have been avoiding because it feels uncomfortable."
    ],
    reflection: [
      "What am I protecting: a real value, or just temporary comfort?",
      "If fear were not making the decision, what would the next step look like this week?",
      "Which risk feels scary now but becomes expensive if I delay it another month?"
    ],
    caution: [
      "Do not confuse courage with impulsiveness; define the next step before you act.",
      "Avoid all-or-nothing thinking; a small courageous move still counts.",
      "Do not wait for certainty before acting; aim for clarity on the next step only."
    ]
  },
  relationships: {
    action: [
      "Send one message of appreciation this week to someone whose work helps you but often goes unnoticed.",
      "Pick one collaboration this week and ask a better question before offering your solution.",
      "Improve one relationship this week by making a specific request instead of assuming alignment."
    ],
    reflection: [
      "Where am I reacting to people instead of getting curious about what they are carrying?",
      "Who makes me better, and how can I support them this week in a concrete way?",
      "What assumption about a teammate or partner should I verify instead of repeating?"
    ],
    caution: [
      "Do not let ego turn someone else's strength into a threat; use it as leverage for the team.",
      "Avoid vague appreciation; be specific about what they did and why it mattered.",
      "Do not assume silence means agreement; confirm shared expectations directly."
    ]
  },
  thinking: {
    action: [
      "Use this quote as a decision filter once this week: write down the decision, options, and your criteria before choosing.",
      "Block 20 minutes this week for uninterrupted thinking on one important problem with no notifications.",
      "Before one major decision this week, list the top 3 assumptions you are making and test one of them."
    ],
    reflection: [
      "Which assumption am I treating as a fact right now?",
      "Where would slower thinking improve the quality of my next decision this week?",
      "What am I optimizing for that I have not written down explicitly?"
    ],
    caution: [
      "Do not mistake analysis for progress; end thinking time with one committed next action.",
      "Avoid letting urgency choose your priorities for you this week.",
      "Do not collect more inputs than you can use; identify the one signal that matters most."
    ]
  },
  resilience: {
    action: [
      "Pick one setback from the last two weeks and write a short recovery plan with one action for the next 48 hours.",
      "Define one way to make your process more resilient this week before the next hard day arrives.",
      "This week, measure progress by showing up after friction, not by having perfect conditions."
    ],
    reflection: [
      "What story am I telling about this obstacle that makes it heavier than it is?",
      "How have I handled something similar before, and what worked that I can reuse this week?",
      "What would progress look like if I expected resistance instead of being surprised by it?"
    ],
    caution: [
      "Do not let one bad day rewrite your view of the whole week.",
      "Avoid making permanent conclusions from temporary fatigue.",
      "Do not respond to a setback by abandoning the system entirely; reset the next step instead."
    ]
  },
  focus: {
    action: [
      "Choose one priority for this week and define what 'done' looks like by Monday night.",
      "Create one distraction barrier this week (mute, block, or remove) during your highest-value work block.",
      "Use a single 30-minute sprint this week on your most important task before checking messages."
    ],
    reflection: [
      "What is stealing attention from the work that matters most this week?",
      "Which commitment should get more attention, and which one should get less?",
      "If I could only complete one meaningful thing this week, what would it be?"
    ],
    caution: [
      "Do not confuse motion with priority; a full day can still miss the important work.",
      "Avoid starting with low-value tasks just because they are easy to finish.",
      "Do not let notifications set your agenda during your best hours."
    ]
  },
  learning: {
    action: [
      "Turn this quote into one small experiment this week and define what result would count as learning.",
      "Write down one question this quote raises for you and spend 15 minutes finding a better answer this week.",
      "Teach one idea from this quote to someone else this week to test your understanding."
    ],
    reflection: [
      "What am I trying to improve without a feedback loop?",
      "Which question, if answered this week, would unlock better decisions next week?",
      "Where am I pretending to know instead of staying curious?"
    ],
    caution: [
      "Do not collect insights without applying one of them this week.",
      "Avoid treating inspiration as mastery; test the idea under real conditions.",
      "Do not make the experiment so big that you cannot learn from it quickly."
    ]
  },
  leadership: {
    action: [
      "Choose one standard you want to raise this week and model it first before asking others to change.",
      "Make one ownership decision explicit this week: who owns what by when.",
      "Have one short alignment check this week to remove ambiguity for someone you work with."
    ],
    reflection: [
      "What behavior am I rewarding with my attention this week?",
      "Where do I need to lead with clarity instead of assumptions?",
      "What standard am I asking others to meet that I am not demonstrating consistently?"
    ],
    caution: [
      "Do not confuse control with leadership; clarity and accountability scale better.",
      "Avoid vague expectations; unclear ownership creates avoidable friction.",
      "Do not wait for a bigger moment to lead; your weekly habits set the tone."
    ]
  },
  gratitude: {
    action: [
      "Write down three tailwinds helping you this week and use one of them intentionally on your hardest task.",
      "Thank one person this week for a specific contribution that made your work or life easier.",
      "Start one workday this week by naming what is already working before planning fixes."
    ],
    reflection: [
      "What support or advantage am I undercounting right now?",
      "How would my decisions change this week if I started from gratitude instead of scarcity?",
      "Which person or resource am I benefiting from without acknowledging enough?"
    ],
    caution: [
      "Do not let gratitude become passivity; appreciate what is working and still take action.",
      "Avoid generic thanks; specificity deepens both memory and relationship.",
      "Do not focus only on headwinds; that can distort your judgment about what is possible."
    ]
  },
  uncertainty: {
    action: [
      "Pick one uncertain decision this week and define a low-cost experiment instead of waiting for full certainty.",
      "Break one unknown into a question you can answer in under 30 minutes this week.",
      "Use a 'next best test' mindset once this week: choose a reversible step and learn from it."
    ],
    reflection: [
      "What information am I waiting for that I could replace with a small test?",
      "Where am I demanding certainty when a reversible decision would be enough?",
      "What is the smallest experiment that would reduce the most uncertainty this week?"
    ],
    caution: [
      "Do not let uncertainty freeze momentum; choose a reversible next step.",
      "Avoid turning every unknown into a research project.",
      "Do not confuse possibility with probability; test assumptions before committing heavily."
    ]
  },
  generic: {
    action: [
      "Pick one practical behavior this quote suggests and apply it once this week in a real decision or conversation.",
      "Use this quote as a weekly theme and choose one action by Tuesday that makes it concrete.",
      "Write one sentence about how this quote applies to your current week, then act on that sentence within 48 hours."
    ],
    reflection: [
      "What is this quote revealing about how I am approaching this week?",
      "Where does this quote challenge my default behavior right now?",
      "If this quote were true for me this week, what would I do differently by Friday?"
    ],
    caution: [
      "Do not stop at agreement; convert the quote into one observable action.",
      "Avoid making this quote motivational wallpaper; tie it to a real choice this week.",
      "Do not over-apply one idea to everything; use it where it fits and ignore where it does not."
    ]
  }
};

export function extractQuoteSignals(quote) {
  const normalized = normalizeText(quote);
  const lower = normalized.toLowerCase();
  const words = normalized ? normalized.split(/\s+/) : [];
  const wordCount = words.length;

  let lengthBucket = "short";
  if (wordCount >= 30) lengthBucket = "long";
  else if (wordCount >= 14) lengthBucket = "medium";

  return {
    normalized,
    lower,
    wordCount,
    lengthBucket,
    hasQuestion: /\?/.test(normalized),
    hasColonOrSemicolon: /[:;]/.test(normalized),
    hasContrast: /\b(but|however|instead|yet|although)\b/i.test(normalized),
    hasImperativeVerb: /\b(do|start|stop|choose|build|focus|learn|act|write|ask|decide|take)\b/i.test(normalized),
    firstPerson: /\b(i|i'm|i’ve|i'd|me|my|we|our|us)\b/i.test(normalized),
    emotionalTone: /\b(fear|hope|grateful|angry|calm|tough|hard|joy|stress)\b/i.test(normalized)
  };
}

export function classifyQuoteThemes(quote) {
  const signals = extractQuoteSignals(quote);
  const scores = {};

  for (const [theme, keywords] of Object.entries(THEME_KEYWORDS)) {
    let score = 0;
    for (const keyword of keywords) {
      if (signals.lower.includes(keyword)) score += 1;
    }
    if (score > 0) scores[theme] = score;
  }

  if (signals.hasContrast) scores.thinking = (scores.thinking || 0) + 1;
  if (signals.firstPerson) scores.learning = (scores.learning || 0) + 1;
  if (signals.emotionalTone) scores.resilience = (scores.resilience || 0) + 1;
  if (signals.hasQuestion) scores.learning = (scores.learning || 0) + 1;

  const rankedThemes = Object.entries(scores)
    .map(([name, score]) => ({ name, score }))
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));

  const primaryTheme = rankedThemes[0]?.name || "generic";

  return {
    primaryTheme,
    rankedThemes,
    scores,
    signals
  };
}

export function renderInsightTemplates(themePack, quoteSignals) {
  const themeName = themePack?.primaryTheme && THEME_TEMPLATES[themePack.primaryTheme]
    ? themePack.primaryTheme
    : "generic";

  const themeTemplates = THEME_TEMPLATES[themeName];
  const genericTemplates = THEME_TEMPLATES.generic;
  const seed = hashString(`${quoteSignals.normalized}|${themeName}|${quoteSignals.wordCount}`);

  let action = chooseDeterministic(themeTemplates.action, seed, 1) || chooseDeterministic(genericTemplates.action, seed, 2);
  let reflection = chooseDeterministic(themeTemplates.reflection, seed, 3) || chooseDeterministic(genericTemplates.reflection, seed, 4);
  let caution = chooseDeterministic(themeTemplates.caution, seed, 5) || chooseDeterministic(genericTemplates.caution, seed, 6);

  if (quoteSignals.hasQuestion) {
    reflection = chooseDeterministic([
      "What question is this quote asking me to answer in my real week, not just in theory?",
      "If I treated this quote as a question, what honest answer would my current calendar give?",
      "What would change this week if I acted on the best question hidden inside this quote?"
    ], seed, 7);
  }

  if (quoteSignals.lengthBucket === "short") {
    action = action.replace(" this week", " this week (keep it small)");
  }

  if (quoteSignals.hasImperativeVerb && !/Avoid|Do not/.test(caution)) {
    caution = `Do not turn a strong idea into pressure; pick one small action and let repetition build confidence.`;
  }

  return { action, reflection, caution };
}

export function generateWeeklyInsights(item) {
  const quote = normalizeText(item?.quote || "");
  const signals = extractQuoteSignals(quote);
  const themePack = classifyQuoteThemes(quote);
  const base = renderInsightTemplates(themePack, signals);

  const slots = [
    { key: "action", label: "Action", value: normalizeText(base.action) },
    { key: "reflection", label: "Reflect", value: normalizeText(base.reflection) },
    { key: "caution", label: "Watch-out", value: normalizeText(base.caution) }
  ];

  const seen = new Set();
  for (const slot of slots) {
    let candidate = slot.value;
    if (!candidate) {
      candidate = fallbackForSlot(slot.key);
    }

    let suffixCounter = 0;
    while (seen.has(candidate.toLowerCase())) {
      suffixCounter += 1;
      candidate = `${candidate} (${suffixCounter + 1})`;
    }

    seen.add(candidate.toLowerCase());
    slot.value = candidate;
  }

  return {
    action: slots[0].value,
    reflection: slots[1].value,
    caution: slots[2].value,
    meta: {
      primaryTheme: themePack.primaryTheme,
      themes: themePack.rankedThemes.map((t) => t.name),
      lengthBucket: signals.lengthBucket,
      wordCount: signals.wordCount
    }
  };
}

function fallbackForSlot(key) {
  const generic = THEME_TEMPLATES.generic;
  if (key === "action") return generic.action[0];
  if (key === "reflection") return generic.reflection[0];
  return generic.caution[0];
}

const express = require("express");
const cors = require("cors");
const axios = require("axios");
require("dotenv").config();

const OpenAI = require("openai");

const app = express();
app.use(cors());
app.use(express.json());

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

/**
 * PAGES
 */
const pages = [
  { name: "home", url: "https://www.washburn.edu" },
  { name: "apply", url: "https://www.washburn.edu/apply" },
  { name: "promise", url: "https://www.washburn.edu/promise" },
  { name: "snco", url: "https://www.washburn.edu/snco" },
  { name: "neks", url: "https://www.washburn.edu/neksadvantage" },
  { name: "resliving", url: "https://www.washburn.edu/resliving" },
  { name: "scholarships", url: "https://www.washburn.edu/scholarships" },
  { name: "topeka", url: "https://www.washburn.edu/topeka" }
];

/**
 * CLEAN HTML
 */
function extractText(html = "") {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<\/?[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 12000);
}

/**
 * ROLE MAP
 */
function getRole(name) {
  if (name === "home") return "awareness";
  if (name === "apply") return "conversion";
  if (name === "scholarships") return "financial-aid";
  if (name === "resliving") return "experience";
  return "support";
}

/**
 * 🔍 DETERMINSITIC SIGNAL ENGINE (THIS FIXES YOUR “WHY” PROBLEM)
 */
function analyzeSignals(html) {
  const lower = html.toLowerCase();

  const hasH1 = lower.includes("<h1>");
  const hasNav = lower.includes("<nav>");
  const hasTitle = lower.includes("<title>");

  const ctaSignals = [
    "apply",
    "visit",
    "tour",
    "request",
    "admission",
    "enroll",
    "start",
    "submit",
    "schedule"
  ];

  let ctaCount = 0;
  for (const s of ctaSignals) {
    if (lower.includes(s)) ctaCount++;
  }

  const textLengthScore = Math.min(html.length / 100, 100);

  const structureScore =
    (hasTitle ? 25 : 0) +
    (hasH1 ? 25 : 0) +
    (hasNav ? 20 : 0);

  const ctaScore = Math.min(ctaCount * 10, 100);

  const trustScore = lower.includes("about") || lower.includes("mission")
    ? 60
    : 40;

  return {
    ctaScore,
    structureScore,
    textLengthScore: Math.round(textLengthScore),
    trustScore
  };
}

/**
 * SAFE FALLBACK
 */
function fallback(page, err) {
  return {
    url: page.url,
    status: "error",
    geoScore: 0,
    clarityScore: 0,
    why: [`System error: ${err.message}`],
    issues: ["Analysis failed"],
    fixes: ["Check API key or response format"],
    conversionLeaks: [],
    breakdown: null
  };
}

/**
 * AI ENGINE (USES BREAKDOWN SIGNALS)
 */
async function analyzePage(page, html, context) {
  const role = getRole(page.name);
  const clean = extractText(html);
  const signals = analyzeSignals(html);

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.5,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `
You are a GEO scoring expert.

You MUST use the provided breakdown signals when forming scores.
Do NOT ignore them.

You must return:
- scores
- explanation tied to signals
- page-specific reasoning
`
        },
        {
          role: "user",
          content: `
PAGE: ${page.name}
ROLE: ${role}

DETERMINISTIC SIGNALS (IMPORTANT):
${JSON.stringify(signals)}

CONTENT:
${clean}

Return JSON:

{
  "geoScore": number,
  "clarityScore": number,

  "why": ["explanation tied to signals + content"],

  "issues": ["specific UX problems"],

  "fixes": ["specific improvements"],

  "conversionLeaks": ["drop-off points"],

  "scoreBreakdown": {
    "cta": number,
    "structure": number,
    "contentDepth": number,
    "trust": number
  }
}
`
        }
      ]
    });

    const raw = response?.choices?.[0]?.message?.content;
    const parsed = JSON.parse(raw);

    return {
      url: page.url,
      status: "success",

      geoScore: parsed.geoScore ?? 50,
      clarityScore: parsed.clarityScore ?? 50,

      why: parsed.why || [],
      issues: parsed.issues || [],
      fixes: parsed.fixes || [],
      conversionLeaks: parsed.conversionLeaks || [],

      scoreBreakdown: parsed.scoreBreakdown || signals
    };

  } catch (err) {
    return fallback(page, err);
  }
}

/**
 * SCAN ENGINE
 */
app.post("/api/scan-washburn", async (req, res) => {
  const results = {};
  const context = pages.map(p => ({ name: p.name, url: p.url }));

  for (const page of pages) {
    try {
      const html = (await axios.get(page.url)).data;
      results[page.name] = await analyzePage(page, html, context);
    } catch (err) {
      results[page.name] = fallback(page, err);
    }
  }

  const valid = Object.values(results).filter(r => r.status === "success");

  const avgGeo = Math.round(valid.reduce((a, b) => a + b.geoScore, 0) / valid.length);
  const avgClarity = Math.round(valid.reduce((a, b) => a + b.clarityScore, 0) / valid.length);

  res.json({
    status: "success",
    overallGeoScore: avgGeo,
    overallClarityScore: avgClarity,
    pages: results,
    timestamp: new Date().toISOString()
  });
});

/**
 * SERVER START
 */
app.listen(process.env.PORT || 3001, () => {
  console.log("GEO Intelligence Engine running");
});

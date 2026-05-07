const express = require("express");
const cors = require("cors");
const axios = require("axios");
const OpenAI = require("openai");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

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
 * EXTRACT SIGNALS (baseline only, NOT scoring)
 */
function extractSignals(html = "") {
  const lower = html.toLowerCase();

  return {
    hasTitle: lower.includes("<title>"),
    hasH1: lower.includes("<h1"),
    hasNav: lower.includes("<nav"),
    htmlLength: html.length
  };
}

/**
 * SAFE DEFAULT (NEVER undefined again)
 */
function safeNumber(n, fallback = 0) {
  return typeof n === "number" && !isNaN(n) ? n : fallback;
}

/**
 * AI PAGE SCORING (PRIMARY ENGINE)
 */
async function scoreWithAI({ name, url, html }) {
  if (!openai) return null;

  try {
    const resp = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `
You are an enrollment UX scoring engine.

You MUST return full structured JSON.

Scoring rules:

GEO Score (0–100):
- enrollment intent strength
- CTA clarity
- urgency & persuasion
- action hierarchy
- conversion readiness

Clarity Score (0–100):
- readability
- structure
- scanning ease
- cognitive load
- message focus

IMPORTANT:
- Never omit fields
- Never return null
- Always return arrays even if empty
`
        },
        {
          role: "user",
          content: `
Analyze this page:

NAME: ${name}
URL: ${url}

HTML:
${html.slice(0, 12000)}

Return JSON:

{
  "geoScore": number,
  "clarityScore": number,
  "ctaScore": number,
  "whyGeo": [""],
  "whyClarity": [""],
  "issues": [""],
  "fixes": [""]
}
`
        }
      ]
    });

    return JSON.parse(resp.choices[0].message.content);
  } catch (err) {
    console.log("AI scoring failed:", err.message);
    return null;
  }
}

/**
 * FALLBACK SCORING (ONLY IF AI FAILS)
 */
function fallback(signals) {
  const geo =
    (signals.hasTitle ? 20 : 0) +
    (signals.hasH1 ? 25 : 0) +
    (signals.hasNav ? 10 : 0) +
    30;

  const clarity =
    (signals.hasTitle ? 25 : 0) +
    (signals.hasH1 ? 25 : 0) +
    (signals.hasNav ? 15 : 0) +
    20;

  return {
    geoScore: geo,
    clarityScore: clarity,
    ctaScore: 5,
    whyGeo: ["Fallback scoring used"],
    whyClarity: ["Fallback scoring used"],
    issues: ["AI scoring unavailable"],
    fixes: ["Ensure OpenAI API key is valid"]
  };
}

/**
 * GLOBAL INSIGHTS (FOR DASHBOARD)
 */
function buildGlobal(pages) {
  const arr = Object.values(pages);

  const avgGeo =
    arr.reduce((a, b) => a + safeNumber(b.geoScore), 0) / arr.length;

  const avgClarity =
    arr.reduce((a, b) => a + safeNumber(b.clarityScore), 0) / arr.length;

  const issues = [];

  const lowPages = arr.filter(p => p.geoScore < 80);
  if (lowPages.length) {
    issues.push(`${lowPages.length} pages below GEO threshold (80)`);
  }

  const weakCTA = arr.filter(p => (p.ctaScore || 0) < 6);
  if (weakCTA.length) {
    issues.push("CTA weakness detected on multiple pages");
  }

  const structuralIssues = arr.filter(p =>
    (p.whyGeo || []).length === 0
  );

  if (structuralIssues.length) {
    issues.push("Some pages lack AI explanation layers");
  }

  if (!issues.length) {
    issues.push("Strong enrollment UX consistency across site");
  }

  return {
    overallGeoScore: Math.round(avgGeo || 0),
    overallClarityScore: Math.round(avgClarity || 0),
    globalIssues: issues
  };
}

/**
 * HEALTH
 */
app.get("/", (req, res) => {
  res.json({
    status: "Washburn UX Backend Running",
    time: new Date().toISOString()
  });
});

/**
 * MAIN SCAN ENGINE
 */
app.post("/api/scan-washburn", async (req, res) => {
  const results = {};

  for (const page of pages) {
    try {
      const r = await axios.get(page.url, { timeout: 12000 });
      const html = r.data || "";

      const signals = extractSignals(html);

      const ai = await scoreWithAI({
        name: page.name,
        url: page.url,
        html
      });

      let final;

      if (ai && typeof ai.geoScore === "number") {
        final = {
          url: page.url,
          status: "success",
          geoScore: safeNumber(ai.geoScore),
          clarityScore: safeNumber(ai.clarityScore),
          ctaScore: safeNumber(ai.ctaScore),
          whyGeo: ai.whyGeo || [],
          whyClarity: ai.whyClarity || [],
          issues: ai.issues || [],
          fixes: ai.fixes || []
        };
      } else {
        const fb = fallback(signals);

        final = {
          url: page.url,
          status: "fallback",
          geoScore: fb.geoScore,
          clarityScore: fb.clarityScore,
          ctaScore: fb.ctaScore,
          whyGeo: fb.whyGeo,
          whyClarity: fb.whyClarity,
          issues: fb.issues,
          fixes: fb.fixes
        };
      }

      results[page.name] = final;
    } catch (err) {
      results[page.name] = {
        url: page.url,
        status: "error",
        geoScore: 0,
        clarityScore: 0,
        ctaScore: 0,
        issues: [err.message],
        fixes: ["Page failed to load"]
      };
    }
  }

  const global = buildGlobal(results);

  res.json({
    status: "success",
    ...global,
    pages: results,
    timestamp: new Date().toISOString()
  });
});

/**
 * START
 */
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Washburn UX Backend running on port ${PORT}`);
});

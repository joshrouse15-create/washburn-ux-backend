const express = require("express");
const cors = require("cors");
const axios = require("axios");
const OpenAI = require("openai");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

/**
 * OpenAI client (safe init)
 */
const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

/**
 * Pages to analyze
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
 * SAFE HTML FEATURE EXTRACTION
 */
function extractSignals(html = "") {
  const lower = html.toLowerCase();

  const hasTitle = lower.includes("<title>");
  const hasH1 = lower.includes("<h1");
  const hasNav = lower.includes("<nav");

  const ctaSignals = [
    "apply",
    "request",
    "visit",
    "tour",
    "schedule",
    "enroll",
    "start",
    "submit",
    "learn more",
    "get started"
  ];

  let ctaScore = 0;
  for (const s of ctaSignals) {
    if (lower.includes(s)) ctaScore++;
  }

  return {
    hasTitle,
    hasH1,
    hasNav,
    ctaScore: Math.min(ctaScore, 10),
    htmlLength: html.length
  };
}

/**
 * FALLBACK SCORING (used if AI fails)
 */
function fallbackScore(signals) {
  const clarity =
    (signals.hasTitle ? 20 : 0) +
    (signals.hasH1 ? 20 : 0) +
    (signals.hasNav ? 10 : 0) +
    signals.ctaScore * 5;

  const geo =
    clarity * 0.7 +
    signals.ctaScore * 8;

  return {
    clarityScore: Math.round(clarity),
    geoScore: Math.round(geo)
  };
}

/**
 * AI SCORING ENGINE (REAL RUBRIC)
 */
async function aiScorePage({ name, url, html }) {
  if (!openai) return null;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `
You are a higher education UX + enrollment conversion analyst.

You score pages using STRICT RUBRIC:

GEO Score (0-100):
- Enrollment intent clarity (30)
- CTA strength (25)
- Message hierarchy (20)
- Conversion friction (15)
- Persuasiveness (10)

Clarity Score (0-100):
- Readability (30)
- Structure (25)
- Navigation clarity (20)
- Scannability (15)
- Content focus (10)

Return ONLY valid JSON.
`
        },
        {
          role: "user",
          content: `
Analyze this page:

Name: ${name}
URL: ${url}

HTML (truncated):
${html.slice(0, 12000)}

Return JSON exactly like:

{
  "geoScore": number,
  "clarityScore": number,
  "why": {
    "geo": ["bullet reason 1", "bullet reason 2"],
    "clarity": ["bullet reason 1", "bullet reason 2"]
  },
  "conversionLeaks": ["issue 1", "issue 2"],
  "ctaQuality": number
}
`
        }
      ]
    });

    return JSON.parse(completion.choices[0].message.content);
  } catch (err) {
    console.log("AI scoring failed:", err.message);
    return null;
  }
}

/**
 * INSIGHTS ENGINE
 */
function buildGlobalInsights(results) {
  const pagesArr = Object.values(results);

  const failed = pagesArr.filter(p => p.status !== "success");
  const avgGeo =
    pagesArr.reduce((sum, p) => sum + (p.geoScore || 0), 0) /
    Math.max(pagesArr.length, 1);

  const weakCTAs = pagesArr.filter(p => (p.ctaScore || 0) < 3);

  const leaks = pagesArr
    .flatMap(p => p.conversionLeaks || [])
    .filter(Boolean);

  const insights = [];

  if (failed.length) {
    insights.push(`${failed.length} pages failed to load`);
  }

  if (avgGeo < 80) {
    insights.push("Overall GEO performance is below strong enrollment threshold (<80)");
  }

  if (weakCTAs.length) {
    insights.push("Multiple pages have weak CTA density or unclear action hierarchy");
  }

  if (leaks.length) {
    insights.push("Conversion leaks detected across navigation and CTA structure");
  }

  if (!insights.length) {
    insights.push("Strong enrollment UX performance across all scanned pages");
  }

  return {
    avgGeo: Math.round(avgGeo),
    insights
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
  console.log("SCAN STARTED");

  const results = {};

  for (const page of pages) {
    try {
      const response = await axios.get(page.url, { timeout: 12000 });
      const html = response.data || "";

      const signals = extractSignals(html);

      // AI scoring (preferred)
      const ai = await aiScorePage({
        name: page.name,
        url: page.url,
        html
      });

      let geoScore, clarityScore, why, conversionLeaks, ctaQuality;

      if (ai && typeof ai.geoScore === "number") {
        geoScore = ai.geoScore;
        clarityScore = ai.clarityScore;
        why = ai.why;
        conversionLeaks = ai.conversionLeaks || [];
        ctaQuality = ai.ctaQuality || signals.ctaScore;
      } else {
        const fallback = fallbackScore(signals);

        geoScore = fallback.geoScore;
        clarityScore = fallback.clarityScore;
        why = {
          geo: ["Fallback scoring used (AI unavailable or failed)"],
          clarity: ["Fallback scoring used (AI unavailable or failed)"]
        };
        conversionLeaks = [];
        ctaQuality = signals.ctaScore;
      }

      results[page.name] = {
        url: page.url,
        status: "success",
        ...signals,
        geoScore,
        clarityScore,
        ctaScore: ctaQuality,
        why,
        conversionLeaks
      };
    } catch (err) {
      results[page.name] = {
        url: page.url,
        status: "error",
        message: err.message,
        geoScore: 0,
        clarityScore: 0,
        ctaScore: 0
      };
    }
  }

  const global = buildGlobalInsights(results);

  res.json({
    status: "success",
    ...global,
    pages: results,
    timestamp: new Date().toISOString()
  });
});

/**
 * AI COPY ENGINE (STABLE)
 */
app.post("/api/rewrite-page", async (req, res) => {
  const { pageName, url, persona } = req.body;

  if (!openai) {
    return res.status(500).json({ error: "OpenAI not configured" });
  }

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.4,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You are a conversion copywriter for higher education landing pages."
        },
        {
          role: "user",
          content: `
Rewrite page for enrollment conversion:

Page: ${pageName}
URL: ${url}
Audience: ${persona || "highschool"}

Return JSON:
{
  "headline": "",
  "subheadline": "",
  "cta_primary": "",
  "cta_secondary": "",
  "body_copy": "",
  "meta_description": "",
  "conversion_improvements": []
}
`
        }
      ]
    });

    res.json({
      status: "success",
      page: pageName,
      rewrite: JSON.parse(completion.choices[0].message.content)
    });
  } catch (err) {
    res.status(500).json({
      status: "error",
      message: err.message
    });
  }
});

/**
 * START SERVER
 */
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Washburn UX Backend running on port ${PORT}`);
});

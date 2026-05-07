const express = require("express");
const cors = require("cors");
const axios = require("axios");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json());

/**
 * SAFE OpenAI LOADER (prevents Render crashes)
 */
let openai = null;

try {
  if (process.env.OPENAI_API_KEY) {
    const OpenAI = require("openai");
    openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
  }
} catch (err) {
  console.warn("OpenAI not initialized:", err.message);
}

/**
 * HEALTH CHECK
 */
app.get("/", (req, res) => {
  res.json({
    status: "Washburn UX Backend Running",
    openaiEnabled: !!openai,
    time: new Date().toISOString()
  });
});

/**
 * CORE PAGES
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
 * SAFE HTML SIGNAL SCORING (fallback engine)
 */
function computeSignals(html) {
  const lower = html.toLowerCase();

  const hasTitle = lower.includes("<title>");
  const hasH1 = lower.includes("<h1>");
  const hasNav = lower.includes("<nav>");

  const ctaSignals = [
    "apply",
    "request",
    "visit",
    "tour",
    "admission",
    "enroll",
    "start",
    "submit",
    "schedule",
    "connect",
    "learn more"
  ];

  let ctaScore = 0;
  for (const s of ctaSignals) {
    if (lower.includes(s)) ctaScore++;
  }

  const structureScore =
    (hasTitle ? 20 : 0) +
    (hasH1 ? 20 : 0) +
    (hasNav ? 10 : 0);

  const conversionScore = Math.min(ctaScore * 10, 50);

  const clarityScore = Math.round(structureScore + conversionScore);

  const geoScore = Math.round(
    clarityScore * 0.6 + conversionScore * 0.6
  );

  return {
    hasTitle,
    hasH1,
    hasNav,
    ctaScore,
    clarityScore,
    geoScore
  };
}

/**
 * AI "WHY THIS SCORE" ENGINE (safe fallback included)
 */
async function explainScore(page, signals) {
  if (!openai) {
    return {
      explanation:
        "AI explanation unavailable (missing OPENAI_API_KEY). Using rule-based scoring only.",
      confidence: "low"
    };
  }

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.4,
      messages: [
        {
          role: "system",
          content:
            "You are a higher education UX analyst. Explain scores clearly and concisely."
        },
        {
          role: "user",
          content: `
Page: ${page.name}
URL: ${page.url}

Signals:
${JSON.stringify(signals, null, 2)}

Explain:
1. Why GEO score is what it is
2. What is hurting performance
3. What would improve it fastest
Return JSON:
{
  "why": "",
  "fixes": [],
  "risk_level": "low|medium|high"
}
          `
        }
      ]
    });

    return JSON.parse(completion.choices[0].message.content);

  } catch (err) {
    return {
      explanation: "AI explanation failed safely",
      error: err.message
    };
  }
}

/**
 * CONVERSION LEAK DETECTOR
 */
function detectLeaks(signals, htmlLength) {
  const leaks = [];

  if (!signals.hasTitle) leaks.push("Missing or weak title tag");
  if (!signals.hasH1) leaks.push("Missing primary headline (H1)");
  if (signals.ctaScore < 3) leaks.push("Low CTA density (weak conversion signals)");
  if (htmlLength < 5000) leaks.push("Thin content (low informational depth)");

  return leaks;
}

/**
 * MAIN SCAN ENDPOINT (Slate Dashboard Engine)
 */
app.post("/api/scan-washburn", async (req, res) => {
  console.log("SCAN STARTED");

  const results = {};

  for (const page of pages) {
    try {
      const response = await axios.get(page.url, { timeout: 15000 });
      const html = response.data || "";

      const signals = computeSignals(html);
      const leaks = detectLeaks(signals, html.length);
      const explanation = await explainScore(page, signals);

      results[page.name] = {
        url: page.url,
        status: "success",
        htmlLength: html.length,
        ...signals,
        leaks,
        explanation,
        scores: {
          geo: signals.geoScore,
          clarity: signals.clarityScore
        }
      };

    } catch (err) {
      results[page.name] = {
        url: page.url,
        status: "error",
        message: err.message,
        geoScore: 0,
        clarityScore: 0,
        leaks: ["Page failed to load"]
      };
    }
  }

  /**
   * SAFE AGGREGATION
   */
  const valid = Object.values(results).filter(
    r => typeof r.geoScore === "number"
  );

  const avgGeo =
    valid.length > 0
      ? Math.round(valid.reduce((a, b) => a + b.geoScore, 0) / valid.length)
      : 0;

  const avgClarity =
    valid.length > 0
      ? Math.round(valid.reduce((a, b) => a + b.clarityScore, 0) / valid.length)
      : 0;

  /**
   * INSIGHTS LAYER
   */
  const insights = [];

  const failed = Object.values(results).filter(r => r.status === "error");
  if (failed.length) insights.push(`${failed.length} pages failed to load`);

  const weakCTA = Object.values(results).filter(r => r.ctaScore < 3);
  if (weakCTA.length) insights.push("Multiple pages have weak conversion signals");

  if (avgGeo < 75) insights.push("GEO visibility below optimal threshold");

  if (!insights.length) insights.push("Site structure is strong and conversion-ready");

  return res.json({
    status: "success",
    overallGeoScore: avgGeo,
    overallClarityScore: avgClarity,
    pages: results,
    insights,
    timestamp: new Date().toISOString()
  });
});

/**
 * AI COPY ENGINE (SAFE + NO CRASH PARSING)
 */
app.post("/api/rewrite-page", async (req, res) => {
  const { pageName, url, persona } = req.body;

  if (!pageName || !url) {
    return res.status(400).json({
      error: "Missing pageName or url"
    });
  }

  if (!openai) {
    return res.status(500).json({
      error: "OpenAI not configured on server"
    });
  }

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "Return ONLY valid JSON. You are a conversion-focused higher ed copywriter."
        },
        {
          role: "user",
          content: `
Rewrite page:

${pageName} - ${url}

Persona: ${persona}

Return:
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

    return res.json({
      status: "success",
      page: pageName,
      rewrite: JSON.parse(completion.choices[0].message.content)
    });

  } catch (err) {
    return res.status(500).json({
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

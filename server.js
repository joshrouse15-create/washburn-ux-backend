const express = require("express");
const cors = require("cors");
const axios = require("axios");
require("dotenv").config();

let OpenAI;
try {
  OpenAI = require("openai");
} catch (e) {
  console.warn("OpenAI SDK not installed. AI features will fallback.");
}

const app = express();
app.use(cors());
app.use(express.json());

const openai = OpenAI
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

/**
 * HEALTH CHECK
 */
app.get("/", (req, res) => {
  res.json({
    status: "Washburn UX Backend Running",
    time: new Date().toISOString()
  });
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
 * CORE SCORING RUBRIC (stable + explainable)
 */
function scorePage({ html, url }) {
  const lower = html.toLowerCase();

  const hasTitle = html.includes("<title>");
  const hasH1 = html.includes("<h1>");
  const hasNav = html.includes("<nav>");

  const ctaSignals = [
    "apply", "request", "visit", "tour",
    "admission", "enroll", "start", "submit",
    "schedule", "learn more", "get started"
  ];

  let ctaHits = 0;
  const ctaMatches = [];

  for (const word of ctaSignals) {
    if (lower.includes(word)) {
      ctaHits++;
      ctaMatches.push(word);
    }
  }

  const structureScore =
    (hasTitle ? 20 : 0) +
    (hasH1 ? 20 : 0) +
    (hasNav ? 15 : 0);

  const ctaScore = Math.min(ctaHits * 8, 40);

  const clarityScore = Math.min(
    100,
    structureScore + ctaScore + 15
  );

  const geoScore = Math.round(
    (clarityScore * 0.65) + (ctaScore * 0.8)
  );

  return {
    hasTitle,
    hasH1,
    hasNav,
    ctaHits,
    ctaMatches,
    clarityScore,
    geoScore
  };
}

/**
 * WHY SCORE EXPLANATION ENGINE
 */
function explainScore(page, score) {
  const reasons = [];

  if (!score.hasTitle) reasons.push("Missing <title> reduces SEO clarity.");
  if (!score.hasH1) reasons.push("No primary H1 reduces message hierarchy.");
  if (!score.hasNav) reasons.push("Missing navigation weakens UX structure.");

  if (score.ctaHits === 0) {
    reasons.push("No clear conversion actions detected.");
  } else if (score.ctaHits < 3) {
    reasons.push("CTA density is low for enrollment conversion.");
  }

  if (score.ctaHits >= 5) {
    reasons.push("Strong CTA presence improves conversion potential.");
  }

  return reasons.length
    ? reasons
    : ["Strong structural and conversion signals across page."];
}

/**
 * LEAK DETECTION
 */
function detectLeaks(score) {
  const leaks = [];

  if (score.ctaHits < 2) {
    leaks.push("Conversion leak: weak or missing CTA funnel entry points.");
  }

  if (!score.hasH1) {
    leaks.push("UX leak: missing H1 reduces orientation and increases drop-off risk.");
  }

  if (score.clarityScore < 70) {
    leaks.push("Messaging leak: page structure likely unclear for prospective students.");
  }

  return leaks;
}

/**
 * SCAN ENGINE
 */
app.post("/api/scan-washburn", async (req, res) => {
  const results = {};

  for (const page of pages) {
    try {
      const response = await axios.get(page.url, { timeout: 12000 });
      const html = response.data || "";

      const score = scorePage({ html, url: page.url });

      results[page.name] = {
        url: page.url,
        status: "success",
        ...score,
        why: [],
        leaks: []
      };

    } catch (err) {
      results[page.name] = {
        url: page.url,
        status: "error",
        error: err.message,
        clarityScore: 0,
        geoScore: 0,
        why: ["Page failed to load or timed out."],
        leaks: ["Critical failure: page unreachable"]
      };
    }
  }

  // enrich explanations
  for (const key of Object.keys(results)) {
    const page = results[key];
    if (page.status === "success") {
      page.why = explainScore(page, page);
      page.leaks = detectLeaks(page);
    }
  }

  const validPages = Object.values(results).filter(p => p.status === "success");

  const avgGeo =
    validPages.reduce((a, b) => a + b.geoScore, 0) / (validPages.length || 1);

  const avgClarity =
    validPages.reduce((a, b) => a + b.clarityScore, 0) / (validPages.length || 1);

  const insights = [];

  const weakPages = validPages.filter(p => p.geoScore < 70);
  if (weakPages.length) {
    insights.push(`${weakPages.length} pages under conversion threshold (<70 GEO).`);
  }

  const leakPages = validPages.filter(p => p.leaks.length > 0);
  if (leakPages.length) {
    insights.push("Conversion leaks detected across multiple pages.");
  }

  if (!insights.length) {
    insights.push("All pages are structurally strong with stable conversion signals.");
  }

  return res.json({
    status: "success",
    overallGeoScore: Math.round(avgGeo),
    overallClarityScore: Math.round(avgClarity),
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
    return res.status(400).json({ error: "Missing pageName or url" });
  }

  if (!openai) {
    return res.status(500).json({
      error: "OpenAI not configured on server"
    });
  }

  const styleMap = {
    highschool: "High school seniors: energetic, simple, motivating.",
    transfer: "Transfer students: efficient, credit/value focused.",
    adult: "Adult learners: flexible, respectful, outcome-focused."
  };

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You are a higher education conversion copy expert. Return ONLY valid JSON."
        },
        {
          role: "user",
          content: `
Rewrite this page:

Page: ${pageName}
URL: ${url}

Audience:
${styleMap[persona] || styleMap.highschool}

Return JSON with:
headline, subheadline, cta_primary, cta_secondary, body_copy, meta_description, conversion_improvements
          `
        }
      ]
    });

    const text = completion.choices?.[0]?.message?.content || "{}";

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      parsed = {
        error: "AI returned invalid JSON",
        raw: text
      };
    }

    return res.json({
      status: "success",
      page: pageName,
      rewrite: parsed
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

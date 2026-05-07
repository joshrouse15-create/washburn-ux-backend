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
 * HEALTH CHECK
 */
app.get("/", (req, res) => {
  res.json({
    status: "Washburn UX Backend Running",
    time: new Date().toISOString()
  });
});

/**
 * CORE ENROLLMENT PAGES
 */
const pages = [
  { name: "home", url: "https://www.washburn.edu" },
  { name: "apply", url: "https://www.washburn.edu/apply" },
  { name: "promise", url: "https://www.washburn.edu/promise" },
  { name: "snco", url: "https://www.washburn.edu/snco" },
  { name: "neks", url: "https://www.washburn.edu/neksadvantage" },
  { name: "resliving", url: "https://www.washburn.edu/resliving" },
  { name: "scholarships", url: "https://www.washburn.edu/scholarships" },
  { name: "topeka", url: "https://www.washburn.edu/topeka"
  }
];

/**
 * SCAN ENGINE
 */
app.post("/api/scan-washburn", async (req, res) => {
  console.log("SCAN STARTED");

  const results = {};

  for (const page of pages) {
    try {
      const response = await axios.get(page.url, { timeout: 12000 });
      const html = response.data || "";
      const lower = html.toLowerCase();

      const hasTitle = html.includes("<title>");
      const hasH1 = html.includes("<h1>");
      const hasNav = html.includes("<nav>");

      const ctaSignals = [
        "apply",
        "request",
        "visit",
        "tour",
        "admission",
        "enroll",
        "start",
        "submit",
        "schedule"
      ];

      let ctaScore = 0;
      for (const word of ctaSignals) {
        if (lower.includes(word)) ctaScore++;
      }

      const clarityScore = Math.round(
        (hasTitle ? 25 : 0) +
        (hasH1 ? 25 : 0) +
        (hasNav ? 15 : 0) +
        Math.min(ctaScore * 8, 35)
      );

      const geoScore = Math.round(
        clarityScore * 0.6 +
        ctaScore * 10 +
        (hasTitle ? 10 : 0)
      );

      results[page.name] = {
        url: page.url,
        status: "success",
        htmlLength: html.length,
        hasTitle,
        hasH1,
        hasNav,
        ctaScore,
        clarityScore,
        geoScore
      };

    } catch (err) {
      results[page.name] = {
        url: page.url,
        status: "error",
        message: err.message,
        clarityScore: 0,
        geoScore: 0
      };
    }
  }

  /**
   * SAFE FILTERING (fixes undefined issue)
   */
  const validPages = Object.values(results).filter(
    p => typeof p.geoScore === "number"
  );

  const avgGeoScore = validPages.length
    ? Math.round(validPages.reduce((a, b) => a + b.geoScore, 0) / validPages.length)
    : 0;

  const avgClarityScore = validPages.length
    ? Math.round(validPages.reduce((a, b) => a + b.clarityScore, 0) / validPages.length)
    : 0;

  /**
   * INSIGHTS ENGINE (real diagnostics)
   */
  const insights = [];

  const failedPages = Object.entries(results)
    .filter(([_, v]) => v.status === "error");

  if (failedPages.length > 0) {
    insights.push(`${failedPages.length} page(s) failed to load or timeout`);
  }

  const lowCTA = Object.entries(results)
    .filter(([_, v]) => v.ctaScore !== undefined && v.ctaScore < 3);

  if (lowCTA.length > 0) {
    insights.push("Some pages have weak conversion signals (low CTA density)");
  }

  if (avgGeoScore < 75) {
    insights.push("Overall GEO visibility could be improved with stronger action language and structure");
  }

  if (!insights.length) {
    insights.push("Pages are structurally strong and conversion-ready");
  }

  return res.json({
    status: "success",
    overallGeoScore: avgGeoScore,
    overallClarityScore: avgClarityScore,
    pages: results,
    insights,
    timestamp: new Date().toISOString()
  });
});

/**
 * AI COPY ENGINE (FIXED — no JSON parsing crashes)
 */
app.post("/api/rewrite-page", async (req, res) => {
  const { pageName, url, persona } = req.body;

  if (!pageName || !url) {
    return res.status(400).json({ error: "Missing pageName or url" });
  }

  const styleMap = {
    highschool: "High school seniors: energetic, simple, motivating.",
    transfer: "Transfer students: efficient, clear credit/value focus.",
    adult: "Adult learners: flexible, respectful, outcome-focused."
  };

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You are a higher education conversion copy expert. Return ONLY valid JSON."
        },
        {
          role: "user",
          content: `
Rewrite this Washburn University page:

Page: ${pageName}
URL: ${url}

Audience:
${styleMap[persona] || styleMap.highschool}

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

    const output = JSON.parse(completion.choices[0].message.content);

    return res.json({
      status: "success",
      page: pageName,
      rewrite: output
    });

  } catch (err) {
    console.error("AI ERROR:", err.message);

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

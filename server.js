const express = require("express");
const cors = require("cors");
const axios = require("axios");
require("dotenv").config();

const OpenAI = require("openai");

const app = express();

app.use(cors());
app.use(express.json());

/**
 * OPENAI (optional layer)
 */
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
 * PAGE LIST (core enrollment funnel)
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
 * PAGE SCAN ENGINE
 */
app.post("/api/scan-washburn", async (req, res) => {
  console.log("SCAN STARTED");

  const results = {};

  try {
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
          "visit",
          "tour",
          "admission",
          "enroll",
          "request",
          "submit",
          "schedule",
          "start"
        ];

        let ctaScore = 0;
        for (const word of ctaSignals) {
          if (lower.includes(word)) ctaScore++;
        }

        const clarityScore = Math.min(
          100,
          Math.round(
            (hasTitle ? 20 : 0) +
            (hasH1 ? 20 : 0) +
            (hasNav ? 10 : 0) +
            Math.min(ctaScore * 10, 50)
          )
        );

        const geoScore = Math.min(
          100,
          Math.round(
            clarityScore * 0.7 +
            (ctaScore >= 3 ? 20 : 10) +
            (hasTitle ? 10 : 0)
          )
        );

        results[page.name] = {
          url: page.url,
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
          error: true,
          message: err.message
        };
      }
    }

    const validPages = Object.values(results).filter(p => p.geoScore !== undefined);

    const avgGeoScore = validPages.length
      ? Math.round(validPages.reduce((a, b) => a + b.geoScore, 0) / validPages.length)
      : 0;

    const avgClarityScore = validPages.length
      ? Math.round(validPages.reduce((a, b) => a + b.clarityScore, 0) / validPages.length)
      : 0;

    const insights = [];

    if (avgGeoScore < 70) {
      insights.push("Overall GEO visibility is below optimal threshold");
    }

    if (results.apply?.ctaScore < 3) {
      insights.push("Apply page may have weak conversion signals");
    }

    if (results.scholarships?.ctaScore < 2) {
      insights.push("Scholarships page lacks strong action language");
    }

    if (!insights.length) {
      insights.push("Core pages are structurally stable (baseline mode)");
    }

    return res.json({
      status: "success",
      overallGeoScore: avgGeoScore,
      overallClarityScore: avgClarityScore,
      pages: results,
      insights,
      timestamp: new Date().toISOString()
    });

  } catch (err) {
    console.error("SCAN ERROR:", err.message);

    return res.status(500).json({
      status: "error",
      message: err.message
    });
  }
});

/**
 * AI REWRITE ENGINE
 */
app.post("/api/rewrite-page", async (req, res) => {
  const { pageName, url, persona } = req.body;

  if (!pageName || !url) {
    return res.status(400).json({
      error: "Missing pageName or url"
    });
  }

  const personaStyle = {
    highschool: "Write for high school seniors exploring college options.",
    transfer: "Write for transfer students focused on efficiency and credit transfer.",
    adult: "Write for adult learners balancing work, life, and education."
  };

  const style = personaStyle[persona] || personaStyle.highschool;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "Return ONLY valid JSON. No markdown. No commentary."
        },
        {
          role: "user",
          content: `
Rewrite this Washburn University page:

URL: ${url}
Page: ${pageName}

Style:
${style}

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
      ],
      temperature: 0.7
    });

    const output = JSON.parse(completion.choices[0].message.content);

    return res.json({
      status: "success",
      page: pageName,
      rewrite: output
    });

  } catch (err) {
    console.error("OPENAI ERROR:", err.message);

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
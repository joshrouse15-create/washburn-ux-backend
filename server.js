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
    status: "GEO Intelligence Engine Running",
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
 * SAFE AI PARSER
 */
function safeParse(content) {
  try {
    return JSON.parse(content);
  } catch {
    return null;
  }
}

/**
 * MAIN GEO SCAN
 */
app.post("/api/scan-washburn", async (req, res) => {
  console.log("AI GEO SCAN START");

  const results = {};

  for (const page of pages) {
    try {
      const response = await axios.get(page.url, { timeout: 12000 });
      const html = response.data || "";

      // Trim HTML to avoid token overflow
      const trimmedHtml = html.slice(0, 15000);

      /**
       * AI ANALYSIS
       */
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        temperature: 0.3,
        messages: [
          {
            role: "system",
            content: `
You are a GEO (Generative Engine Optimization) analyst for university enrollment marketing.

Evaluate this webpage for:
- Conversion effectiveness
- Clarity of messaging
- CTA strength
- Information hierarchy
- Enrollment persuasion

Return ONLY valid JSON:
{
  "geoScore": number (0-150),
  "clarityScore": number (0-100),
  "ctaScore": number (0-10),
  "whyGeo": [string],
  "whyClarity": [string],
  "issues": [string],
  "fixes": [string],
  "conversionLeaks": [string]
}
`
          },
          {
            role: "user",
            content: `
PAGE: ${page.name}
URL: ${page.url}

HTML:
${trimmedHtml}
`
          }
        ]
      });

      const raw = completion.choices[0].message.content;
      const parsed = safeParse(raw);

      if (!parsed) throw new Error("AI parse failed");

      results[page.name] = {
        url: page.url,
        status: "success",
        geoScore: parsed.geoScore ?? 0,
        clarityScore: parsed.clarityScore ?? 0,
        ctaScore: parsed.ctaScore ?? 0,
        whyGeo: parsed.whyGeo || [],
        whyClarity: parsed.whyClarity || [],
        issues: parsed.issues || [],
        fixes: parsed.fixes || [],
        conversionLeaks: parsed.conversionLeaks || []
      };

    } catch (err) {
      console.error(`ERROR on ${page.name}:`, err.message);

      results[page.name] = {
        url: page.url,
        status: "error",
        geoScore: 0,
        clarityScore: 0,
        ctaScore: 0,
        whyGeo: [],
        whyClarity: [],
        issues: ["Page failed to analyze"],
        fixes: ["Check page availability or AI response"],
        conversionLeaks: []
      };
    }
  }

  /**
   * AGGREGATION (AI-DRIVEN SUMMARY)
   */
  const valid = Object.values(results).filter(p => p.status === "success");

  let overallGeoScore = 0;
  let overallClarityScore = 0;

  if (valid.length > 0) {
    overallGeoScore = Math.round(
      valid.reduce((sum, p) => sum + p.geoScore, 0) / valid.length
    );

    overallClarityScore = Math.round(
      valid.reduce((sum, p) => sum + p.clarityScore, 0) / valid.length
    );
  }

  /**
   * GLOBAL INSIGHTS ENGINE
   */
  const allIssues = valid.flatMap(p => p.issues);
  const allLeaks = valid.flatMap(p => p.conversionLeaks);

  const insights = [];

  if (allLeaks.length > 3) {
    insights.push("Multiple conversion leaks detected across key pages");
  }

  if (overallGeoScore < 90) {
    insights.push("Overall GEO performance is under-optimized for conversion");
  }

  if (overallClarityScore < 70) {
    insights.push("Messaging clarity is inconsistent across pages");
  }

  if (!insights.length) {
    insights.push("Pages are structurally strong but may lack differentiation");
  }

  /**
   * FINAL RESPONSE (STABLE)
   */
  return res.json({
    status: "success",
    overallGeoScore,
    overallClarityScore,
    insights,
    pages: results,
    timestamp: new Date().toISOString()
  });
});

/**
 * START SERVER
 */
const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`GEO Intelligence Engine running on port ${PORT}`);
});

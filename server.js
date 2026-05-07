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
 * SAFETY FALLBACK
 */
function fallback(page, reason) {
  return {
    url: page.url,
    status: "error",

    geoScore: 0,
    clarityScore: 0,
    conversionScore: 0,

    why: [`AI failed: ${reason}`],
    issues: ["AI pipeline failure"],
    fixes: ["Check OpenAI key / response format"],
    leaks: []
  };
}

/**
 * PAGE SEGMENTATION (CRITICAL GEO v2 STEP)
 */
function extractSections(html) {
  const lower = html.toLowerCase();

  return {
    hero: lower.slice(0, 2000),
    body: lower.slice(2000, 6000),
    ctas: (lower.match(/apply|visit|tour|enroll|request/g) || []).join(" "),
    navigation: lower.includes("<nav>") ? "present" : "missing",
    headings: (lower.match(/<h1|<h2/g) || []).length
  };
}

/**
 * AI INTELLIGENCE ENGINE (GEO v2 CORE)
 */
async function analyzePageAI(page, html) {
  try {
    const sections = extractSections(html);

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.3,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `
You are a GEO (Generative Enrollment Optimization) intelligence engine.

You do NOT give generic scores.

You analyze page conversion architecture by section.

Return ONLY valid JSON.
`
        },
        {
          role: "user",
          content: `
Analyze this enrollment page:

PAGE: ${page.name}
URL: ${page.url}

SECTION DATA:
${JSON.stringify(sections)}

Return JSON:

{
  "geoScore": number,
  "clarityScore": number,
  "conversionScore": number,

  "sectionAnalysis": {
    "hero": {
      "score": number,
      "problem": "",
      "fix": ""
    },
    "cta": {
      "score": number,
      "problem": "",
      "fix": ""
    },
    "messaging": {
      "score": number,
      "problem": "",
      "fix": ""
    },
    "trust": {
      "score": number,
      "problem": "",
      "fix": ""
    }
  },

  "why": ["string"],
  "issues": ["string"],
  "fixes": ["string"],
  "conversionLeaks": ["string"]
}
`
        }
      ]
    });

    const raw = completion?.choices?.[0]?.message?.content;

    if (!raw) return fallback(page, "empty response");

    return JSON.parse(raw);

  } catch (err) {
    return fallback(page, err.message);
  }
}

/**
 * MAIN SCAN
 */
app.post("/api/scan-washburn", async (req, res) => {
  const results = {};

  for (const page of pages) {
    try {
      const response = await axios.get(page.url, { timeout: 15000 });
      const html = response.data || "";

      const ai = await analyzePageAI(page, html);

      results[page.name] = {
        url: page.url,
        status: "success",

        geoScore: ai.geoScore ?? 0,
        clarityScore: ai.clarityScore ?? 0,
        conversionScore: ai.conversionScore ?? 0,

        sectionAnalysis: ai.sectionAnalysis || {},

        why: ai.why || [],
        issues: ai.issues || [],
        fixes: ai.fixes || [],
        conversionLeaks: ai.conversionLeaks || []
      };

    } catch (err) {
      results[page.name] = fallback(page, err.message);
    }
  }

  const valid = Object.values(results).filter(p => p.status === "success");

  const overallGeo =
    valid.length
      ? Math.round(valid.reduce((a, b) => a + b.geoScore, 0) / valid.length)
      : 0;

  const overallClarity =
    valid.length
      ? Math.round(valid.reduce((a, b) => a + b.clarityScore, 0) / valid.length)
      : 0;

  const insights = [
    "GEO v2 segmentation analysis complete",
    `${valid.length} pages processed`,
    overallGeo > 80 ? "Strong enrollment readiness" : "Needs conversion optimization",
    "Section-level scoring active (hero, CTA, messaging, trust)"
  ];

  res.json({
    status: "success",
    overallGeoScore: overallGeo,
    overallClarityScore: overallClarity,
    pages: results,
    insights,
    timestamp: new Date().toISOString()
  });
});

/**
 * SERVER
 */
const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`GEO v2 Intelligence Engine running on port ${PORT}`);
});

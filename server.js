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
 * PAGE LIST
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
 * HEALTH
 */
app.get("/", (req, res) => {
  res.json({
    status: "GEO Intelligence Engine v4 Running",
    time: new Date().toISOString()
  });
});

/**
 * HTML CLEANER
 */
function extractText(html = "") {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<\/?[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 12000);
}

/**
 * ROLE MAP (IMPORTANT FOR AI DIFFERENTIATION)
 */
function classify(name, url) {
  if (name === "home") return "awareness";
  if (url.includes("apply")) return "conversion";
  if (url.includes("scholar")) return "financial-aid";
  if (url.includes("res")) return "experience";
  if (url.includes("promise")) return "value";
  return "support";
}

/**
 * SAFE PARSER (HARDENED)
 */
function safeParse(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    try {
      return JSON.parse(raw.replace(/```json|```/g, "").trim());
    } catch {
      return null;
    }
  }
}

/**
 * GUARANTEED STRUCTURE (fixes undefined everywhere)
 */
function fallback(page, err) {
  return {
    url: page.url,
    status: "error",
    geoScore: 0,
    clarityScore: 0,
    why: ["AI failure fallback triggered"],
    issues: [err?.message || "Unknown error"],
    fixes: ["Check OpenAI API key / response format"],
    conversionLeaks: ["Unable to analyze"]
  };
}

/**
 * AI CORE GEO ENGINE
 */
async function analyzePage(page, html, contextPages) {
  const role = classify(page.name, page.url);
  const content = extractText(html);

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.4,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `
You are a GEO (Generative Enrollment Optimization) intelligence engine.

RULES:
- Scores MUST differ across pages based on role + content
- Never reuse patterns between pages
- You MUST explain WHY each score exists
- Output must be strict JSON only
- Be specific, not generic
`
        },
        {
          role: "user",
          content: `
PAGE: ${page.name}
URL: ${page.url}
ROLE: ${role}

OTHER PAGES CONTEXT:
${JSON.stringify(contextPages)}

CONTENT:
${content}

Return JSON:

{
  "geoScore": number,
  "clarityScore": number,

  "why": ["detailed reasoning tied to content + role"],

  "issues": ["specific UX or messaging gaps"],

  "fixes": ["actionable improvements (not generic advice)"],

  "conversionLeaks": [
    "where users hesitate or drop off"
  ],

  "pageDiagnosis": "2-3 sentence expert evaluation",

  "priorityFix": "single highest-impact change"
}
`
        }
      ]
    });

    const raw = completion?.choices?.[0]?.message?.content;
    const parsed = safeParse(raw);

    if (!parsed) return fallback(page, new Error("Invalid JSON from AI"));

    return {
      url: page.url,
      status: "success",

      geoScore: parsed.geoScore ?? 50,
      clarityScore: parsed.clarityScore ?? 50,

      why: parsed.why || [],
      issues: parsed.issues || [],
      fixes: parsed.fixes || [],
      conversionLeaks: parsed.conversionLeaks || [],

      pageDiagnosis: parsed.pageDiagnosis || "",
      priorityFix: parsed.priorityFix || ""
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
      const html = (await axios.get(page.url, { timeout: 15000 })).data;

      const ai = await analyzePage(page, html, context);

      results[page.name] = ai;

    } catch (err) {
      results[page.name] = fallback(page, err);
    }
  }

  const valid = Object.values(results).filter(r => r.status === "success");

  const avgGeo = Math.round(
    valid.reduce((a, b) => a + b.geoScore, 0) / valid.length
  );

  const avgClarity = Math.round(
    valid.reduce((a, b) => a + b.clarityScore, 0) / valid.length
  );

  res.json({
    status: "success",
    overallGeoScore: avgGeo,
    overallClarityScore: avgClarity,
    pages: results,
    timestamp: new Date().toISOString(),
    insights: [
      "AI-driven GEO scoring active",
      "Role-based page differentiation enabled",
      "Conversion leak detection active"
    ]
  });
});

/**
 * AI COPY ENGINE (STABLE)
 */
app.post("/api/rewrite-page", async (req, res) => {
  const { pageName, url, persona } = req.body;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.4,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: "Return ONLY valid JSON marketing copy."
        },
        {
          role: "user",
          content: `
Page: ${pageName}
URL: ${url}
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

    const raw = completion?.choices?.[0]?.message?.content;
    const parsed = safeParse(raw);

    if (!parsed) {
      return res.status(500).json({
        status: "error",
        message: "AI returned invalid JSON"
      });
    }

    res.json({
      status: "success",
      rewrite: parsed
    });

  } catch (err) {
    res.status(500).json({
      status: "error",
      message: err.message
    });
  }
});

/**
 * START
 */
const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`GEO Intelligence Engine running on port ${PORT}`);
});

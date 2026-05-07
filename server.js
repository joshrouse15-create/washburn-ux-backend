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
 * HEALTH CHECK
 */
app.get("/", (req, res) => {
  res.json({
    status: "GEO v3 Funnel Intelligence Engine Running",
    time: new Date().toISOString()
  });
});

/**
 * CLEAN HTML EXTRACTOR (improved signal quality)
 */
function extractText(html = "") {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<\/?[^>]+(>|$)/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 12000);
}

/**
 * PAGE ROLE CLASSIFIER (KEY UPGRADE)
 */
function classifyPageRole(name, url) {
  if (name === "home") return "awareness";
  if (url.includes("/apply")) return "conversion";
  if (url.includes("/scholarship")) return "financial-aid-consideration";
  if (url.includes("/res")) return "experience-consideration";
  if (url.includes("/promise")) return "value-proposition";
  if (url.includes("/neks")) return "regional-partnership";
  if (url.includes("/snco")) return "program-exploration";
  if (url.includes("/topeka")) return "location-trust";

  return "general";
}

/**
 * SAFE JSON PARSER
 */
function safeParse(raw) {
  if (!raw) throw new Error("Empty AI response");

  try {
    return JSON.parse(raw);
  } catch (e) {
    const cleaned = raw
      .replace(/```json/g, "")
      .replace(/```/g, "")
      .trim();

    return JSON.parse(cleaned);
  }
}

/**
 * STABLE FALLBACK
 */
function fallback(page, err) {
  return {
    url: page.url,
    status: "error",
    role: classifyPageRole(page.name, page.url),

    geoScore: 50,
    clarityScore: 50,
    conversionScore: 50,

    why: ["AI pipeline failure - fallback activated"],
    issues: [err.message],
    fixes: ["Check OpenAI API key, response format, or HTML input"],
    conversionLeaks: ["Unknown due to analysis failure"]
  };
}

/**
 * GEO v3 AI ENGINE (FUNNEL-AWARE)
 */
async function analyzePage(page, html, allPagesContext = []) {
  const clean = extractText(html);
  const role = classifyPageRole(page.name, page.url);

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.3,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `
You are a GEO (Generative Enrollment Optimization) intelligence system.

CRITICAL RULES:
- Score must be ROLE-BASED (not generic)
- Awareness pages score differently than conversion pages
- Always explain WHY this page differs from others
- Never output generic insights
- Always return valid JSON
`
        },
        {
          role: "user",
          content: `
PAGE:
${page.name}
URL: ${page.url}
ROLE: ${role}

ALL PAGES CONTEXT:
${JSON.stringify(allPagesContext.map(p => ({ name: p.name, url: p.url })))}

PAGE CONTENT:
${clean}

Return JSON:

{
  "role": "${role}",

  "geoScore": number,
  "clarityScore": number,
  "conversionScore": number,

  "why": ["specific reasoning tied to ROLE + content"],
  "issues": ["real UX or messaging gaps"],
  "fixes": ["specific actionable improvements"],
  "conversionLeaks": ["where users drop off or hesitate"],

  "funnelInsight": "why this page performs at this stage of the funnel",

  "competitivePositioning": "how this page compares to other Washburn pages in purpose",

  "sectionAnalysis": {
    "hero": { "score": number, "insight": "", "fix": "" },
    "cta": { "score": number, "insight": "", "fix": "" },
    "trust": { "score": number, "insight": "", "fix": "" },
    "navigation": { "score": number, "insight": "", "fix": "" }
  }
}
`
        }
      ]
    });

    const raw = completion?.choices?.[0]?.message?.content;
    const parsed = safeParse(raw);

    return {
      role,
      geoScore: parsed.geoScore ?? 55,
      clarityScore: parsed.clarityScore ?? 55,
      conversionScore: parsed.conversionScore ?? 55,

      why: parsed.why ?? [],
      issues: parsed.issues ?? [],
      fixes: parsed.fixes ?? [],
      conversionLeaks: parsed.conversionLeaks ?? [],

      funnelInsight: parsed.funnelInsight ?? "",
      competitivePositioning: parsed.competitivePositioning ?? "",

      sectionAnalysis: parsed.sectionAnalysis ?? {}
    };

  } catch (err) {
    return fallback(page, err);
  }
}

/**
 * MAIN SCAN ENGINE (WITH CROSS-PAGE CONTEXT)
 */
app.post("/api/scan-washburn", async (req, res) => {
  const results = {};

  const contextPages = pages.map(p => ({
    name: p.name,
    url: p.url
  }));

  for (const page of pages) {
    try {
      const response = await axios.get(page.url, { timeout: 15000 });
      const html = response.data || "";

      const ai = await analyzePage(page, html, contextPages);

      results[page.name] = {
        url: page.url,
        status: "success",
        ...ai
      };

    } catch (err) {
      results[page.name] = fallback(page, err);
    }
  }

  const valid = Object.values(results).filter(r => r.status === "success");

  const avgGeo = Math.round(valid.reduce((a, b) => a + b.geoScore, 0) / valid.length);
  const avgClarity = Math.round(valid.reduce((a, b) => a + b.clarityScore, 0) / valid.length);

  const insights = [
    "GEO v3 Funnel Intelligence scan complete",
    `${valid.length} pages analyzed`,
    "Scores now role-weighted by funnel stage",
    "Cross-page comparison enabled"
  ];

  res.json({
    status: "success",
    overallGeoScore: avgGeo,
    overallClarityScore: avgClarity,
    pages: results,
    insights,
    timestamp: new Date().toISOString()
  });
});

/**
 * AI COPY ENGINE (STABLE)
 */
app.post("/api/rewrite-page", async (req, res) => {
  const { pageName, url, persona } = req.body;

  const styleMap = {
    highschool: "High school seniors: energetic, simple, motivating.",
    transfer: "Transfer students: efficient, clear value focus.",
    adult: "Adult learners: flexible, outcome-focused."
  };

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: "Return ONLY valid JSON enrollment copy."
        },
        {
          role: "user",
          content: `
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

    const raw = completion?.choices?.[0]?.message?.content;
    const rewrite = safeParse(raw);

    res.json({
      status: "success",
      page: pageName,
      rewrite
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
  console.log(`GEO v3 Funnel Intelligence Engine running on port ${PORT}`);
});

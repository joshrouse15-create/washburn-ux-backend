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
    status: "Washburn GEO Intelligence API Running",
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
 * FALLBACK ENGINE (NEVER BREAK FRONTEND)
 */
function fallbackAI(reason) {
  return {
    geoScore: 0,
    clarityScore: 0,
    ctaScore: 0,
    why: [`AI fallback triggered: ${reason}`],
    issues: ["AI scoring failed safely"],
    fixes: [
      "Check OpenAI API key",
      "Check model access (gpt-4o-mini)",
      "Check token limits",
      "Verify Render environment variables"
    ],
    conversionLeaks: []
  };
}

/**
 * AI SCORING ENGINE (HARDENED)
 */
async function scorePageWithAI({ name, url, html }) {
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.4,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `
You are a strict GEO + enrollment conversion analyst.

Return ONLY valid JSON.
No markdown. No commentary.
Always return complete JSON even if uncertain.
`
        },
        {
          role: "user",
          content: `
Analyze this page:

PAGE: ${name}
URL: ${url}

HTML:
${html.slice(0, 12000)}

Return EXACT JSON:
{
  "geoScore": number,
  "clarityScore": number,
  "ctaScore": number,
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

    if (!raw) return fallbackAI("Empty OpenAI response");

    let parsed;

    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      return fallbackAI("Invalid JSON returned by OpenAI");
    }

    return {
      geoScore: Number(parsed.geoScore ?? 0),
      clarityScore: Number(parsed.clarityScore ?? 0),
      ctaScore: Number(parsed.ctaScore ?? 0),

      why: parsed.why ?? [],
      issues: parsed.issues ?? [],
      fixes: parsed.fixes ?? [],
      conversionLeaks: parsed.conversionLeaks ?? []
    };

  } catch (err) {
    return fallbackAI(err.message);
  }
}

/**
 * MAIN SCAN ENGINE
 */
app.post("/api/scan-washburn", async (req, res) => {
  console.log("SCAN STARTED");

  const results = {};

  for (const page of pages) {
    try {
      const response = await axios.get(page.url, { timeout: 15000 });
      const html = response.data || "";
      const lower = html.toLowerCase();

      const hasTitle = html.includes("<title>");
      const hasH1 = html.includes("<h1>");
      const hasNav = html.includes("<nav>");

      const ctaSignals = [
        "apply","visit","tour","request","admission",
        "enroll","start","submit","schedule"
      ];

      let ctaScore = 0;
      for (const w of ctaSignals) {
        if (lower.includes(w)) ctaScore++;
      }

      /**
       * AI LAYER
       */
      const ai = await scorePageWithAI({
        name: page.name,
        url: page.url,
        html
      });

      /**
       * FINAL SCORES (HYBRID MODEL)
       */
      const geoScore = Math.round(
        (ai.geoScore * 0.7) + (ctaScore * 6) + (hasTitle ? 5 : 0)
      );

      const clarityScore = Math.round(
        (ai.clarityScore * 0.7) + (hasH1 ? 10 : 0) + (hasNav ? 5 : 0)
      );

      results[page.name] = {
        url: page.url,
        status: "success",

        geoScore,
        clarityScore,
        ctaScore,

        hasTitle,
        hasH1,
        hasNav,

        why: ai.why,
        issues: ai.issues,
        fixes: ai.fixes,
        conversionLeaks: ai.conversionLeaks
      };

    } catch (err) {
      results[page.name] = {
        url: page.url,
        status: "error",

        geoScore: 0,
        clarityScore: 0,
        ctaScore: 0,

        why: ["Page failed to load"],
        issues: [err.message],
        fixes: ["Check URL or timeout"],
        conversionLeaks: []
      };
    }
  }

  /**
   * SAFE AGGREGATION
   */
  const valid = Object.values(results).filter(p => p.status === "success");

  const overallGeoScore = valid.length
    ? Math.round(valid.reduce((a, b) => a + b.geoScore, 0) / valid.length)
    : 0;

  const overallClarityScore = valid.length
    ? Math.round(valid.reduce((a, b) => a + b.clarityScore, 0) / valid.length)
    : 0;

  const insights = [
    `${valid.length} pages analyzed successfully`,
    overallGeoScore > 80 ? "Strong GEO performance" : "GEO optimization needed",
    overallClarityScore > 80 ? "Strong clarity structure" : "Clarity improvements needed"
  ];

  res.json({
    status: "success",
    overallGeoScore,
    overallClarityScore,
    pages: results,
    insights,
    timestamp: new Date().toISOString()
  });
});

/**
 * AI COPY ENGINE (SAFE)
 */
app.post("/api/rewrite-page", async (req, res) => {
  const { pageName, url, persona } = req.body;

  if (!pageName || !url) {
    return res.status(400).json({ error: "Missing pageName or url" });
  }

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: "Return ONLY valid JSON marketing copy."
        },
        {
          role: "user",
          content: `
Rewrite page:

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

    const raw = completion.choices[0].message.content;

    return res.json({
      status: "success",
      rewrite: JSON.parse(raw)
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
  console.log(`GEO Intelligence Server running on port ${PORT}`);
});

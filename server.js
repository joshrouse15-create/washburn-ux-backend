const express = require("express");
const cors = require("cors");
const axios = require("axios");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json());

/**
 * OPTIONAL OPENAI LOAD (safe fail)
 */
let OpenAI;
let openai;

try {
  OpenAI = require("openai");
  if (process.env.OPENAI_API_KEY) {
    openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
} catch (e) {
  console.log("OpenAI not available");
}

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
 * CLEAN HTML → TEXT
 */
function extractText(html) {
  return html
    .replace(/<script[^>]*>.*?<\/script>/gis, "")
    .replace(/<style[^>]*>.*?<\/style>/gis, "")
    .replace(/<nav[^>]*>.*?<\/nav>/gis, "")
    .replace(/<footer[^>]*>.*?<\/footer>/gis, "")
    .replace(/<\/?[^>]+(>|$)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * SAFE JSON PARSER
 */
function safeJSONParse(text) {
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new Error("Invalid JSON returned by OpenAI");
  }
}

/**
 * OPENAI PAGE EVALUATION (CORE INTELLIGENCE LAYER)
 */
async function evaluatePage(page, text) {
  if (!openai) {
    throw new Error("OpenAI not configured");
  }

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.2,
    messages: [
      {
        role: "system",
        content: `
You are a higher education enrollment UX auditor.

You evaluate Washburn University web pages.

Return ONLY valid JSON.

SCORING RULES:
- clarityScore: readability + structure
- geoScore: discoverability + informational strength
- conversionScore: ability to drive action

OUTPUT FORMAT:
{
  "clarityScore": 0-100,
  "geoScore": 0-100,
  "conversionScore": 0-100,
  "diagnostics": {
    "strengths": [],
    "weaknesses": [],
    "missingElements": [],
    "frictionPoints": []
  },
  "recommendations": [
    {
      "issue": "",
      "fix": "",
      "impact": "low|medium|high"
    }
  ]
}

Rules:
- No markdown
- No commentary
- Always include all fields
- Be specific to university enrollment UX
`
      },
      {
        role: "user",
        content: `
PAGE: ${page.name}
URL: ${page.url}

CONTENT:
${text.slice(0, 12000)}
`
      }
    ]
  });

  const raw = completion.choices[0].message.content;

  const parsed = safeJSONParse(raw);

  return parsed;
}

/**
 * HEALTH CHECK
 */
app.get("/", (req, res) => {
  res.json({
    status: "Slate AI Intelligence v3 running",
    time: new Date().toISOString()
  });
});

/**
 * PAGE SCAN (NOW AI-DRIVEN + EXPLANATORY)
 */
app.post("/api/scan-washburn", async (req, res) => {
  const results = {};

  try {
    for (const page of pages) {
      try {
        const html = (await axios.get(page.url, { timeout: 12000 })).data;
        const text = extractText(html);

        const ai = await evaluatePage(page, text);

        results[page.name] = {
          url: page.url,
          wordCount: text.split(" ").length,
          ...ai
        };

      } catch (err) {
        results[page.name] = {
          url: page.url,
          error: true,
          message: err.message
        };
      }
    }

    const valid = Object.values(results).filter(r => !r.error);

    const avgClarity = valid.length
      ? Math.round(valid.reduce((a, b) => a + (b.clarityScore || 0), 0) / valid.length)
      : 0;

    const avgGeo = valid.length
      ? Math.round(valid.reduce((a, b) => a + (b.geoScore || 0), 0) / valid.length)
      : 0;

    const avgConversion = valid.length
      ? Math.round(valid.reduce((a, b) => a + (b.conversionScore || 0), 0) / valid.length)
      : 0;

    /**
     * AUTO INSIGHTS (SYSTEM LEVEL)
     */
    const insights = [];

    const apply = results.apply;

    if (avgConversion < 70) {
      insights.push("Overall conversion strength is below optimal enrollment threshold");
    }

    if (apply?.conversionScore < 75) {
      insights.push("Apply page is underperforming in conversion clarity");
    }

    if (apply?.missingElements?.length > 0) {
      insights.push("Apply page is missing key conversion elements");
    }

    res.json({
      status: "success",
      averages: {
        clarity: avgClarity,
        geo: avgGeo,
        conversion: avgConversion
      },
      pages: results,
      insights,
      timestamp: new Date().toISOString()
    });

  } catch (err) {
    res.status(500).json({
      status: "error",
      message: err.message
    });
  }
});

/**
 * OPTIONAL: SINGLE PAGE REWRITE
 */
app.post("/api/rewrite-page", async (req, res) => {
  if (!openai) {
    return res.status(500).json({
      status: "error",
      message: "OpenAI not configured"
    });
  }

  const { pageName, url } = req.body;

  try {
    const html = (await axios.get(url)).data;
    const text = extractText(html);

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content: `
Return ONLY JSON:
headline, subheadline, cta_primary, cta_secondary, body_copy, meta_description
`
        },
        {
          role: "user",
          content: text.slice(0, 12000)
        }
      ]
    });

    const result = JSON.parse(completion.choices[0].message.content);

    res.json({
      status: "success",
      page: pageName,
      rewrite: result
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
  console.log(`Slate AI Intelligence v3 running on ${PORT}`);
});

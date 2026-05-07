const express = require("express");
const cors = require("cors");
const axios = require("axios");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json());

/**
 * OPTIONAL OPENAI LOAD
 */
let OpenAI;
let openai;

try {
  OpenAI = require("openai");
  if (process.env.OPENAI_API_KEY) {
    openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
} catch (e) {
  console.log("OpenAI disabled");
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
 * BASIC HTML CLEANER (lightweight but effective)
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
 * STRUCTURE CONTENT INTO SLATE-FRIENDLY BLOCKS
 */
function buildSections(text) {
  const chunks = text.split(". ").slice(0, 25);

  return chunks.map((c, i) => ({
    type: i === 0 ? "intro" : "body",
    text: c.trim()
  }));
}

/**
 * VALIDATION LAYER
 */
function validateAI(output) {
  if (!output) throw new Error("Empty AI response");

  const required = [
    "headline",
    "subheadline",
    "cta_primary",
    "cta_secondary",
    "body_copy",
    "meta_description"
  ];

  for (const key of required) {
    if (!(key in output)) {
      throw new Error(`Missing field: ${key}`);
    }
  }

  return true;
}

/**
 * OPENAI CALL WITH RETRY
 */
async function generateCopy(payload, retries = 2) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        temperature: 0.2,
        messages: [
          {
            role: "system",
            content: `
You are a higher education enrollment copywriting engine.

RULES:
- Return ONLY valid JSON
- No markdown
- No commentary
- All keys required
- If unknown, use ""

OUTPUT FORMAT:
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
          },
          {
            role: "user",
            content: JSON.stringify(payload)
          }
        ]
      });

      const raw = completion.choices[0].message.content;

      let parsed;

      try {
        parsed = JSON.parse(raw);
      } catch (e) {
        throw new Error("Invalid JSON returned by model");
      }

      validateAI(parsed);

      return parsed;

    } catch (err) {
      if (attempt === retries) throw err;
    }
  }
}

/**
 * HEALTH CHECK
 */
app.get("/", (req, res) => {
  res.json({
    status: "Slate AI Layer v2 running",
    time: new Date().toISOString()
  });
});

/**
 * PAGE SCAN (NOW MEANINGFUL VARIATION)
 */
app.post("/api/scan-washburn", async (req, res) => {
  const results = {};

  try {
    for (const page of pages) {
      const html = (await axios.get(page.url, { timeout: 12000 })).data;

      const text = extractText(html);
      const sections = buildSections(text);

      const wordCount = text.split(" ").length;

      const ctaSignals = ["apply", "visit", "tour", "enroll", "request"];
      let ctaScore = 0;
      for (const s of ctaSignals) {
        if (text.toLowerCase().includes(s)) ctaScore++;
      }

      const clarityScore = Math.min(
        100,
        Math.round((wordCount / 20) + ctaScore * 10)
      );

      const geoScore = Math.min(
        100,
        Math.round(clarityScore * 0.6 + ctaScore * 8)
      );

      results[page.name] = {
        url: page.url,
        wordCount,
        ctaScore,
        clarityScore,
        geoScore,
        sectionsCount: sections.length
      };
    }

    const values = Object.values(results);

    const avgGeo =
      values.reduce((a, b) => a + (b.geoScore || 0), 0) / values.length;

    res.json({
      status: "success",
      overallGeoScore: Math.round(avgGeo),
      pages: results,
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
 * AI COPY ENGINE (NOW STABLE + RETRY + VALIDATION)
 */
app.post("/api/rewrite-page", async (req, res) => {
  if (!openai) {
    return res.status(500).json({
      status: "error",
      message: "OpenAI not configured"
    });
  }

  const { pageName, url, persona } = req.body;

  try {
    const html = (await axios.get(url)).data;
    const text = extractText(html);
    const sections = buildSections(text);

    const payload = {
      pageName,
      persona,
      sections
    };

    const result = await generateCopy(payload);

    res.json({
      status: "success",
      page: pageName,
      rewrite: result
    });

  } catch (err) {
    console.error("AI ERROR:", err.message);

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
  console.log(`Slate AI Layer v2 running on ${PORT}`);
});

const express = require("express");
const cors = require("cors");
const axios = require("axios");
require("dotenv").config();

let OpenAI;
let openai;

// OPTIONAL: only load OpenAI if installed + key exists
try {
  OpenAI = require("openai");
  if (process.env.OPENAI_API_KEY) {
    openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
} catch (e) {
  console.log("OpenAI not installed or disabled");
}

const app = express();

app.use(cors());
app.use(express.json());

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
 * PAGES TO SCAN
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
 * LIGHTWEIGHT PAGE SCANNER
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

        const hasTitle = lower.includes("<title>");
        const hasH1 = lower.includes("<h1>");
        const hasNav = lower.includes("<nav>");

        const ctaWords = [
          "apply",
          "visit",
          "tour",
          "admission",
          "enroll",
          "request",
          "start",
          "submit"
        ];

        let ctaScore = 0;
        for (const word of ctaWords) {
          if (lower.includes(word)) ctaScore++;
        }

        const clarityScore = Math.min(
          100,
          (hasTitle ? 25 : 0) +
          (hasH1 ? 25 : 0) +
          (hasNav ? 15 : 0) +
          ctaScore * 10
        );

        const geoScore = Math.min(
          100,
          Math.round(clarityScore * 0.7 + ctaScore * 5)
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

    const valid = Object.values(results).filter(r => r.geoScore !== undefined);

    const avgGeo =
      valid.length > 0
        ? Math.round(valid.reduce((a, b) => a + b.geoScore, 0) / valid.length)
        : 0;

    const avgClarity =
      valid.length > 0
        ? Math.round(valid.reduce((a, b) => a + b.clarityScore, 0) / valid.length)
        : 0;

    const insights = [];

    if (avgGeo < 70) insights.push("GEO visibility below target threshold");
    if ((results.apply?.ctaScore || 0) < 3) insights.push("Apply page weak CTA signals");
    if ((results.scholarships?.ctaScore || 0) < 2) insights.push("Scholarships page weak urgency language");

    if (!insights.length) {
      insights.push("Baseline UX structure is stable");
    }

    res.json({
      status: "success",
      overallGeoScore: avgGeo,
      overallClarityScore: avgClarity,
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
 * OPTIONAL AI REWRITE (SAFE GUARD)
 */
app.post("/api/rewrite-page", async (req, res) => {
  if (!openai) {
    return res.status(200).json({
      status: "disabled",
      message: "OpenAI not enabled on this deployment"
    });
  }

  const { pageName, url, persona } = req.body;

  if (!pageName || !url) {
    return res.status(400).json({
      status: "error",
      message: "Missing pageName or url"
    });
  }

  const styles = {
    highschool: "Write for high school seniors.",
    transfer: "Write for transfer students.",
    adult: "Write for adult learners."
  };

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "Return ONLY valid JSON. No markdown."
        },
        {
          role: "user",
          content: `
Rewrite this page:

URL: ${url}
Page: ${pageName}

Style:
${styles[persona] || styles.highschool}

Return:
headline, subheadline, cta_primary, cta_secondary, body_copy, meta_description, conversion_improvements
`
        }
      ],
      temperature: 0.7
    });

    const output = JSON.parse(completion.choices[0].message.content);

    res.json({
      status: "success",
      page: pageName,
      rewrite: output
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
/**
 * RAW AI DEBUG ENDPOINT
 * This bypasses ALL scoring logic and shows EXACT OpenAI output
 */
app.post("/api/debug-ai", async (req, res) => {
  const { url, pageName = "test-page" } = req.body;

  if (!url) {
    return res.status(400).json({
      error: "Missing url"
    });
  }

  try {
    const response = await axios.get(url, { timeout: 15000 });
    const html = response.data || "";

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `
You are a GEO analysis engine.

Return ONLY JSON. No commentary.
Be extremely detailed and return all fields.
`
        },
        {
          role: "user",
          content: `
Analyze this page:

PAGE: ${pageName}
URL: ${url}

HTML:
${html.slice(0, 12000)}

Return JSON:

{
  "geoScore": number,
  "clarityScore": number,
  "conversionScore": number,

  "why": [],
  "issues": [],
  "fixes": [],
  "conversionLeaks": [],

  "rawSignals": {
    "titleDetected": boolean,
    "ctaMentions": number,
    "h1Detected": boolean,
    "navDetected": boolean
  },

  "notes": "Explain reasoning in detail"
}
`
        }
      ]
    });

    const raw = completion?.choices?.[0]?.message?.content;

    return res.json({
      status: "debug",
      url,
      rawOpenAIOutput: raw,
      parsed: safeParse(raw)
    });

  } catch (err) {
    return res.status(500).json({
      status: "error",
      message: err.message
    });
  }
});
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

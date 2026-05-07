require("dotenv").config();
const express = require("express");
const axios = require("axios");
const cheerio = require("cheerio");
const OpenAI = require("openai");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const BASE = "https://www.washburn.edu";

// Grab a few internal links (light scan, safe)
async function getPages() {
  const home = await axios.get(BASE);
  const $ = cheerio.load(home.data);

  const links = [];

  $("a").each((_, el) => {
    const href = $(el).attr("href");

    if (!href) return;

    if (href.startsWith("/")) {
      links.push(BASE + href);
    }
  });

  return [...new Set(links)].slice(0, 6);
}

// MAIN SCAN ENDPOINT
app.post("/api/scan-washburn", async (req, res) => {
  try {
    const pages = await getPages();

    const content = [];

    for (const url of pages) {
      try {
        const page = await axios.get(url);
        const $ = cheerio.load(page.data);

        content.push({
          url,
          text: $("body").text().replace(/\s+/g, " ").slice(0, 1200)
        });
      } catch {}
    }

    const ai = await client.responses.create({
      model: "gpt-4.1-mini",
      input: `
You are a UX expert analyzing Washburn University’s website.

Return:
- UX issues
- clarity problems
- conversion improvements
- rewritten homepage messaging

CONTENT:
${JSON.stringify(content)}
`,
      response_format: { type: "json_object" }
    });

    res.json(JSON.parse(ai.output_text));

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(3001, () => {
  console.log("Washburn UX scanner running on http://localhost:3001");
});
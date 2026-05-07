const express = require("express");
const cors = require("cors");
const axios = require("axios");
require("dotenv").config();

const app = express();

app.use(cors());
app.use(express.json());

/**
 * HEALTH CHECK (TEST ROUTE)
 * Use this first to confirm Render + Slate connection works
 */
app.get("/", (req, res) => {
  res.json({
    status: "Washburn UX Backend Running",
    time: new Date().toISOString()
  });
});

/**
 * MAIN SLATE ENDPOINT
 * SAFE VERSION (NO AI YET — PREVENTS HANGING)
 */
app.post("/api/scan-washburn", async (req, res) => {
  console.log("AI UX SCAN STARTED");

  try {
    const pages = [
      "https://www.washburn.edu",
      "https://www.washburn.edu/admissions",
      "https://www.washburn.edu/academics",
      "https://www.washburn.edu/academics/colleges-schools"
    ];

    const results = [];

    for (const url of pages) {
      const page = await axios.get(url, { timeout: 10000 });
      const html = page.data;

      const titleMatch = html.match(/<title>(.*?)<\/title>/i);
      const h1Count = (html.match(/<h1/g) || []).length;
      const ctaWords = (html.match(/apply|visit|request info|get started/gi) || []).length;

      const uxScore =
        Math.max(
          0,
          100 -
          (h1Count === 0 ? 20 : 0) -
          (ctaWords < 2 ? 20 : 0) -
          (html.length < 5000 ? 10 : 0)
        );

      results.push({
        url,
        title: titleMatch?.[1] || "No title detected",
        metrics: {
          h1Count,
          ctaSignals: ctaWords,
          htmlSize: html.length
        },
        geoScore: uxScore,
        issues: [
          h1Count === 0 ? "Missing primary heading structure (H1)" : null,
          ctaWords < 2 ? "Weak conversion signaling (low CTA density)" : null
        ].filter(Boolean)
      });
    }

    const overallScore =
      Math.round(
        results.reduce((sum, r) => sum + r.geoScore, 0) / results.length
      );

    const conversionLeaks = results.flatMap(r => r.issues);

    const rewriteSuggestions = results.map(r => ({
      url: r.url,
      suggestedHeadline:
        r.geoScore < 70
          ? "Your Future Starts at Washburn University"
          : "Explore Your Path at Washburn University",
      suggestedCTA:
        r.geoScore < 70
          ? "Apply Today | Visit Campus | Request Info"
          : "Learn More | Explore Programs"
    }));

    res.json({
      status: "success",
      overallGeoScore,
      pages: results,
      conversionLeaks,
      rewriteSuggestions,
      timestamp: new Date().toISOString()
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({
      status: "error",
      message: err.message
    });
  }
});
    const html = page.data || "";

    // STEP 2: lightweight fake "analysis" (placeholder for AI later)
    const response = {
      status: "success",
      message: "Backend is working and Washburn homepage was reached",
      metrics: {
        htmlLength: html.length,
        hasTitleTag: html.includes("<title>"),
        hasNav: html.includes("<nav>")
      },
      issues: [
        "AI analysis temporarily disabled (stability mode)",
        "This confirms full pipeline connectivity"
      ],
      recommendations: [
        "Enable AI layer once deployment is stable",
        "Add structured page parsing next step"
      ],
      timestamp: new Date().toISOString()
    };

    return res.json(response);

  } catch (err) {
    console.error("ERROR:", err.message);

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
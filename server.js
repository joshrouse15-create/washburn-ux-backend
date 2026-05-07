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
  console.log("SCAN REQUEST RECEIVED");

  try {
    // STEP 1: confirm we can reach Washburn
    const page = await axios.get("https://www.washburn.edu", {
      timeout: 10000
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
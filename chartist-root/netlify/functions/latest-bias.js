// latest-bias.js
// Reads cached bias from Netlify Blobs → returns to dashboard
// No Claude call. No cost per user. Zero.

import { getStore } from "@netlify/blobs";

export default async function handler(req, context) {
  // CORS headers so dashboard can fetch from any domain
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Cache-Control": "public, max-age=300", // Browser caches for 5 min
  };

  // Handle preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers });
  }

  try {
    const store = getStore("chartist-bias");
    const biasData = await store.get("latest", { type: "json" });

    if (!biasData) {
      // No data yet — return a sensible default
      return new Response(
        JSON.stringify({
          error: "No bias data available yet",
          message: "Scheduled function has not run yet. Check back in a moment.",
          overall_bias: "NEUTRAL",
          confidence_score: 50,
          bias_summary: "Dashboard initialising. First analysis generating shortly.",
          pretrade: "Await first data generation before trading.",
          generated_at: null,
        }),
        { status: 200, headers }
      );
    }

    // Add freshness info for dashboard
    const generatedAt = new Date(biasData.generated_at);
    const ageMinutes = Math.round((Date.now() - generatedAt.getTime()) / 60000);
    biasData.age_minutes = ageMinutes;
    biasData.is_stale = ageMinutes > 150; // Flag if >2.5 hours old

    return new Response(JSON.stringify(biasData), { status: 200, headers });

  } catch (err) {
    console.error("latest-bias error:", err.message);
    return new Response(
      JSON.stringify({ error: "Failed to retrieve bias data", detail: err.message }),
      { status: 500, headers }
    );
  }
}

export const config = {
  path: "/api/latest-bias",
};

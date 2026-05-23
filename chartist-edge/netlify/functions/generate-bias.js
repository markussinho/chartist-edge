// generate-bias.js
// Runs every 2 hours via Netlify Scheduled Functions
// Calls Claude once → saves to Netlify Blobs → serves all users

import { getStore } from "@netlify/blobs";
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Decide which model to use based on time of day
// Sonnet at session opens (high impact), Haiku otherwise
function getModel() {
  const h = new Date().getUTCHours();
  const isSessionOpen = (h >= 7 && h <= 9) || (h >= 12 && h <= 14) || (h >= 22 && h <= 23);
  return isSessionOpen
    ? "claude-haiku-4-5-20251001"  // Use Haiku always - much cheaper, still good
    : "claude-haiku-4-5-20251001";
}

const PROMPT = `You are ChartistEdge — a macro intelligence platform for Gold (XAUUSD) traders.

Today is ${new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}.
Current UTC time: ${new Date().toUTCString().split(" ")[4]}.

SEARCH the web for:
1. Current XAUUSD spot price and today's intraday % change
2. Current DXY index level and direction
3. 10Y TIPS real yield current level
4. Any geopolitical news affecting Gold in the last 6 hours
5. Any Fed speakers today and their tone
6. Latest CFTC COT net speculative longs for Gold
7. Top 3 macro news events today that affect Gold

BIAS RULES (strict):
- Gold up >0.5% intraday = BULLISH
- Gold down >0.5% intraday = BEARISH
- NEUTRAL only if price flat <0.3% AND macro genuinely split
- confidence: 70-85 if strongly aligned, 55-70 if mixed, 40-55 if flat/split

PRE-TRADE: One sharp, actionable sentence for a Gold futures/CFD trader.
bias_summary: Two concise sentences. Include current price, primary driver, positioning implication.
All notes should use institutional language — interpret, don't just describe.

Respond ONLY with valid JSON, no markdown:
{
  "overall_bias": "BULLISH|BEARISH|NEUTRAL",
  "confidence_score": 72,
  "current_price": "3312.40",
  "price_change": "+0.42%",
  "price_dir": "up",
  "bias_summary": "Two sharp institutional sentences.",
  "pretrade": "One actionable sentence.",
  "dxy_signal": "bull|bear|neut",
  "dxy_note": "Sharp 1-sentence interpretation with DXY level.",
  "dxy_level": "99.2",
  "fed_signal": "bull|bear|neut",
  "fed_note": "Sharp 1-sentence interpretation.",
  "geo_signal": "bull|bear|neut",
  "geo_note": "Sharp 1-sentence interpretation.",
  "yields_signal": "bull|bear|neut",
  "yields_level": "1.92%",
  "cot_signal": "bull|bear|neut",
  "cot_longs": 156000,
  "cot_shorts": 49000,
  "news_events": [
    {"time": "HH:MM UTC", "name": "Event name", "impact": "high|med|low", "note": "Gold impact in one sentence."}
  ],
  "session_bias": {
    "london": "bull|bear|neut",
    "london_note": "One sentence.",
    "ny": "bull|bear|neut",
    "ny_note": "One sentence.",
    "asian": "bull|bear|neut",
    "asian_note": "One sentence."
  },
  "macro_conditions": "TREND_FOLLOWING|MIXED|EVENT_RISK|RISK_OFF",
  "generated_at": "${new Date().toISOString()}"
}`;

export default async function handler(req, context) {
  console.log("generate-bias: starting...");

  try {
    // Call Claude with web search
    const response = await client.messages.create({
      model: getModel(),
      max_tokens: 2000,
      tools: [{ type: "web_search_20250305", name: "web_search" }],
      messages: [{ role: "user", content: PROMPT }],
    });

    // Extract JSON from response
    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock) throw new Error("No text in response");

    const raw = textBlock.text
      .trim()
      .replace(/```json/g, "")
      .replace(/```/g, "")
      .trim();

    const s = raw.indexOf("{");
    const e = raw.lastIndexOf("}");
    if (s < 0 || e < 0) throw new Error("No JSON found");

    const biasData = JSON.parse(raw.slice(s, e + 1));

    // Add server timestamp
    biasData.generated_at = new Date().toISOString();
    biasData.model_used = getModel();

    // Save to Netlify Blobs
    const store = getStore("chartist-bias");
    await store.setJSON("latest", biasData);

    console.log("generate-bias: saved to Blobs successfully");
    console.log("Bias:", biasData.overall_bias, biasData.confidence_score + "%");

    return new Response(JSON.stringify({ success: true, bias: biasData.overall_bias }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("generate-bias error:", err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

export const config = {
  schedule: "0 */2 * * *", // Every 2 hours
};

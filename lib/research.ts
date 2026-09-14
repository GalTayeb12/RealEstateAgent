/**
 * AI web research for developer company verification.
 *
 * Calls Claude with the web_search server tool to research a company, then
 * stores the JSON result on DeveloperProfile.webResearchSummary.
 *
 * Designed to run in the background (via next/server `after()`), never blocking
 * the registration response. All failures are caught and stored gracefully.
 */

import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";

const UNAVAILABLE = JSON.stringify({
  summary: "Research unavailable",
  foundOnlinePresence: false,
  flagsOrConcerns: [],
});

const RESEARCH_PROMPT = (companyName: string, crn: string) =>
  `Research the company "${companyName}" (Israeli company registration number ${crn} if useful for disambiguation). ` +
  `Look for: news mentions, online reviews or reputation signals, general web presence (website, social media, listings), ` +
  `and anything relevant to their legitimacy or standing in the real estate development industry. ` +
  `Summarize findings in 2–4 short bullet points (each bullet a plain string in the "summary" field, newline-separated). ` +
  `If you can't find meaningful information, say so plainly rather than guessing. ` +
  `Return ONLY valid JSON — no markdown, no explanation — in exactly this shape:\n` +
  `{ "summary": "• bullet one\\n• bullet two", "foundOnlinePresence": true, "flagsOrConcerns": ["concern if any"] }`;

/**
 * Calls Claude with web_search to research the company.
 * Returns a JSON string matching { summary, foundOnlinePresence, flagsOrConcerns }.
 * Never throws — returns UNAVAILABLE string on any failure.
 */
async function callClaudeWithWebSearch(
  companyName: string,
  crn: string
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.warn("[research] ANTHROPIC_API_KEY not set — skipping web research");
    return UNAVAILABLE;
  }

  // 180-second timeout — web_search_20260209 with dynamic filtering can take ~60s alone.
  const client = new Anthropic({ apiKey, timeout: 180_000 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const webSearchTool: any = { type: "web_search_20260209", name: "web_search" };

  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: RESEARCH_PROMPT(companyName, crn) },
  ];

  // The web_search tool is server-side: Anthropic runs the search loop.
  // stop_reason === "pause_turn" means the server loop hit its iteration limit;
  // re-send the same messages and it resumes from where it stopped.
  // stop_reason === "end_turn" means Claude finished and produced text output.
  const MAX_ROUNDS = 5;
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      tools: [webSearchTool],
      messages,
    });

    if (response.stop_reason === "end_turn") {
      const textBlock = response.content.find((b) => b.type === "text");
      if (textBlock?.type === "text") {
        const raw = textBlock.text;
        // Claude sometimes prepends conversational text before the JSON object
        // (e.g. "I now have enough information…"). Extract the first { … } block.
        const jsonMatch = raw.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
          console.warn("[research] No JSON object found in response:", raw.slice(0, 200));
          return UNAVAILABLE;
        }
        try {
          const parsed = JSON.parse(jsonMatch[0]);
          // Validate shape — coerce types so the UI can rely on them.
          return JSON.stringify({
            summary: String(parsed.summary ?? ""),
            foundOnlinePresence: Boolean(parsed.foundOnlinePresence),
            flagsOrConcerns: Array.isArray(parsed.flagsOrConcerns)
              ? parsed.flagsOrConcerns.map(String)
              : [],
          });
        } catch {
          console.warn("[research] Failed to parse extracted JSON:", jsonMatch[0].slice(0, 200));
          return UNAVAILABLE;
        }
      }
      return UNAVAILABLE;
    }

    if (response.stop_reason === "pause_turn") {
      // Server search loop hit iteration cap; append and continue.
      messages.push({ role: "assistant", content: response.content });
      continue;
    }

    // Unexpected stop_reason — bail.
    console.warn("[research] Unexpected stop_reason:", response.stop_reason);
    break;
  }

  return UNAVAILABLE;
}

/**
 * Perform web research for a developer and persist the result.
 * Safe to call without await — all errors are caught internally.
 */
export async function performAndStoreResearch(
  developerUserId: string,
  companyName: string,
  crn: string
): Promise<void> {
  console.log(`[research] Starting web research for ${companyName} (CRN ${crn})`);
  try {
    const result = await callClaudeWithWebSearch(companyName, crn);
    await prisma.developerProfile.update({
      where: { userId: developerUserId },
      data: { webResearchSummary: result },
    });
    console.log(`[research] Stored result for ${companyName}`);
  } catch (err) {
    console.error("[research] Failed to store web research result:", err);
    // Best-effort: try to store failure note.
    try {
      await prisma.developerProfile.update({
        where: { userId: developerUserId },
        data: {
          webResearchSummary: JSON.stringify({
            summary: "Research failed — an error occurred during lookup.",
            foundOnlinePresence: false,
            flagsOrConcerns: [],
          }),
        },
      });
    } catch {
      // Nothing more we can do.
    }
  }
}

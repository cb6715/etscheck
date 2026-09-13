import { parseWithClaude } from "./claude-parser";
import { parseWithRules } from "./rule-based-parser";
import { simulateActions, buildAssistantReply } from "./simulate";
import type { ParseContext, ParseResult } from "./briefing-types";

export type { BriefingAction, ParseContext, ParseResult, ShiftValue } from "./briefing-types";
export { simulateActions, buildAssistantReply } from "./simulate";

/**
 * Parses a free-text briefing message into structured work-plan actions.
 * Tries the real Claude API first when ANTHROPIC_API_KEY is configured,
 * and falls back to a deterministic Danish rule-based parser otherwise
 * (or if the API call fails for any reason).
 */
export async function parseBriefingMessage(
  text: string,
  context: ParseContext,
  opts: { isFirstToday: boolean }
): Promise<ParseResult> {
  let result: ParseResult | null = null;

  if (process.env.ANTHROPIC_API_KEY) {
    result = await parseWithClaude(text, context);
  }

  if (!result) {
    result = parseWithRules(text, context);
  }

  if (!result.assistantReply && !result.clarification) {
    const simulation = simulateActions(result.actions, context.existingItems);
    result.assistantReply = buildAssistantReply(simulation, {
      isFirstToday: opts.isFirstToday,
      singleUpdateOnly: !result.requiresConfirmation,
    });
  }

  return result;
}

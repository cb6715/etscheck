import type { BriefingAction, ParseContext, ParseResult } from "./briefing-types";

const SYSTEM_PROMPT = (existingSummary: string) => `Du er en arbejdsassistent i en dansk arbejdsapp for en vaskeplads/lager (trailervask, juletræer, paller, kødkroge, drive-in-kunder m.m.).

Brugeren skriver en kort besked på naturligt dansk om dagens arbejde. Omdan beskeden til strukturerede handlinger via værktøjet "update_work_plan".

Kendte kategorier (brug præcis disse navne når de passer): Vaske, Juletræer, Paller, Kødkroge, Rengøring, Modtagelser, Drive-in, På plads. Nævner brugeren noget andet, så opret en almindelig opgave (create_plain_task) i stedet.

Dagens eksisterende opgaver lige nu: ${existingSummary || "ingen endnu"}.

Regler:
- "X styk af kategori Y i dag" / "der er X Y" → create_quantity_item (total=X) hvis kategorien ikke findes endnu.
- "N er taget/klaret/pakket/ryddet" → increment_done (delta=N). Nævnes "nathold"/"natholdet" → shift=NATHOLD, ellers DAGHOLD.
- "der kommer N mere / senere" → increase_total (deltaTotal=N).
- "de sidste er færdige" / "alle er klaret" uden tal → mark_category_complete.
- Er en oplysning tvetydig eller mangler et tal du har brug for (fx "der kommer nogle paller" uden antal), så sæt IKKE actions for den del - sæt i stedet clarificationQuestion til et kort, konkret spørgsmål.
- requiresConfirmation skal være true hvis beskeden opretter/ændrer 3 eller flere ting på én gang (typisk den første store morgenbriefing), ellers false for små, entydige opdateringer.
- assistantReply skal være et kort, varmt svar på dansk der opsummerer hvad du har forstået/opdateret. Brug gerne emojis som i eksemplerne (🚛🎄📦🪝✅👍).
- Skriv aldrig om noget brugeren ikke har nævnt.`;

const TOOL = {
  name: "update_work_plan",
  description: "Opdaterer dagens arbejdsplan ud fra brugerens naturlige sprog-besked.",
  input_schema: {
    type: "object" as const,
    properties: {
      actions: {
        type: "array",
        items: {
          type: "object",
          properties: {
            type: {
              type: "string",
              enum: [
                "create_quantity_item",
                "increase_total",
                "increment_done",
                "mark_category_complete",
                "create_plain_task",
                "add_note",
              ],
            },
            category: { type: "string" },
            total: { type: "number" },
            deltaTotal: { type: "number" },
            delta: { type: "number" },
            shift: { type: "string", enum: ["DAGHOLD", "NATHOLD", "ANDRE"] },
            title: { type: "string" },
            text: { type: "string" },
          },
          required: ["type"],
        },
      },
      clarificationQuestion: { type: "string" },
      requiresConfirmation: { type: "boolean" },
      assistantReply: { type: "string" },
    },
    required: ["actions", "requiresConfirmation", "assistantReply"],
  },
};

export async function parseWithClaude(
  text: string,
  context: ParseContext
): Promise<ParseResult | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const existingSummary = context.existingItems
    .map((i) => `${i.category}: ${i.done}/${i.total}`)
    .join(", ");

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_BRIEFING_MODEL || "claude-sonnet-5",
        max_tokens: 1024,
        system: SYSTEM_PROMPT(existingSummary),
        tools: [TOOL],
        tool_choice: { type: "tool", name: "update_work_plan" },
        messages: [{ role: "user", content: text }],
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) return null;
    const data = await res.json();
    const toolUse = data.content?.find(
      (c: { type: string }) => c.type === "tool_use"
    ) as { input?: Record<string, unknown> } | undefined;
    if (!toolUse?.input) return null;

    const input = toolUse.input as {
      actions?: BriefingAction[];
      clarificationQuestion?: string;
      requiresConfirmation?: boolean;
      assistantReply?: string;
    };

    return {
      assistantReply: input.assistantReply ?? "",
      actions: Array.isArray(input.actions) ? input.actions : [],
      requiresConfirmation: !!input.requiresConfirmation,
      clarification: input.clarificationQuestion
        ? { question: input.clarificationQuestion, pendingAction: { kind: "increment_done" } }
        : undefined,
      usedAi: true,
    };
  } catch {
    return null;
  }
}

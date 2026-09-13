import { getCategoryMeta } from "./category-meta";
import type { BriefingAction, ExistingItemContext } from "./briefing-types";

export type SimulatedCategoryState = {
  category: string;
  icon: string;
  unit: string;
  total: number;
  done: number;
  natholdDone: number;
  isNew: boolean;
  justCompleted: boolean;
};

export type SimulationResult = {
  categories: Map<string, SimulatedCategoryState>;
  touchedCategories: string[];
  plainTasks: { title: string; category?: string }[];
  notes: string[];
};

export function simulateActions(
  actions: BriefingAction[],
  existingItems: ExistingItemContext[]
): SimulationResult {
  const categories = new Map<string, SimulatedCategoryState>();
  const touched = new Set<string>();

  for (const item of existingItems) {
    if (!categories.has(item.category)) {
      const meta = getCategoryMeta(item.category);
      categories.set(item.category, {
        category: item.category,
        icon: meta.icon,
        unit: meta.unit,
        total: item.total,
        done: item.done,
        natholdDone: 0,
        isNew: false,
        justCompleted: false,
      });
    }
  }

  const plainTasks: { title: string; category?: string }[] = [];
  const notes: string[] = [];

  function ensure(category: string): SimulatedCategoryState {
    let state = categories.get(category);
    if (!state) {
      const meta = getCategoryMeta(category);
      state = {
        category,
        icon: meta.icon,
        unit: meta.unit,
        total: 0,
        done: 0,
        natholdDone: 0,
        isNew: true,
        justCompleted: false,
      };
      categories.set(category, state);
    }
    return state;
  }

  for (const action of actions) {
    switch (action.type) {
      case "create_quantity_item": {
        const state = ensure(action.category);
        if (state.total === 0) state.total = action.total;
        touched.add(action.category);
        break;
      }
      case "increase_total": {
        const state = ensure(action.category);
        state.total += action.deltaTotal;
        touched.add(action.category);
        break;
      }
      case "increment_done": {
        const state = ensure(action.category);
        state.done = Math.min(state.total || state.done + action.delta, state.done + action.delta);
        if (action.shift === "NATHOLD") state.natholdDone += action.delta;
        touched.add(action.category);
        break;
      }
      case "mark_category_complete": {
        const state = ensure(action.category);
        state.done = state.total;
        state.justCompleted = true;
        touched.add(action.category);
        break;
      }
      case "create_plain_task": {
        plainTasks.push({ title: action.title, category: action.category });
        break;
      }
      case "add_note": {
        notes.push(action.text);
        break;
      }
    }
  }

  return { categories, touchedCategories: Array.from(touched), plainTasks, notes };
}

export function buildAssistantReply(
  simulation: SimulationResult,
  opts: { isFirstToday: boolean; singleUpdateOnly: boolean }
): string {
  const { categories, touchedCategories, plainTasks } = simulation;
  const catList = touchedCategories
    .map((name) => categories.get(name))
    .filter((c): c is SimulatedCategoryState => !!c);

  if (opts.singleUpdateOnly && catList.length === 1 && plainTasks.length === 0) {
    const c = catList[0];
    if (c.justCompleted) {
      return `✅ ${c.icon} ${c.category} er nu klaret (${c.total} / ${c.total}).`;
    }
    const remaining = Math.max(c.total - c.done, 0);
    return `Opdateret 👍 ${c.icon} ${c.category}: ${c.done} / ${c.total} færdige${
      remaining > 0 ? ` — ${remaining} tilbage.` : "."
    }`;
  }

  if (opts.singleUpdateOnly && catList.length === 0 && plainTasks.length === 1) {
    return `👍 Tilføjet: ${plainTasks[0].title}.`;
  }

  const lines: string[] = [];
  lines.push("Godmorgen 👋");
  lines.push("");
  lines.push("Jeg har opdateret din arbejdsdag:");
  lines.push("");

  for (const c of catList) {
    lines.push(`${c.icon} ${c.category}`);
    lines.push(`${c.total} i alt`);
    if (c.natholdDone > 0) lines.push(`${c.natholdDone} taget af natholdet`);
    const remaining = Math.max(c.total - c.done, 0);
    if (c.done >= c.total && c.total > 0) {
      lines.push(`✓ Færdig`);
    } else {
      lines.push(`${remaining} tilbage`);
    }
    lines.push("");
  }

  if (plainTasks.length > 0) {
    lines.push("📋 Andre opgaver");
    for (const t of plainTasks) lines.push(`• ${t.title}`);
    lines.push("");
  }

  if (opts.isFirstToday) {
    lines.push("Sig endelig til hvis der er mere, jeg skal vide om dagen 🙂");
  }

  return lines.join("\n").trim();
}

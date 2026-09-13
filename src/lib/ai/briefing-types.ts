export type ShiftValue = "DAGHOLD" | "NATHOLD" | "ANDRE";

export type BriefingAction =
  | {
      type: "create_quantity_item";
      category: string;
      total: number;
      unit?: string;
    }
  | {
      type: "increase_total";
      category: string;
      deltaTotal: number;
    }
  | {
      type: "increment_done";
      category: string;
      delta: number;
      shift?: ShiftValue;
      shiftLabel?: string;
    }
  | {
      type: "mark_category_complete";
      category: string;
    }
  | {
      type: "create_plain_task";
      title: string;
      category?: string;
    }
  | {
      type: "add_note";
      text: string;
    };

export type PendingClarification = {
  question: string;
  pendingAction:
    | { kind: "increase_total"; category: string }
    | { kind: "increment_done"; category?: string }
    | { kind: "create_quantity_item"; category: string };
};

export type ExistingItemContext = {
  taskId: string;
  category: string;
  total: number;
  done: number;
};

export type ParseContext = {
  existingItems: ExistingItemContext[];
};

export type ParseResult = {
  assistantReply: string;
  actions: BriefingAction[];
  requiresConfirmation: boolean;
  clarification?: PendingClarification;
  usedAi: boolean;
};

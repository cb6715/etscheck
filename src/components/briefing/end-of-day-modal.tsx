"use client";

import { useEffect, useState, useTransition } from "react";
import { Moon, ArrowRight, X, Check } from "lucide-react";
import { Modal, Button, Card } from "@/components/ui/primitives";
import { getEndOfDaySummary, finalizeWorkday, type EndOfDaySummary, type EndOfDayDecisionInput } from "@/lib/actions/briefing";

export function EndOfDayModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [summary, setSummary] = useState<EndOfDaySummary | null>(null);
  const [decisions, setDecisions] = useState<Record<string, EndOfDayDecisionInput["decision"]>>({});
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (open) {
      setDone(false);
      getEndOfDaySummary().then(setSummary);
    }
  }, [open]);

  function setDecision(taskId: string, decision: EndOfDayDecisionInput["decision"]) {
    setDecisions((prev) => ({ ...prev, [taskId]: decision }));
  }

  function submit() {
    if (!summary) return;
    const payload: EndOfDayDecisionInput[] = [
      ...summary.quantityItems.map((i) => ({
        taskId: i.taskId,
        decision: decisions[i.taskId] ?? "carry_over",
      })),
      ...summary.otherOpenTasks.map((t) => ({
        taskId: t.taskId,
        decision: decisions[t.taskId] ?? "carry_over",
      })),
    ] as EndOfDayDecisionInput[];

    startTransition(async () => {
      await finalizeWorkday(payload);
      setDone(true);
    });
  }

  return (
    <Modal open={open} onClose={onClose} title="Afslut arbejdsdag">
      {!summary ? (
        <p className="text-sm text-muted">Indlæser...</p>
      ) : done ? (
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-success text-white">
            <Check size={32} strokeWidth={3} />
          </div>
          <p className="font-bold">Arbejdsdagen er afsluttet</p>
          <p className="text-sm text-muted">God arbejdslyst i morgen 👋</p>
          <Button onClick={onClose}>Luk</Button>
        </div>
      ) : (
        <div>
          <div className="mb-4 grid grid-cols-3 gap-2 text-center">
            <StatBox label="Planlagt" value={summary.plannedCount} />
            <StatBox label="Færdig" value={summary.doneCount} tone="success" />
            <StatBox label="Mangler" value={summary.missingCount} tone="warning" />
          </div>

          {summary.quantityItems.length === 0 && summary.otherOpenTasks.length === 0 ? (
            <Card className="mb-4 p-4 text-center text-sm font-semibold text-success">
              🎉 Alt er klaret i dag!
            </Card>
          ) : (
            <>
              <p className="mb-2 text-sm font-bold uppercase tracking-wide text-muted">
                Mangler til i morgen
              </p>
              <div className="mb-4 space-y-2">
                {summary.quantityItems.map((i) => (
                  <RemainingItemRow
                    key={i.taskId}
                    label={`${i.icon} ${i.remaining} ${i.category.toLowerCase()}`}
                    decision={decisions[i.taskId] ?? "carry_over"}
                    onChange={(d) => setDecision(i.taskId, d)}
                  />
                ))}
                {summary.otherOpenTasks.map((t) => (
                  <RemainingItemRow
                    key={t.taskId}
                    label={`📋 ${t.title}`}
                    decision={decisions[t.taskId] ?? "carry_over"}
                    onChange={(d) => setDecision(t.taskId, d)}
                  />
                ))}
              </div>
            </>
          )}

          <Button fullWidth size="lg" onClick={submit} disabled={pending} className="flex items-center justify-center gap-2">
            <Moon size={18} /> {pending ? "Afslutter..." : "Afslut arbejdsdag"}
          </Button>
        </div>
      )}
    </Modal>
  );
}

function StatBox({ label, value, tone }: { label: string; value: number; tone?: "success" | "warning" }) {
  return (
    <Card className="p-3">
      <p
        className={`text-xl font-extrabold ${
          tone === "success" ? "text-success" : tone === "warning" ? "text-warning" : ""
        }`}
      >
        {value}
      </p>
      <p className="text-xs font-medium text-muted">{label}</p>
    </Card>
  );
}

function RemainingItemRow({
  label,
  decision,
  onChange,
}: {
  label: string;
  decision: EndOfDayDecisionInput["decision"];
  onChange: (d: EndOfDayDecisionInput["decision"]) => void;
}) {
  return (
    <Card className="p-3">
      <p className="mb-2 text-sm font-semibold">{label}</p>
      <div className="flex gap-1.5">
        <ChoiceButton
          active={decision === "carry_over"}
          onClick={() => onChange("carry_over")}
          icon={<ArrowRight size={12} />}
          label="Flyt til i morgen"
        />
        <ChoiceButton
          active={decision === "not_needed"}
          onClick={() => onChange("not_needed")}
          icon={<X size={12} />}
          label="Ikke nødvendig"
        />
        <ChoiceButton
          active={decision === "keep"}
          onClick={() => onChange("keep")}
          icon={<Check size={12} />}
          label="Afslut alligevel"
        />
      </div>
    </Card>
  );
}

function ChoiceButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-1 items-center justify-center gap-1 rounded-lg border px-2 py-1.5 text-[11px] font-semibold transition ${
        active ? "border-accent bg-accent/10 text-accent" : "border-border text-muted hover:bg-surface-2"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

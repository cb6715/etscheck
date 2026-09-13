"use client";

import { useState, useTransition } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Modal, Field, inputClass, Button } from "@/components/ui/primitives";
import { createTask, createTemplate } from "@/lib/actions/tasks";
import { weekdayShort } from "@/lib/date";
import type { Category } from "@prisma/client";

const RECURRENCE_OPTIONS = [
  { value: "INGEN", label: "Ingen (kun i dag)" },
  { value: "DAGLIGT", label: "Dagligt" },
  { value: "HVERDAGE", label: "Hverdage" },
  { value: "UGEDAGE", label: "Bestemte ugedage" },
  { value: "UGENTLIGT", label: "Ugentligt" },
  { value: "HVER_2_UGE", label: "Hver 2. uge" },
  { value: "MAANEDLIGT", label: "Månedligt" },
  { value: "DATO", label: "Bestemt dato" },
];

export function TaskFormModal({
  open,
  onClose,
  categories,
}: {
  open: boolean;
  onClose: () => void;
  categories: Category[];
}) {
  const [pending, startTransition] = useTransition();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [priority, setPriority] = useState<"NORMAL" | "VIGTIG" | "HASTER">("NORMAL");
  const [dueDate, setDueDate] = useState("");
  const [recurrence, setRecurrence] = useState("INGEN");
  const [weekdays, setWeekdays] = useState<number[]>([]);
  const [dayOfMonth, setDayOfMonth] = useState<number>(1);
  const [specificDate, setSpecificDate] = useState("");
  const [checklist, setChecklist] = useState<string[]>([]);
  const [error, setError] = useState("");

  function reset() {
    setTitle("");
    setDescription("");
    setCategoryId("");
    setPriority("NORMAL");
    setDueDate("");
    setRecurrence("INGEN");
    setWeekdays([]);
    setChecklist([]);
    setError("");
  }

  function handleClose() {
    reset();
    onClose();
  }

  function toggleWeekday(day: number) {
    setWeekdays((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]));
  }

  function submit() {
    if (!title.trim()) {
      setError("Navn på opgaven mangler.");
      return;
    }
    setError("");
    startTransition(async () => {
      try {
        if (recurrence === "INGEN") {
          await createTask({
            title,
            description,
            categoryId: categoryId || null,
            priority,
            dueDate: dueDate || null,
            checklist: checklist.filter((c) => c.trim()),
          });
        } else {
          await createTemplate({
            title,
            description,
            categoryId: categoryId || null,
            priority,
            recurrenceType: recurrence as never,
            weekdays,
            dayOfMonth: recurrence === "MAANEDLIGT" ? dayOfMonth : null,
            specificDate: recurrence === "DATO" ? specificDate : null,
            checklist: checklist.filter((c) => c.trim()),
          });
        }
        handleClose();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Kunne ikke gemme. Prøv igen.");
      }
    });
  }

  return (
    <Modal open={open} onClose={handleClose} title="Ny opgave">
      <div>
        <Field label="Navn" required>
          <input
            className={inputClass}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="F.eks. Tøm skraldespande"
            autoFocus
          />
        </Field>

        <Field label="Beskrivelse">
          <textarea
            className={inputClass}
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Valgfri beskrivelse"
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Kategori">
            <select
              className={inputClass}
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
            >
              <option value="">Ingen</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.icon} {c.name}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Prioritet">
            <select
              className={inputClass}
              value={priority}
              onChange={(e) => setPriority(e.target.value as never)}
            >
              <option value="NORMAL">🟢 Normal</option>
              <option value="VIGTIG">🟡 Vigtig</option>
              <option value="HASTER">🔴 Haster</option>
            </select>
          </Field>
        </div>

        <Field label="Deadline">
          <input
            type="date"
            className={inputClass}
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
          />
        </Field>

        <Field label="Gentagelse">
          <select
            className={inputClass}
            value={recurrence}
            onChange={(e) => setRecurrence(e.target.value)}
          >
            {RECURRENCE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>

        {recurrence === "UGEDAGE" && (
          <div className="mb-3 flex gap-1.5">
            {[1, 2, 3, 4, 5, 6, 0].map((day) => (
              <button
                key={day}
                type="button"
                onClick={() => toggleWeekday(day)}
                className={`flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold uppercase transition ${
                  weekdays.includes(day)
                    ? "bg-accent text-accent-foreground"
                    : "bg-surface-2 text-muted"
                }`}
              >
                {weekdayShort(day).slice(0, 2)}
              </button>
            ))}
          </div>
        )}

        {recurrence === "MAANEDLIGT" && (
          <Field label="Dag i måneden">
            <input
              type="number"
              min={1}
              max={31}
              className={inputClass}
              value={dayOfMonth}
              onChange={(e) => setDayOfMonth(Number(e.target.value))}
            />
          </Field>
        )}

        {recurrence === "DATO" && (
          <Field label="Dato">
            <input
              type="date"
              className={inputClass}
              value={specificDate}
              onChange={(e) => setSpecificDate(e.target.value)}
            />
          </Field>
        )}

        <Field label="Underopgaver">
          <div className="space-y-2">
            {checklist.map((item, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <input
                  className={inputClass}
                  value={item}
                  onChange={(e) =>
                    setChecklist((prev) => prev.map((p, i) => (i === idx ? e.target.value : p)))
                  }
                  placeholder={`Punkt ${idx + 1}`}
                />
                <button
                  type="button"
                  onClick={() => setChecklist((prev) => prev.filter((_, i) => i !== idx))}
                  className="shrink-0 rounded-lg p-2.5 text-muted hover:bg-surface-2 hover:text-danger"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => setChecklist((prev) => [...prev, ""])}
              className="flex items-center gap-1.5 text-sm font-semibold text-accent"
            >
              <Plus size={16} /> Tilføj underopgave
            </button>
          </div>
        </Field>

        {error && <p className="mb-3 text-sm font-medium text-danger">{error}</p>}

        <Button fullWidth size="lg" onClick={submit} disabled={pending}>
          {pending ? "Gemmer..." : "Gem opgave"}
        </Button>
      </div>
    </Modal>
  );
}

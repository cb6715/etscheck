"use client";

import { useState, useTransition } from "react";
import { Modal, Field, inputClass, Button } from "@/components/ui/primitives";
import { createNote } from "@/lib/actions/misc";

export function NoteFormModal({
  open,
  onClose,
  defaultProblem,
}: {
  open: boolean;
  onClose: () => void;
  defaultProblem: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [text, setText] = useState("");
  const [isProblem, setIsProblem] = useState(defaultProblem);
  const [error, setError] = useState("");

  function reset() {
    setText("");
    setIsProblem(defaultProblem);
    setError("");
  }

  function submit() {
    if (!text.trim()) {
      setError("Note mangler tekst.");
      return;
    }
    startTransition(async () => {
      try {
        await createNote({ text, targetType: "GENERAL", isProblem });
        reset();
        onClose();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Kunne ikke gemme. Prøv igen.");
      }
    });
  }

  return (
    <Modal
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      title={isProblem ? "Registrer problem" : "Ny note"}
    >
      <Field label={isProblem ? "Beskriv problemet" : "Note"} required>
        <textarea
          className={inputClass}
          rows={4}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={isProblem ? "F.eks. Slange utæt på trailer 114." : "Skriv en note..."}
          autoFocus
        />
      </Field>

      <label className="mb-4 flex items-center gap-2 text-sm font-medium">
        <input
          type="checkbox"
          checked={isProblem}
          onChange={(e) => setIsProblem(e.target.checked)}
          className="h-4 w-4 accent-danger"
        />
        ⚠️ Marker som problem
      </label>

      {error && <p className="mb-3 text-sm font-medium text-danger">{error}</p>}

      <Button fullWidth size="lg" variant={isProblem ? "danger" : "primary"} onClick={submit} disabled={pending}>
        {pending ? "Gemmer..." : "Gem"}
      </Button>
    </Modal>
  );
}

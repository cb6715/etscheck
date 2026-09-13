"use client";

import { useState, useTransition } from "react";
import { Droplets, StickyNote } from "lucide-react";
import { Button, Modal, inputClass } from "@/components/ui/primitives";
import { updateTrailerStatus, addTrailerNote } from "@/lib/actions/trailers";

export function TrailerActions({ trailerId }: { trailerId: string; note: string | null }) {
  const [pending, startTransition] = useTransition();
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteText, setNoteText] = useState("");

  return (
    <div className="flex gap-3">
      <Button
        className="flex flex-1 items-center justify-center gap-2"
        onClick={() => startTransition(() => updateTrailerStatus(trailerId, "VASKET"))}
        disabled={pending}
      >
        <Droplets size={18} /> Marker som vasket
      </Button>
      <Button variant="secondary" onClick={() => setNoteOpen(true)} className="flex items-center gap-2">
        <StickyNote size={18} /> Note
      </Button>

      <Modal open={noteOpen} onClose={() => setNoteOpen(false)} title="Tilføj note">
        <textarea
          className={inputClass}
          rows={3}
          value={noteText}
          onChange={(e) => setNoteText(e.target.value)}
          placeholder="F.eks. Trailer mangler ny slange."
          autoFocus
        />
        <Button
          fullWidth
          className="mt-3"
          onClick={() =>
            startTransition(async () => {
              await addTrailerNote(trailerId, noteText);
              setNoteText("");
              setNoteOpen(false);
            })
          }
        >
          Gem note
        </Button>
      </Modal>
    </div>
  );
}

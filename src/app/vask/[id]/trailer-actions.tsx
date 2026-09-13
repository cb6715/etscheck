"use client";

import { useState, useTransition } from "react";
import { Droplets, StickyNote } from "lucide-react";
import { Button, Modal, inputClass } from "@/components/ui/primitives";
import { MarkWashedModal } from "@/components/trailers/mark-washed-modal";
import { addTrailerNote } from "@/lib/actions/trailers";

export function TrailerActions({
  trailerId,
  trailerNumber,
  company,
}: {
  trailerId: string;
  trailerNumber: string;
  note: string | null;
  company: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const [noteOpen, setNoteOpen] = useState(false);
  const [washModalOpen, setWashModalOpen] = useState(false);
  const [noteText, setNoteText] = useState("");

  return (
    <div className="flex gap-3">
      <Button
        className="flex flex-1 items-center justify-center gap-2"
        onClick={() => setWashModalOpen(true)}
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
          disabled={pending}
        >
          Gem note
        </Button>
      </Modal>

      <MarkWashedModal
        open={washModalOpen}
        onClose={() => setWashModalOpen(false)}
        trailerId={trailerId}
        trailerNumber={trailerNumber}
        defaultCompany={company}
      />
    </div>
  );
}

"use client";

import { useRef, useState, useTransition } from "react";
import { FileText, Upload, Trash2, Info } from "lucide-react";
import { Card, Button } from "@/components/ui/primitives";
import { uploadContract, deleteContract, type ContractRow } from "@/lib/contracts";

function formatSize(bytes: number): string {
  return bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function ContractsSection({ initialContracts }: { initialContracts: ContractRow[] }) {
  const [contracts, setContracts] = useState(initialContracts);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  function upload() {
    const file = fileInputRef.current?.files?.[0];
    if (!file) {
      setError("Vælg en fil først.");
      return;
    }
    setError("");
    const formData = new FormData();
    formData.append("file", file);
    startTransition(async () => {
      const result = await uploadContract(formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setContracts((c) => [
        { id: result.data.id, filename: file.name, content_type: file.type, size_bytes: file.size, extraction_status: "ai_unavailable", extracted_fields: null, confirmed_fields: null, created_at: new Date() },
        ...c,
      ]);
      if (fileInputRef.current) fileInputRef.current.value = "";
    });
  }

  function remove(id: number) {
    setContracts((c) => c.filter((x) => x.id !== id));
    startTransition(async () => {
      await deleteContract(id);
    });
  }

  return (
    <Card className="space-y-3 p-5">
      <h2 className="flex items-center gap-2 text-sm font-extrabold">
        <FileText size={16} /> Kontrakt
      </h2>
      <p className="flex items-start gap-2 text-xs text-[var(--muted)]">
        <Info size={14} className="mt-0.5 shrink-0" />
        Vi læser endnu ikke kontrakten automatisk med AI — det kræver en API-nøgle, der ikke er sat op i denne app
        endnu. Filen gemmes sikkert og privat (ikke en offentlig URL), som en bekvem kopi — du skal stadig selv
        indtaste løntallene oven for under lønindstillinger.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <input ref={fileInputRef} type="file" accept="application/pdf,image/png,image/jpeg" className="text-sm" />
        <Button onClick={upload} disabled={pending} size="sm" className="flex items-center gap-1.5">
          <Upload size={14} /> Upload
        </Button>
      </div>
      {error && <p className="text-sm font-semibold text-[var(--danger)]">{error}</p>}
      {contracts.length > 0 && (
        <ul className="space-y-1.5">
          {contracts.map((c) => (
            <li key={c.id} className="glass flex items-center justify-between gap-2 rounded-xl p-2.5">
              <span className="min-w-0 truncate text-sm font-semibold">{c.filename}</span>
              <span className="flex shrink-0 items-center gap-2 text-xs text-[var(--muted)]">
                {formatSize(c.size_bytes)}
                <button type="button" onClick={() => remove(c.id)} className="text-[var(--danger)]">
                  <Trash2 size={14} />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

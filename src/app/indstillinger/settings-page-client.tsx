"use client";

import { useState, useTransition } from "react";
import { Plus, Trash2, Settings as SettingsIcon, RotateCw, Wallet } from "lucide-react";
import { Card, Button, Badge, Modal, Field, inputClass, EmptyState } from "@/components/ui/primitives";
import { createCategory, deleteCategory } from "@/lib/actions/misc";
import { toggleTemplateActive, deleteTemplate } from "@/lib/actions/tasks";
import { WageSettingsForm } from "@/components/settings/wage-settings-form";
import { RECURRENCE_LABELS } from "@/lib/recurrence";
import { weekdayShort } from "@/lib/date";
import type { WageConfig } from "@/lib/wage/engine";
import type { Prisma } from "@prisma/client";

type Category = Prisma.CategoryGetPayload<object>;
type TemplateWithRelations = Prisma.TaskTemplateGetPayload<{
  include: { checklistItems: true; category: true };
}>;

const ICON_OPTIONS = ["🧹", "🚛", "🚗", "🔧", "📦", "🧼", "🗑️", "📋"];
const COLOR_OPTIONS = ["#22c55e", "#3b82f6", "#f59e0b", "#a855f7", "#ef4444", "#64748b"];

export function SettingsPageClient({
  categories,
  templates,
  wageSettings,
}: {
  categories: Category[];
  templates: TemplateWithRelations[];
  wageSettings: WageConfig;
}) {
  const [, startTransition] = useTransition();
  const [catModalOpen, setCatModalOpen] = useState(false);
  const [name, setName] = useState("");
  const [icon, setIcon] = useState(ICON_OPTIONS[0]);
  const [color, setColor] = useState(COLOR_OPTIONS[0]);

  function submitCategory() {
    if (!name.trim()) return;
    startTransition(async () => {
      await createCategory(name, icon, color);
      setName("");
      setCatModalOpen(false);
    });
  }

  return (
    <div className="space-y-8 pb-4">
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <SettingsIcon size={24} /> Indstillinger
        </h1>
      </header>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wide text-muted">Kategorier</h2>
          <Button size="sm" onClick={() => setCatModalOpen(true)} className="flex items-center gap-1.5">
            <Plus size={16} /> Ny kategori
          </Button>
        </div>
        {categories.length === 0 ? (
          <EmptyState icon="📦" title="Ingen kategorier endnu" />
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {categories.map((c) => (
              <Card key={c.id} className="flex items-center justify-between p-3">
                <span className="flex items-center gap-2 text-sm font-semibold">
                  <span>{c.icon}</span>
                  {c.name}
                </span>
                <button
                  onClick={() => startTransition(() => deleteCategory(c.id))}
                  className="rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-danger"
                >
                  <Trash2 size={14} />
                </button>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-1.5 text-sm font-bold uppercase tracking-wide text-muted">
            <RotateCw size={14} /> Gentagne opgaver
          </h2>
        </div>
        {templates.length === 0 ? (
          <EmptyState icon="🔁" title="Ingen faste rutiner endnu" description="Opret en opgave med gentagelse under Arbejde." />
        ) : (
          <div className="space-y-2">
            {templates.map((t) => (
              <Card key={t.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 font-semibold">
                      {t.category && <span>{t.category.icon}</span>}
                      {t.title}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <Badge tone="info">{RECURRENCE_LABELS[t.recurrenceType]}</Badge>
                      {t.recurrenceType === "UGEDAGE" &&
                        t.weekdays.map((d) => (
                          <Badge key={d}>{weekdayShort(d)}</Badge>
                        ))}
                      {!t.active && <Badge tone="warning">Deaktiveret</Badge>}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      onClick={() => startTransition(() => toggleTemplateActive(t.id))}
                      className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold hover:bg-surface-2"
                    >
                      {t.active ? "Deaktiver" : "Aktiver"}
                    </button>
                    <button
                      onClick={() => startTransition(() => deleteTemplate(t.id))}
                      className="rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-danger"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-1.5 text-sm font-bold uppercase tracking-wide text-muted">
            <Wallet size={14} /> Løn
          </h2>
        </div>
        <WageSettingsForm settings={wageSettings} />
      </section>

      <section>
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted">Om appen</h2>
        <Card className="p-4 text-sm text-muted">
          <p className="font-semibold text-foreground">Arbejdsapp v1.0</p>
          <p>Din arbejdsdag, overskuelig og hurtig.</p>
        </Card>
      </section>

      <Modal open={catModalOpen} onClose={() => setCatModalOpen(false)} title="Ny kategori">
        <Field label="Navn" required>
          <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </Field>
        <Field label="Ikon">
          <div className="flex flex-wrap gap-2">
            {ICON_OPTIONS.map((i) => (
              <button
                key={i}
                onClick={() => setIcon(i)}
                className={`flex h-10 w-10 items-center justify-center rounded-xl border-2 text-lg transition ${
                  icon === i ? "border-accent bg-[var(--accent-a10)]" : "border-border"
                }`}
              >
                {i}
              </button>
            ))}
          </div>
        </Field>
        <Field label="Farve">
          <div className="flex flex-wrap gap-2">
            {COLOR_OPTIONS.map((c) => (
              <button
                key={c}
                onClick={() => setColor(c)}
                style={{ background: c }}
                className={`h-8 w-8 rounded-full border-2 transition ${
                  color === c ? "border-foreground" : "border-transparent"
                }`}
              />
            ))}
          </div>
        </Field>
        <Button fullWidth size="lg" onClick={submitCategory}>
          Opret kategori
        </Button>
      </Modal>
    </div>
  );
}

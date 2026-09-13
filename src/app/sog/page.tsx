"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Search as SearchIcon } from "lucide-react";
import { Card, Badge, EmptyState, inputClass } from "@/components/ui/primitives";
import { globalSearch } from "@/lib/actions/misc";
import { formatShortDate } from "@/lib/date";
import { TrailerStatusBadge } from "@/components/trailers/trailer-status-badge";
import { PriorityBadge } from "@/components/tasks/priority-badge";

type SearchResult = Awaited<ReturnType<typeof globalSearch>>;

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult | null>(null);
  const [, startTransition] = useTransition();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim()) {
      setResults(null);
      return;
    }
    debounceRef.current = setTimeout(() => {
      startTransition(async () => {
        const r = await globalSearch(query);
        setResults(r);
      });
    }, 250);
  }, [query]);

  const totalResults = results
    ? results.tasks.length + results.trailers.length + results.customers.length + results.companies.length
    : 0;

  return (
    <div className="space-y-6 pb-4">
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <SearchIcon size={24} /> Søg
        </h1>
        <p className="mt-1 text-sm text-muted">Søg efter nummerplade, firma, ref.nr., trailer, opgave eller dato</p>
      </header>

      <input
        className={`${inputClass} text-lg`}
        placeholder="Søg..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        autoFocus
      />

      {!query.trim() && (
        <EmptyState icon="🔎" title="Begynd at skrive for at søge" description="Nummerplade, firma, trailer eller opgave" />
      )}

      {query.trim() && results && totalResults === 0 && (
        <EmptyState icon="🔎" title="Ingen resultater fundet" description={`Intet matcher "${query}"`} />
      )}

      {results && results.customers.length > 0 && (
        <ResultSection title="Kunder / nummerplader">
          {results.customers.map((c) => (
            <Link key={c.id} href={`/drive-in/kunde/${c.licensePlate}`}>
              <Card className="p-4 transition hover:border-accent/40">
                <p className="font-mono font-bold">{c.licensePlateDisplay}</p>
                <p className="text-sm text-muted">
                  {c.company?.name ?? "Uden firma"}
                  {c.visits[0] ? ` · Seneste besøg ${formatShortDate(new Date(c.visits[0].visitedAt))}` : ""}
                </p>
              </Card>
            </Link>
          ))}
        </ResultSection>
      )}

      {results && results.companies.length > 0 && (
        <ResultSection title="Firmaer">
          {results.companies.map((c) => (
            <Link key={c.id} href={`/drive-in/firma/${c.id}`}>
              <Card className="flex items-center justify-between p-4 transition hover:border-accent/40">
                <p className="font-bold">{c.name}</p>
                <Badge>{c._count.visits} besøg</Badge>
              </Card>
            </Link>
          ))}
        </ResultSection>
      )}

      {results && results.trailers.length > 0 && (
        <ResultSection title="Trailere">
          {results.trailers.map((t) => (
            <Link key={t.id} href={`/vask/${t.id}`}>
              <Card className="flex items-center justify-between p-4 transition hover:border-accent/40">
                <p className="font-bold">Trailer #{t.number}</p>
                <TrailerStatusBadge status={t.status} />
              </Card>
            </Link>
          ))}
        </ResultSection>
      )}

      {results && results.tasks.length > 0 && (
        <ResultSection title="Opgaver">
          {results.tasks.map((t) => (
            <Card key={t.id} className="flex items-center justify-between p-4">
              <p className="font-bold">{t.title}</p>
              <PriorityBadge priority={t.priority} />
            </Card>
          ))}
        </ResultSection>
      )}
    </div>
  );
}

function ResultSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted">{title}</h2>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

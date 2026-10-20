"use client";

import { useEffect, useState, useTransition } from "react";
import { MapPin, Plus, Trash2, Crosshair, Navigation, AlertTriangle } from "lucide-react";
import { Card, Field, inputClass, Button, Badge } from "@/components/ui/primitives";
import { createWorkplace, deleteWorkplace, updateWorkplace, type WorkplaceRow } from "@/lib/workplace-actions";
import { getCurrentPosition, nearestWorkplaces, geolocationSupported, type WorkplaceProximity } from "@/lib/geolocation";

export function ArbejdsstederClient({ initialWorkplaces }: { initialWorkplaces: WorkplaceRow[] }) {
  const [workplaces, setWorkplaces] = useState(initialWorkplaces);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");

  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [radiusMeters, setRadiusMeters] = useState("150");
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);

  const [checking, setChecking] = useState(false);
  const [proximity, setProximity] = useState<WorkplaceProximity[] | null>(null);
  const [checkError, setCheckError] = useState("");

  // geolocationSupported() reads `navigator`, which doesn't exist during
  // server rendering — checking it directly in render would make the
  // server-rendered HTML and the first client render disagree (React
  // hydration mismatch). Defaulting to "supported" and only flipping to
  // false after mount means the warning can briefly not show on an
  // unsupported browser instead, never a hydration error.
  const [geoSupported, setGeoSupported] = useState(true);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- genuinely syncing with an external system (navigator), only knowable after mount, not derivable from props/state.
    setGeoSupported(geolocationSupported());
  }, []);

  async function useMyLocation() {
    setLocating(true);
    setError("");
    const result = await getCurrentPosition();
    setLocating(false);
    if (result.status === "ok") {
      setCoords({ lat: result.lat, lng: result.lng });
    } else if (result.status === "denied") {
      setError("Du har ikke givet adgang til din placering i browseren — slå det til under browserens site-indstillinger for at bruge den her.");
    } else if (result.status === "unsupported") {
      setError("Din browser understøtter ikke geolocation.");
    } else {
      setError("Kunne ikke finde din placering: " + result.message);
    }
  }

  function add() {
    if (!name.trim()) {
      setError("Giv arbejdsstedet et navn.");
      return;
    }
    setError("");
    startTransition(async () => {
      const result = await createWorkplace({
        name: name.trim(),
        address: address.trim() || undefined,
        lat: coords?.lat,
        lng: coords?.lng,
        radiusMeters: Number(radiusMeters) || 150,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setWorkplaces((w) => [
        ...w,
        { id: result.data.id, name: name.trim(), address: address.trim() || null, lat: coords?.lat ?? null, lng: coords?.lng ?? null, radius_meters: Number(radiusMeters) || 150, enabled: true },
      ]);
      setName("");
      setAddress("");
      setCoords(null);
      setRadiusMeters("150");
    });
  }

  function remove(id: number) {
    setWorkplaces((w) => w.filter((x) => x.id !== id));
    startTransition(async () => {
      await deleteWorkplace(id);
    });
  }

  function toggleEnabled(id: number, enabled: boolean) {
    setWorkplaces((w) => w.map((x) => (x.id === id ? { ...x, enabled } : x)));
    startTransition(async () => {
      await updateWorkplace(id, { enabled });
    });
  }

  async function checkNow() {
    setChecking(true);
    setCheckError("");
    setProximity(null);
    const result = await getCurrentPosition();
    setChecking(false);
    if (result.status !== "ok") {
      setCheckError(
        result.status === "denied"
          ? "Du har ikke givet adgang til din placering."
          : result.status === "unsupported"
            ? "Din browser understøtter ikke geolocation."
            : "Kunne ikke finde din placering lige nu."
      );
      return;
    }
    setProximity(nearestWorkplaces(result.lat, result.lng, workplaces));
  }

  return (
    <div className="space-y-5">
      <Card className="space-y-3 p-5">
        <h2 className="text-sm font-extrabold">Tjek om du er på arbejde</h2>
        <p className="text-xs text-[var(--muted)]">
          En engangs-afstandstjek, lige nu — ikke en baggrunds-tracker. WageFlow (eller nogen anden webapp) kan ikke
          holde øje med din placering, mens siden er lukket; det er en begrænsning i selve browseren/telefonen, ikke
          noget vi har valgt fra. Tryk knappen, mens du har appen åben, for at se om du er tæt på et gemt arbejdssted.
        </p>
        {!geoSupported && (
          <p className="flex items-center gap-2 text-sm font-semibold text-[var(--danger)]">
            <AlertTriangle size={14} /> Din browser understøtter ikke geolocation.
          </p>
        )}
        <Button onClick={checkNow} disabled={checking} className="flex items-center gap-2">
          <Navigation size={16} /> {checking ? "Finder dig..." : "Tjek afstand nu"}
        </Button>
        {checkError && <p className="text-sm font-semibold text-[var(--danger)]">{checkError}</p>}
        {proximity && (
          <ul className="space-y-1.5">
            {proximity.length === 0 && <li className="text-sm text-[var(--muted)]">Ingen arbejdssteder har en gemt placering endnu.</li>}
            {proximity.map((p) => (
              <li key={p.workplaceId} className="flex items-center justify-between text-sm">
                <span className="font-semibold">{p.workplaceName}</span>
                <Badge tone={p.withinRadius ? "success" : "default"}>
                  {p.withinRadius ? "Du er her — " : ""}
                  {Math.round(p.distanceMeters)} m
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="space-y-3 p-5">
        <h2 className="text-sm font-extrabold">Tilføj arbejdssted</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Navn" required>
            <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} placeholder="f.eks. Butikken" />
          </Field>
          <Field label="Adresse (valgfri, til eget overblik)">
            <input className={inputClass} value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Gadenavn 1, 0000 By" />
          </Field>
          <Field label="Radius for 'du er her' (meter)">
            <input className={inputClass} type="number" value={radiusMeters} onChange={(e) => setRadiusMeters(e.target.value)} />
          </Field>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" onClick={useMyLocation} disabled={locating} className="flex items-center gap-2">
            <Crosshair size={16} /> {locating ? "Finder..." : "Brug min nuværende placering"}
          </Button>
          {coords && <Badge tone="success">Placering gemt til dette arbejdssted</Badge>}
        </div>
        <p className="text-xs text-[var(--muted)]">
          Der er ikke sat nogen adresse-opslagstjeneste op, så placeringen kommer fra GPS&apos;en i din telefon/computer,
          lige nu, der hvor du står — ikke fra den tekst, du skriver i adressefeltet. Stå på arbejdsstedet, når du
          trykker knappen, for at gemme den rigtige placering.
        </p>
        {error && <p className="text-sm font-semibold text-[var(--danger)]">{error}</p>}
        <Button onClick={add} disabled={pending} className="flex items-center gap-2">
          <Plus size={16} /> Tilføj
        </Button>
      </Card>

      <Card className="space-y-3 p-5">
        <h2 className="text-sm font-extrabold">Dine arbejdssteder</h2>
        {workplaces.length === 0 && <p className="text-sm text-[var(--muted)]">Ingen arbejdssteder tilføjet endnu.</p>}
        <ul className="space-y-2">
          {workplaces.map((w) => (
            <li key={w.id} className="glass flex items-center justify-between gap-3 rounded-2xl p-3">
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 text-sm font-bold">
                  <MapPin size={14} /> {w.name}
                </p>
                <p className="text-xs text-[var(--muted)]">
                  {w.address || "Ingen adresse"} · {w.lat !== null ? `${w.radius_meters} m radius` : "Ingen placering gemt endnu"}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() => toggleEnabled(w.id, !w.enabled)}
                  className="text-xs font-semibold text-[var(--accent)] underline underline-offset-2"
                >
                  {w.enabled ? "Aktiv" : "Slået fra"}
                </button>
                <button type="button" onClick={() => remove(w.id)} className="text-[var(--danger)]">
                  <Trash2 size={16} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

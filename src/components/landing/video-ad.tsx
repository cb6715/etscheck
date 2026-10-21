"use client";

import { useState } from "react";
import Image from "next/image";
import { Play } from "lucide-react";
import { Card } from "@/components/ui/primitives";

const VIDEO_SRC = "/ads/wageflow-reklame.mp4";
const POSTER_SRC = "/ads/wageflow-reklame-poster.jpg";
const CAPTIONS_SRC = "/ads/wageflow-reklame.da.vtt";

// Text version of the ad, so the message is available without sound, video
// or JavaScript-heavy playback (and as the fallback if the file fails).
const TRANSCRIPT = [
  "Har du styr på dine arbejdstimer?",
  "Vagter. Pauser. Overarbejde.",
  "Se din løn tælle op — live.",
  "Dit arbejde. Dine timer. Dit overblik.",
];

/**
 * Click-to-play ad. The <video> element is not even rendered until the visitor
 * taps play, so the mp4 is never requested on page load: only the small poster
 * is fetched. It never autoplays on its own, and the clip has no audio track.
 */
export function VideoAd() {
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(false);

  return (
    <div className="mx-auto w-full max-w-[280px] sm:max-w-[300px]">
      <Card className="overflow-hidden p-2" elevated>
        <div className="relative aspect-[9/16] w-full overflow-hidden rounded-[22px] bg-black">
          {playing && !failed ? (
            <video
              className="absolute inset-0 h-full w-full object-cover"
              controls
              autoPlay
              playsInline
              preload="auto"
              poster={POSTER_SRC}
              onError={() => setFailed(true)}
              aria-label="Reklamefilm for WageFlow"
            >
              <source src={VIDEO_SRC} type="video/mp4" />
              <track kind="captions" srcLang="da" label="Dansk" src={CAPTIONS_SRC} default />
              Din browser kan ikke afspille videoen.
            </video>
          ) : (
            <>
              <Image
                src={POSTER_SRC}
                alt="Medarbejder efter en lang arbejdsdag — spørgsmålet: Har du styr på dine arbejdstimer?"
                width={720}
                height={1280}
                unoptimized
                className="absolute inset-0 h-full w-full object-cover"
              />
              {failed ? (
                <div className="absolute inset-x-0 bottom-0 bg-black/70 px-4 py-3 text-center text-xs font-semibold text-white">
                  Videoen kunne ikke indlæses lige nu. Læs budskabet nedenfor.
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setPlaying(true)}
                  className="absolute inset-0 flex items-center justify-center bg-black/20 transition hover:bg-black/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-white"
                  aria-label="Afspil reklamefilm (22 sekunder, uden lyd)"
                >
                  <span className="glass-strong flex h-16 w-16 items-center justify-center rounded-full text-[var(--accent)]">
                    <Play size={26} fill="currentColor" aria-hidden="true" />
                  </span>
                </button>
              )}
            </>
          )}
        </div>
      </Card>

      <details className="mt-3 text-center text-xs text-[var(--muted)]" open={failed}>
        <summary className="cursor-pointer font-semibold underline underline-offset-2">
          Læs reklamen som tekst
        </summary>
        <ol className="mt-2 space-y-1">
          {TRANSCRIPT.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ol>
      </details>
    </div>
  );
}

import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Vagtløn",
    short_name: "Vagtløn",
    description: "Tjek ind, tjek ud, se din løn — med det samme.",
    start_url: "/",
    display: "standalone",
    background_color: "#0a0814",
    theme_color: "#7c3aed",
    orientation: "portrait",
    icons: [
      { src: "/icon-192", sizes: "192x192", type: "image/png" },
      { src: "/icon-192", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icon-512", sizes: "512x512", type: "image/png" },
      { src: "/icon-512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}

import type { MetadataRoute } from "next";

/** docs/08-UI-UX-SPEC.md section 9. Served at /manifest.webmanifest. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "HouseOS",
    short_name: "HouseOS",
    description:
      "Shared-house management: chores that are visible and fairly distributed, money that is tracked and settled.",
    start_url: "/home",
    display: "standalone",
    background_color: "#0C0A09",
    theme_color: "#0F766E",
    orientation: "portrait",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      { name: "Add expense", url: "/expenses/new" },
      { name: "My chores", url: "/chores/mine" },
    ],
  };
}

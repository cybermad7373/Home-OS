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
    background_color: "#000000",
    theme_color: "#000000",
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
    // A shortcut is a long-press on the installed icon, so a wrong URL here is
    // a 404 nobody sees until the app is on a home screen. `/expenses/new` has
    // never existed: adding an expense is the sheet the ledger opens with
    // `?add=1`, which is also what the universal quick-add links to.
    shortcuts: [
      { name: "Add expense", url: "/expenses?add=1" },
      { name: "My chores", url: "/chores/mine" },
    ],
  };
}

import { ImageResponse } from "next/og";

/**
 * The card a link to HouseOS unfurls into.
 *
 * Generated rather than a checked-in PNG: it is drawn from the same two
 * sentences the product leads with on its sign-in screen, so it cannot drift
 * away from them, and there is no binary in the repository to forget to
 * regenerate.
 *
 * It says nothing about any household, because the only pages a crawler or a
 * chat app will ever unfurl are the two ways in and the three documents. An
 * invite link is public too, and it deliberately does not get its own image —
 * a preview naming a real home would leak it into every group chat the link is
 * pasted into.
 */

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "HouseOS — the work and the money, both visible";

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#ffffff",
          padding: "72px 80px",
          fontFamily: "ui-sans-serif, system-ui, sans-serif",
          // The dot grid the sign-in screen and every empty state use.
          backgroundImage: "radial-gradient(#e4e4e7 1px, transparent 1px)",
          backgroundSize: "24px 24px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div
            style={{
              width: 14,
              height: 14,
              borderRadius: 999,
              background: "#d92d20",
            }}
          />
          <div
            style={{
              fontSize: 26,
              letterSpacing: 6,
              fontWeight: 600,
              color: "#151a21",
            }}
          >
            HOUSEOS
          </div>
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            fontSize: 88,
            lineHeight: 1.05,
            fontWeight: 700,
            letterSpacing: -3,
            color: "#151a21",
          }}
        >
          <div>The work</div>
          <div>and the money,</div>
          <div>both visible.</div>
        </div>

        <div style={{ display: "flex", fontSize: 30, color: "#6c7686" }}>
          Chores that are shared fairly. Money that is settled honestly.
        </div>
      </div>
    ),
    size,
  );
}

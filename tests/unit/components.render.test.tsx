import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Card, CardShell, CardCore } from "@/components/ui/card";
import { Readout } from "@/components/ui/readout";

/**
 * The test the repository did not have.
 *
 * `<Card>` shipped for a whole release spreading `{...props}` — `children`
 * included — onto a div that then declared its own JSX child, so React threw
 * the caller's content away and rendered an empty rounded rectangle. It was on
 * 128 call sites. Nothing failed: there were no component tests, and the
 * `include` globs would not have run one if there had been.
 *
 * So this asserts the least interesting thing a component can do, on the
 * primitives that the whole app is built out of: given children, render them.
 */
describe("primitives render their children", () => {
  for (const [name, Component] of [
    ["Card", Card],
    ["CardShell", CardShell],
    ["CardCore", CardCore],
  ] as const) {
    it(`${name} renders children`, () => {
      const html = renderToStaticMarkup(
        createElement(Component, null, createElement("span", null, "content")),
      );
      expect(html).toContain("content");
    });

    it(`${name} lets a caller override the default padding`, () => {
      const html = renderToStaticMarkup(
        createElement(Component, { className: "p-0" }, createElement("span", null, "content")),
      );
      // tailwind-merge drops the default rather than emitting both and leaving
      // the outcome to stylesheet order.
      expect(html).toContain("p-0");
      expect(html).not.toContain("p-4");
    });
  }
});

describe("Readout", () => {
  it("splits the currency symbol out of the dot-matrix digits", () => {
    const html = renderToStaticMarkup(createElement(Readout, { value: "₹1,240" }));
    expect(html).toContain("₹");
    expect(html).toContain("1,240");
    // The symbol is set in the mono face, because Doto has no rupee glyph.
    expect(html).toContain("font-mono");
  });

  it("leaves a bare number alone", () => {
    const html = renderToStaticMarkup(createElement(Readout, { value: "48" }));
    expect(html).not.toContain("font-mono");
  });
});

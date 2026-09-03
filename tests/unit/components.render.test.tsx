import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Alert, AlertBanner } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardAction,
  CardContent,
  CardCore,
  CardDescription,
  CardFooter,
  CardHeader,
  CardShell,
  CardTitle,
} from "@/components/ui/card";
import { Chip, ChipRow } from "@/components/ui/chip";
import { Field, Label } from "@/components/ui/label";
import { List, Section } from "@/components/layout/section";
import { Input, Select, Textarea } from "@/components/ui/input";
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

/**
 * `Select` shipped with the same defect `Card` had — a hard-coded JSX child
 * overriding the spread `children` — so every `<option>` any caller passed was
 * discarded and thirty-six selects across the app rendered as empty boxes. And
 * `Input` set `placeholder:text-transparent` for a floating label that was
 * never positioned, so no placeholder in the app was visible.
 */
describe("form controls", () => {
  it("Select renders the options it was given", () => {
    const html = renderToStaticMarkup(
      createElement(
        Select,
        { defaultValue: "2026-09", "aria-label": "Month" },
        createElement("option", { value: "2026-09" }, "September 2026"),
        createElement("option", { value: "2026-08" }, "August 2026"),
      ),
    );
    expect(html).toContain("September 2026");
    expect(html).toContain("August 2026");
  });

  it("Input shows its placeholder", () => {
    const html = renderToStaticMarkup(
      createElement(Input, { placeholder: "paid 840 for vegetables yesterday" }),
    );
    expect(html).toContain("paid 840 for vegetables yesterday");
    expect(html).not.toContain("placeholder:text-transparent");
  });

  it("a caller's size beats the default", () => {
    const html = renderToStaticMarkup(createElement(Input, { className: "h-9" }));
    expect(html).toContain("h-9");
    expect(html).not.toContain("h-11");
  });

  it("renders nothing around a bare control", () => {
    // A wrapper div would break every caller that sizes the control inside a
    // flex row.
    const html = renderToStaticMarkup(createElement(Input, { "aria-label": "Amount" }));
    expect(html.startsWith("<input")).toBe(true);
  });

  it("labels the control when asked, and links the two", () => {
    const html = renderToStaticMarkup(
      createElement(Textarea, { label: "Note", error: "Say something" }),
    );
    expect(html).toContain("Note");
    expect(html).toContain("Say something");
    expect(html).toMatch(/for="([^"]+)"[^]*id="\1"/);
  });
});

/**
 * A sweep over every primitive that takes children, so the class of bug that
 * hit `Card` and `Select` cannot hide in a third one. Two of the app's most
 * used components shipped rendering nothing; a test this cheap would have
 * caught both on the day they were written.
 */
describe("every primitive that takes children renders them", () => {
  const cases: [string, (child: React.ReactNode) => React.ReactElement][] = [
    ["Alert", (child) => createElement(Alert, null, child)],
    ["AlertBanner", (child) => createElement(AlertBanner, null, child)],
    ["Badge", (child) => createElement(Badge, null, child)],
    ["Chip", (child) => createElement(Chip, null, child)],
    ["ChipRow", (child) => createElement(ChipRow, null, child)],
    ["Label", (child) => createElement(Label, null, child)],
    ["Field", (child) => createElement(Field, { label: "L", htmlFor: "x", children: child })],
    ["CardHeader", (child) => createElement(CardHeader, null, child)],
    ["CardTitle", (child) => createElement(CardTitle, null, child)],
    ["CardDescription", (child) => createElement(CardDescription, null, child)],
    ["CardContent", (child) => createElement(CardContent, null, child)],
    ["CardFooter", (child) => createElement(CardFooter, null, child)],
    ["CardAction", (child) => createElement(CardAction, null, child)],
    ["Section", (child) => createElement(Section, { label: "S", children: child })],
    ["List", (child) => createElement(List, null, createElement("li", null, child))],
  ];

  for (const [name, render] of cases) {
    it(name, () => {
      expect(renderToStaticMarkup(render("content"))).toContain("content");
    });
  }
});

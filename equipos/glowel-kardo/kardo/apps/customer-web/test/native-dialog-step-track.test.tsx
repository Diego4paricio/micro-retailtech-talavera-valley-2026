import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { NativeDialog } from "../src/components/NativeDialog.js";
import { StepTrack } from "../src/components/StepTrack.js";

describe("NativeDialog", () => {
  it("passes its props to the <dialog> and renders the children while open", () => {
    const html = renderToStaticMarkup(
      <NativeDialog
        aria-label="Menú"
        className="mobile-nav"
        data-scrim="light"
        exitMs={200}
        onClose={() => undefined}
        open
      >
        <p>Dentro</p>
      </NativeDialog>,
    );
    expect(html).toContain("<dialog");
    expect(html).toContain('aria-label="Menú"');
    expect(html).toContain('class="mobile-nav"');
    expect(html).toContain('data-scrim="light"');
    expect(html).toContain('data-state="open"');
    expect(html).toContain("<p>Dentro</p>");
  });

  it("renders no children while closed", () => {
    const html = renderToStaticMarkup(
      <NativeDialog exitMs={200} open={false}>
        <p>Dentro</p>
      </NativeDialog>,
    );
    expect(html).toContain('data-state="closed"');
    expect(html).not.toContain("Dentro");
  });
});

describe("StepTrack locked steps", () => {
  const items = [
    { label: "Uno", done: true, locked: false },
    { label: "Dos", done: false, locked: true },
  ];

  it("shows locked steps as plain text and the others as buttons", () => {
    const html = renderToStaticMarkup(
      <StepTrack current={1} items={items} onSelect={() => undefined} />,
    );
    expect(html.match(/<button/g)).toHaveLength(1);
    expect(html).toContain('aria-current="step"');
  });
});

import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createDevBridgeCustomHtmlModel } from "../src/custom-html/dev-bridge-model.js";
import {
  runDesignReview,
  runHtmlBlockReview,
} from "../src/design-ai/design-generate.js";

// ---------------------------------------------------------------------------
// End-to-end dev bridge coverage for AI in blocks (2026-09-30), with no
// ANTHROPIC_API_KEY at all: a fake "answering agent" watches the same
// pending/ folder the real Claude Code session would, following
// scripts/dev/ai-bridge/README.md's protocol by hand. Mirrors
// custom-html-dev-bridge.test.ts's shape for the modo HTML path.
// ---------------------------------------------------------------------------

async function waitForFile(filePath: string, timeoutMs = 2_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      await stat(filePath);
      return;
    } catch {
      if (Date.now() > deadline)
        throw new Error(`Timed out waiting for ${filePath}`);
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
}

async function tempBridgeDir(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), "kardo-design-ai-bridge-"));
}

const validLinksDesign = {
  schema: 1,
  style: {
    palette: {
      background: "#ffffff",
      surface: "#ffffff",
      text: "#111111",
      muted: "#666666",
      accent: "#2563eb",
    },
    fonts: { heading: "system", body: "system" },
    radius: 12,
    buttonStyle: "solid",
    buttonShape: "pill",
    shadow: "none",
    background: { kind: "solid", color: "#ffffff" },
    maxWidth: 480,
  },
  sections: [
    {
      id: "s-1",
      layout: "1",
      columns: [
        [
          { id: "b-1", kind: "contentTitle" },
          { id: "b-2", kind: "contentLinks", layout: "list" },
        ],
      ],
      paddingTop: 32,
      paddingBottom: 16,
      gap: 16,
      align: "center",
    },
  ],
};

// Missing the required `contentLinks` bound block for a "links" Experience:
// `checkDesign` must reject this with "The design must keep contentLinks.".
const invalidLinksDesign = {
  ...validLinksDesign,
  sections: [
    {
      ...validLinksDesign.sections[0],
      columns: [[{ id: "b-1", kind: "contentTitle" }]],
    },
  ],
};

describe("dev bridge: full page design generation (AI in blocks)", () => {
  it("writes the turn contract as 'design', asks for a fix in Spanish when checkDesign rejects the draft, and returns the corrected design on turn 2", async () => {
    const dir = await tempBridgeDir();
    const model = createDevBridgeCustomHtmlModel({
      dir,
      nodeEnv: "development",
      pollIntervalMs: 10,
    });

    const reviewPromise = runDesignReview({
      model,
      type: "links",
      system: "SYSTEM",
      userMessage: "Diseña la página",
      images: [],
      contentItemIds: ["link-1"],
      allowedImageRefs: new Set(),
      allowHtmlBlocks: false,
    });

    // Turn 1: find the pending file (any jobId), confirm it states the
    // "design" contract, and answer with an invalid draft.
    const pendingDir = path.join(dir, "pending");
    let turn1Path: string | undefined;
    await waitForFile(pendingDir);
    for (let attempt = 0; attempt < 200 && !turn1Path; attempt += 1) {
      const entries = await import("node:fs/promises").then((fs) =>
        fs.readdir(pendingDir).catch(() => []),
      );
      turn1Path = entries.find((name) => name.endsWith(".turn1.json"));
      if (!turn1Path) await new Promise((resolve) => setTimeout(resolve, 10));
    }
    if (!turn1Path) throw new Error("turn1 pending file never appeared");
    const jobId = turn1Path.replace(/\.turn1\.json$/, "");
    const turn1Pending = JSON.parse(
      await readFile(path.join(pendingDir, turn1Path), "utf8"),
    );
    expect(turn1Pending.responseContract).toBe("design");
    expect(turn1Pending.maxTurns).toBe(3);

    await writeFile(
      path.join(dir, "done", `${jobId}.turn1.json`),
      JSON.stringify({
        text: JSON.stringify({
          design: invalidLinksDesign,
          notes: "Primer intento.",
        }),
      }),
      "utf8",
    );

    // Turn 2: the pending file must now ask, in Spanish, for exactly the
    // problem checkDesign found.
    const turn2PendingPath = path.join(dir, "pending", `${jobId}.turn2.json`);
    await waitForFile(turn2PendingPath);
    const turn2Pending = JSON.parse(await readFile(turn2PendingPath, "utf8"));
    expect(turn2Pending.responseContract).toBe("design");
    const lastMessageText = turn2Pending.messages.at(-1).content[0]
      .text as string;
    expect(lastMessageText).toContain("no pasó la validación");
    expect(lastMessageText).toContain("contentLinks");
    // Never a guion largo in Kardo's own generated Spanish text.
    expect(lastMessageText).not.toMatch(/[–—]/);

    await writeFile(
      path.join(dir, "done", `${jobId}.turn2.json`),
      JSON.stringify({
        text: JSON.stringify({ design: validLinksDesign, notes: "Corregido." }),
      }),
      "utf8",
    );

    const result = await reviewPromise;
    expect(result.notes).toBe("Corregido.");
    expect(result.audit.provider).toBe("dev-bridge");
    expect(result.audit.turns).toBe(2);
    expect(result.design.sections[0]?.columns?.[0]?.map((b) => b.kind)).toEqual(
      ["contentTitle", "contentLinks"],
    );

    // Every job file is cleaned up once the generation ends.
    expect(await stat(pendingDir).then((s) => s.isDirectory())).toBe(true);
    const leftover = await import("node:fs/promises").then((fs) =>
      fs.readdir(pendingDir),
    );
    expect(leftover).toHaveLength(0);
  }, 15_000);

  it("strips an invented image ref (kept as a placeholder) and fixes a bad id instead of burning a correction turn on them", async () => {
    const dir = await tempBridgeDir();
    const model = createDevBridgeCustomHtmlModel({
      dir,
      nodeEnv: "development",
      pollIntervalMs: 10,
    });

    const draftWithBadImage = {
      ...validLinksDesign,
      sections: [
        {
          ...validLinksDesign.sections[0],
          columns: [
            [
              // Repeats an id already reserved by the content, and an image
              // block pointing at a made-up asset that was never offered.
              { id: "link-1", kind: "contentTitle" },
              {
                id: "img",
                kind: "image",
                imageRef: "11111111-1111-1111-1111-111111111111",
                alt: "foto",
                aspect: "auto",
                fit: "cover",
              },
              { id: "b-2", kind: "contentLinks", layout: "list" },
            ],
          ],
        },
      ],
    };

    const reviewPromise = runDesignReview({
      model,
      type: "links",
      system: "SYSTEM",
      userMessage: "Diseña la página",
      images: [],
      contentItemIds: ["link-1"],
      allowedImageRefs: new Set(), // no real image offered: the fake ref is stripped
      allowHtmlBlocks: false,
    });

    const pendingDir = path.join(dir, "pending");
    await waitForFile(pendingDir);
    let turn1Path: string | undefined;
    for (let attempt = 0; attempt < 200 && !turn1Path; attempt += 1) {
      const entries = await import("node:fs/promises").then((fs) =>
        fs.readdir(pendingDir).catch(() => []),
      );
      turn1Path = entries.find((name) => name.endsWith(".turn1.json"));
      if (!turn1Path) await new Promise((resolve) => setTimeout(resolve, 10));
    }
    if (!turn1Path) throw new Error("turn1 pending file never appeared");
    const jobId = turn1Path.replace(/\.turn1\.json$/, "");

    await writeFile(
      path.join(dir, "done", `${jobId}.turn1.json`),
      JSON.stringify({
        text: JSON.stringify({ design: draftWithBadImage, notes: "Listo." }),
      }),
      "utf8",
    );

    const result = await reviewPromise;
    // Resolved in a single turn: the bad id and the invented image ref were
    // fixed before validation, not sent back as a correction request. "Sin
    // banco de fotos" (2026-10-03): the image block itself stays (as an
    // "espacio para foto"), only its made-up ref is gone.
    expect(result.audit.turns).toBe(1);
    const blocks = result.design.sections[0]?.columns?.[0] as {
      kind: string;
      id: string;
      imageRef?: string;
    }[];
    const kinds = blocks?.map((b) => b.kind);
    expect(kinds).toEqual(["contentTitle", "image", "contentLinks"]);
    const imageBlock = blocks?.find((b) => b.kind === "image");
    expect(imageBlock?.imageRef).toBeUndefined();
    const ids = blocks?.map((b) => b.id);
    expect(ids).not.toContain("link-1"); // reserved by content; must be renamed
    expect(new Set(ids).size).toBe(ids?.length);
  }, 15_000);
});

describe("dev bridge: one html block (the inspector's 'Pedir a la IA')", () => {
  it("writes the turn contract as 'html-block' and returns a clean answer", async () => {
    const dir = await tempBridgeDir();
    const model = createDevBridgeCustomHtmlModel({
      dir,
      nodeEnv: "development",
      pollIntervalMs: 10,
    });

    const reviewPromise = runHtmlBlockReview({
      model,
      system: "SYSTEM",
      userMessage: "Diseña este bloque",
      images: [],
    });

    const pendingDir = path.join(dir, "pending");
    await waitForFile(pendingDir);
    let turn1Path: string | undefined;
    for (let attempt = 0; attempt < 200 && !turn1Path; attempt += 1) {
      const entries = await import("node:fs/promises").then((fs) =>
        fs.readdir(pendingDir).catch(() => []),
      );
      turn1Path = entries.find((name) => name.endsWith(".turn1.json"));
      if (!turn1Path) await new Promise((resolve) => setTimeout(resolve, 10));
    }
    if (!turn1Path) throw new Error("turn1 pending file never appeared");
    const jobId = turn1Path.replace(/\.turn1\.json$/, "");
    const pending = JSON.parse(
      await readFile(path.join(pendingDir, turn1Path), "utf8"),
    );
    expect(pending.responseContract).toBe("html-block");

    await writeFile(
      path.join(dir, "done", `${jobId}.turn1.json`),
      JSON.stringify({
        text: JSON.stringify({
          html: '<div class="horario">Lun a vie 9 a 18</div>',
          css: ".horario{font-weight:600}",
          notes: "Tarjeta de horario.",
        }),
      }),
      "utf8",
    );

    const result = await reviewPromise;
    expect(result.html).toContain("Lun a vie");
    expect(result.css).toContain("horario");
    expect(result.audit.provider).toBe("dev-bridge");
  }, 15_000);
});

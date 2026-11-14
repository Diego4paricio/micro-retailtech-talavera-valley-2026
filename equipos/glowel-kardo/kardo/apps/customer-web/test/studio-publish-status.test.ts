import { describe, expect, it } from "vitest";
import { experienceListStatus } from "../src/features/experiences/workspace-model.js";
import { publishStatusOf } from "../src/features/studio/stage/publish-status.js";

// ---------------------------------------------------------------------------
// "¿Publicada o solo guardada?" (relevo 37, E6/B3d): Mateo and Paola saved a
// design with no way to tell whether their customers already saw it.
// ---------------------------------------------------------------------------

describe("publishStatusOf", () => {
  it("shows nothing before anything has ever gone live", () => {
    expect(publishStatusOf({ publicationStatus: "draft" })).toEqual({
      live: false,
      badge: null,
    });
  });

  it("is Publicada once live and the draft matches", () => {
    expect(
      publishStatusOf({
        publicationStatus: "published",
        hasUnpublishedChanges: false,
      }),
    ).toEqual({ live: true, badge: { label: "Publicada", tone: "on" } });
  });

  it("is Cambios sin publicar once live and the draft moved on", () => {
    expect(
      publishStatusOf({
        publicationStatus: "published",
        hasUnpublishedChanges: true,
      }),
    ).toEqual({
      live: true,
      badge: { label: "Cambios sin publicar", tone: "warning" },
    });
  });

  it("catches a Touchpoint still live even if its own status lags", () => {
    // A group target: the aggregate status can read "draft" while another
    // Touchpoint in the group still shows a previous publication.
    expect(
      publishStatusOf({
        publicationStatus: "draft",
        liveTouchpointCount: 2,
        hasUnpublishedChanges: true,
      }),
    ).toEqual({
      live: true,
      badge: { label: "Cambios sin publicar", tone: "warning" },
    });
  });

  it("hides the badge while publishing or after a failure (their own notice says so)", () => {
    for (const publicationStatus of [
      "pending",
      "processing",
      "failed",
    ] as const) {
      expect(
        publishStatusOf({ publicationStatus, liveTouchpointCount: 1 }).badge,
      ).toBeNull();
    }
  });

  it("undefined hasUnpublishedChanges reads as Publicada, not Cambios", () => {
    expect(publishStatusOf({ publicationStatus: "published" }).badge).toEqual({
      label: "Publicada",
      tone: "on",
    });
  });
});

describe("one state for the list and the Estudio (domain audit A2-23)", () => {
  it("an archived page is never live and has no badge", () => {
    expect(
      publishStatusOf({
        publicationStatus: "published",
        liveTouchpointCount: 2,
        archivedAt: "2026-10-01T00:00:00Z",
      }),
    ).toEqual({ live: false, badge: null });
  });

  it("a page replaced everywhere but still live somewhere reads like the list", () => {
    // «superseded» with a live place: the list says Publicada, so does this.
    expect(
      publishStatusOf({
        publicationStatus: "superseded",
        liveTouchpointCount: 1,
      }).badge,
    ).toEqual({ label: "Publicada", tone: "on" });
  });

  it("gives the same answer as the list for every combination", () => {
    const statuses = [
      "draft",
      "pending",
      "processing",
      "published",
      "failed",
      "superseded",
    ] as const;
    for (const publicationStatus of statuses)
      for (const liveTouchpointCount of [0, 2])
        for (const hasUnpublishedChanges of [false, true])
          for (const archivedAt of [null, "2026-10-01T00:00:00Z"]) {
            const input = {
              publicationStatus,
              liveTouchpointCount,
              hasUnpublishedChanges,
              archivedAt,
            };
            const list = experienceListStatus(input);
            const studio = publishStatusOf(input);
            const label =
              list === "published"
                ? "Publicada"
                : list === "changes"
                  ? "Cambios sin publicar"
                  : null;
            expect(studio.badge?.label ?? null, JSON.stringify(input)).toBe(
              label,
            );
          }
  });
});

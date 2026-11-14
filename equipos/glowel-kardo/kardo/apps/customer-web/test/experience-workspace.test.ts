import { describe, expect, it } from "vitest";
import {
  draftSavePlan,
  experienceListStatus,
  experienceViewRoute,
  isOnline,
  listFilterCounts,
  livePlacesOf,
  matchesListFilter,
  matchesSearch,
  opensOwnStudio,
  pagePublishState,
  placesLabel,
  publicationProgressNote,
  publishDialogState,
  publishedMessage,
  reachLabel,
  staysInExperience,
  summarizeTargetStatuses,
  targetStatusKind,
  workspaceViewOf,
} from "../src/features/experiences/workspace-model.js";
import { parseRoute, routePath } from "../src/lib/router.js";

const id = "5b0b1f36-6f4d-4d5b-9d0a-1c6f3f1f0a01";
const other = "0d4a8c73-0a52-4a0e-8b7a-0c2f0e4b1a02";

describe("experience workspace routes", () => {
  it("gives Diseño the bare URL and the other views their own", () => {
    expect(routePath(experienceViewRoute(id, "diseno"))).toBe(
      `/experiences/${id}`,
    );
    expect(routePath(experienceViewRoute(id, "destinos"))).toBe(
      `/experiences/${id}/destinos`,
    );
    expect(routePath(experienceViewRoute(id, "historial"))).toBe(
      `/experiences/${id}/historial`,
    );
  });

  it("parses each view and rejects unknown ones", () => {
    expect(
      parseRoute({ pathname: `/experiences/${id}/destinos`, search: "" }),
    ).toEqual({ name: "experience", id, view: "destinos" });
    expect(
      parseRoute({ pathname: `/experiences/${id}/historial/`, search: "" }),
    ).toEqual({ name: "experience", id, view: "historial" });
    expect(
      parseRoute({ pathname: `/experiences/${id}/editor`, search: "" }),
    ).toEqual({ name: "not-found" });
    expect(workspaceViewOf(undefined)).toBe("diseno");
    expect(workspaceViewOf("historial")).toBe("historial");
  });

  it("lets the unsaved-changes guard through only inside the same Experience", () => {
    expect(
      staysInExperience({ name: "experience", id, view: "destinos" }, id),
    ).toBe(true);
    expect(staysInExperience({ name: "experience", id }, id)).toBe(true);
    expect(staysInExperience({ name: "experience", id: other }, id)).toBe(
      false,
    );
    expect(staysInExperience({ name: "experiences" }, id)).toBe(false);
    // A draft that was never saved has no id yet: every exit is guarded.
    expect(staysInExperience({ name: "experience", id }, null)).toBe(false);
  });
});

describe("experience list status", () => {
  const base = {
    archivedAt: null,
    hasUnpublishedChanges: false,
    liveTouchpointCount: 0,
  };

  it("maps every publication state to one list status", () => {
    expect(experienceListStatus({ ...base, publicationStatus: "draft" })).toBe(
      "draft",
    );
    expect(
      experienceListStatus({
        ...base,
        publicationStatus: "published",
        liveTouchpointCount: 2,
      }),
    ).toBe("published");
    expect(
      experienceListStatus({
        ...base,
        publicationStatus: "published",
        hasUnpublishedChanges: true,
        liveTouchpointCount: 1,
      }),
    ).toBe("changes");
    expect(
      experienceListStatus({ ...base, publicationStatus: "pending" }),
    ).toBe("publishing");
    expect(
      experienceListStatus({ ...base, publicationStatus: "processing" }),
    ).toBe("publishing");
    expect(experienceListStatus({ ...base, publicationStatus: "failed" })).toBe(
      "failed",
    );
    expect(
      experienceListStatus({
        ...base,
        publicationStatus: "published",
        archivedAt: "2026-09-20T10:00:00.000Z",
      }),
    ).toBe("archived");
  });

  it("treats a version replaced everywhere as not live", () => {
    expect(
      experienceListStatus({ ...base, publicationStatus: "superseded" }),
    ).toBe("draft");
    expect(
      experienceListStatus({
        ...base,
        publicationStatus: "superseded",
        liveTouchpointCount: 1,
      }),
    ).toBe("published");
  });

  it("filters by Publicadas, Borradores and Archivadas", () => {
    const draft = { ...base, publicationStatus: "draft" as const };
    const live = {
      ...base,
      publicationStatus: "published" as const,
      liveTouchpointCount: 3,
    };
    const failedLive = {
      ...base,
      publicationStatus: "failed" as const,
      liveTouchpointCount: 1,
    };
    const archived = {
      ...live,
      archivedAt: "2026-09-20T10:00:00.000Z",
    };
    expect(matchesListFilter(live, "published")).toBe(true);
    expect(matchesListFilter(failedLive, "published")).toBe(true);
    expect(matchesListFilter(draft, "published")).toBe(false);
    expect(matchesListFilter(draft, "drafts")).toBe(true);
    expect(matchesListFilter(live, "drafts")).toBe(false);
    expect(matchesListFilter(archived, "all")).toBe(false);
    expect(matchesListFilter(archived, "archived")).toBe(true);
    expect(isOnline(archived)).toBe(false);
    expect(listFilterCounts([draft, live, failedLive, archived])).toEqual({
      all: 3,
      published: 2,
      drafts: 1,
    });
  });

  it("searches names and type labels without caring about accents", () => {
    const menu = { name: "Carta de otoño", type: "menu" as const };
    expect(matchesSearch(menu, "menu")).toBe(true);
    expect(matchesSearch(menu, "OTONO")).toBe(true);
    expect(matchesSearch(menu, "  ")).toBe(true);
    expect(matchesSearch(menu, "catálogo")).toBe(false);
  });

  it("describes reach, with a gentle hint for drafts without targets", () => {
    expect(
      reachLabel({
        ...base,
        publicationStatus: "published",
        liveTouchpointCount: 1,
        touchpointId: null,
      }),
    ).toEqual({ label: "En vivo en 1 QR o etiqueta", tone: "live" });
    expect(
      reachLabel({
        ...base,
        publicationStatus: "draft",
        touchpointId: null,
        targets: { touchpointIds: [], groupIds: [other] },
      }).tone,
    ).toBe("assigned");
    expect(
      reachLabel({
        ...base,
        publicationStatus: "draft",
        touchpointId: null,
        targets: { touchpointIds: [], groupIds: [] },
      }),
    ).toEqual({ label: "Sin dónde se ve", tone: "none" });
  });
});

describe("per-Touchpoint status", () => {
  it("puts a direct assignment's override before everything else", () => {
    expect(
      targetStatusKind({ status: "published", isLive: true, overridden: true }),
    ).toBe("overridden");
    expect(targetStatusKind({ status: "published", isLive: true })).toBe(
      "live",
    );
    expect(targetStatusKind({ status: "pending", isLive: false })).toBe(
      "publishing",
    );
    expect(targetStatusKind({ status: "failed", isLive: false })).toBe(
      "failed",
    );
    expect(targetStatusKind({ status: "draft", isLive: false })).toBe(
      "waiting",
    );
    expect(
      summarizeTargetStatuses([
        { status: "published", isLive: true },
        { status: "draft", isLive: false },
        { status: "draft", isLive: false, overridden: true },
      ]),
    ).toEqual({
      live: 1,
      publishing: 0,
      failed: 0,
      overridden: 1,
      waiting: 1,
    });
  });
});

describe("publish dialog", () => {
  const ready = {
    isDirty: false,
    targetsChanged: false,
    errorCount: 0,
    hasTouchpoints: true,
    resolvedCount: 2,
    publishableCount: 2,
    isInFlight: false,
    isBusy: false,
  };

  it("publishes straight away when everything is saved", () => {
    expect(publishDialogState(ready)).toEqual({
      needsSave: false,
      confirmLabel: "Publicar ahora",
      canConfirm: true,
      blocker: null,
    });
  });

  it("saves first when there are pending changes", () => {
    for (const change of [{ isDirty: true }, { targetsChanged: true }]) {
      const state = publishDialogState({ ...ready, ...change });
      expect(state.needsSave).toBe(true);
      expect(state.confirmLabel).toBe("Guardar y publicar");
      expect(state.canConfirm).toBe(true);
    }
  });

  it("asks for destinations when none resolve", () => {
    const state = publishDialogState({
      ...ready,
      resolvedCount: 0,
      publishableCount: 0,
    });
    expect(state.blocker).toBe("no-targets");
    expect(state.canConfirm).toBe(false);
  });

  it("explains every other reason it cannot publish yet", () => {
    expect(publishDialogState({ ...ready, errorCount: 2 }).blocker).toBe(
      "invalid-content",
    );
    expect(
      publishDialogState({ ...ready, hasTouchpoints: false }).blocker,
    ).toBe("no-touchpoints");
    expect(publishDialogState({ ...ready, publishableCount: 0 }).blocker).toBe(
      "all-overridden",
    );
    expect(publishDialogState({ ...ready, isInFlight: true }).blocker).toBe(
      "in-flight",
    );
    expect(publishDialogState({ ...ready, isBusy: true }).canConfirm).toBe(
      false,
    );
  });

  it("confirms the publication and the Touchpoints skipped by precedence", () => {
    expect(publishedMessage({ versionRevision: 4, publications: [1, 2] })).toBe(
      "Publicando la versión 4 en 2 QR y etiquetas. Se activará en unos segundos.",
    );
    expect(
      publishedMessage({
        versionRevision: 1,
        publications: [1],
        skipped: [1],
      }),
    ).toContain("1 QR o etiqueta no cambió");
  });

  it("names what was kept because replacing it was not confirmed (round 4, B1)", () => {
    const message = publishedMessage({
      versionRevision: 1,
      publications: [1],
      skipped: [
        {
          touchpointName: "/productos",
          reason: "REPLACE_NOT_CONFIRMED",
          liveExperienceName: "Productos",
        },
      ],
    });
    expect(message).toContain("«/productos» siguió mostrando «Productos».");
    expect(message).not.toContain("no cambió");
  });
});

describe("publicationProgressNote", () => {
  const at = Date.parse("2026-10-02T01:25:00.000Z");
  const pending = (seconds: number, failureReason: string | null = null) => ({
    status: "pending" as const,
    createdAt: new Date(at - seconds * 1000).toISOString(),
    failureReason,
  });

  it("says nothing in the first seconds or once it is no longer publishing", () => {
    expect(publicationProgressNote(pending(5), at)).toBeNull();
    expect(
      publicationProgressNote({ ...pending(300), status: "published" }, at),
    ).toBeNull();
    expect(publicationProgressNote(null, at)).toBeNull();
  });

  it("tells the queue, then that it is taking longer than usual", () => {
    expect(publicationProgressNote(pending(30), at)).toMatch(/^En cola/);
    expect(publicationProgressNote(pending(120), at)).toMatch(
      /tardando más de lo normal/,
    );
  });

  it("shows the reason the Publisher recorded while it retries", () => {
    expect(
      publicationProgressNote(
        pending(40, "El servicio público no respondió; se reintentará."),
        at,
      ),
    ).toBe("El servicio público no respondió; se reintentará.");
  });
});

describe("pagePublishState: the one publication state (domain audit A2-23)", () => {
  const draft = { publicationStatus: "draft" as const };

  it("archived wins over everything and is never live", () => {
    expect(
      pagePublishState({
        publicationStatus: "failed",
        liveTouchpointCount: 3,
        archivedAt: "2026-10-01T00:00:00Z",
      }),
    ).toEqual({ status: "archived", live: false });
  });

  it("a failed attempt reads Falló, but an older version can still be live", () => {
    expect(
      pagePublishState({ publicationStatus: "failed", liveTouchpointCount: 1 }),
    ).toEqual({ status: "failed", live: true });
    expect(pagePublishState({ publicationStatus: "failed" })).toEqual({
      status: "failed",
      live: false,
    });
  });

  it("is a draft until something is live, Publicada once live, Con cambios when it moved on", () => {
    expect(pagePublishState(draft)).toEqual({ status: "draft", live: false });
    expect(
      pagePublishState({
        publicationStatus: "published",
        hasUnpublishedChanges: false,
      }),
    ).toEqual({ status: "published", live: true });
    expect(
      pagePublishState({
        publicationStatus: "superseded",
        liveTouchpointCount: 2,
        hasUnpublishedChanges: true,
      }),
    ).toEqual({ status: "changes", live: true });
  });

  it("experienceListStatus is the same answer", () => {
    expect(experienceListStatus({ publicationStatus: "processing" })).toBe(
      "publishing",
    );
  });
});

describe("opensOwnStudio: going to this page's Estudio is not leaving it (A2-33)", () => {
  it("only the Estudio of the same page", () => {
    expect(opensOwnStudio({ name: "experience-studio", id }, id)).toBe(true);
    expect(opensOwnStudio({ name: "experience-studio", id: other }, id)).toBe(
      false,
    );
    expect(opensOwnStudio({ name: "experiences" }, id)).toBe(false);
    expect(opensOwnStudio({ name: "experience-studio", id }, null)).toBe(false);
  });
});

describe("draftSavePlan: what a save sends (domain audit A2-22 and A2-25)", () => {
  const base = {
    contentChanged: false,
    nameInvalid: false,
    contentInvalid: false,
    editsContentHere: false,
    draftRevision: 4,
  };

  it("a rename sends the name alone, with the revision it loaded", () => {
    expect(draftSavePlan(base)).toEqual({
      blocked: false,
      sendsContent: false,
      revision: { expectedDraftRevision: 4 },
    });
  });

  it("sends the content only when it changed here", () => {
    expect(draftSavePlan({ ...base, contentChanged: true }).sendsContent).toBe(
      true,
    );
  });

  it("an invalid content never blocks renaming a page designed in the Estudio", () => {
    expect(draftSavePlan({ ...base, contentInvalid: true }).blocked).toBe(
      false,
    );
    expect(
      draftSavePlan({ ...base, contentInvalid: true, contentChanged: true })
        .blocked,
    ).toBe(false);
  });

  it("but it blocks content written from this screen (Redirección)", () => {
    expect(
      draftSavePlan({
        ...base,
        contentChanged: true,
        contentInvalid: true,
        editsContentHere: true,
      }).blocked,
    ).toBe(true);
  });

  it("an empty name always blocks", () => {
    expect(draftSavePlan({ ...base, nameInvalid: true }).blocked).toBe(true);
  });

  it("without a revision (older answer) sends none", () => {
    expect(
      draftSavePlan({ ...base, draftRevision: undefined }).revision,
    ).toEqual({});
  });
});

describe("naming where a page is by its kind (domain audit A2-27)", () => {
  it("says QR o etiqueta, links, or both", () => {
    expect(placesLabel({ objects: 1, links: 0 })).toBe("1 QR o etiqueta");
    expect(placesLabel({ objects: 3, links: 0 })).toBe("3 QR y etiquetas");
    expect(placesLabel({ objects: 0, links: 1 })).toBe("1 link");
    expect(placesLabel({ objects: 0, links: 2 })).toBe("2 links");
    expect(placesLabel({ objects: 2, links: 1 })).toBe(
      "2 QR y etiquetas, 1 link",
    );
  });

  it("reads the live places off the touchpoints", () => {
    const touchpoints = [
      { id: "a", kind: "qr", status: "active", live: { experienceId: id } },
      { id: "b", kind: "link", status: "active", live: { experienceId: id } },
      { id: "c", kind: "qr", status: "active", live: { experienceId: other } },
      { id: "d", kind: "nfc", status: "retired", live: { experienceId: id } },
    ];
    expect(livePlacesOf(id, 2, touchpoints)).toEqual({ objects: 1, links: 1 });
    // The page's own count wins when the list lags.
    expect(livePlacesOf(id, 3, touchpoints)).toEqual({ objects: 3, links: 0 });
  });

  it("reachLabel and publishedMessage name links", () => {
    const page = {
      publicationStatus: "published" as const,
      liveTouchpointCount: 2,
      touchpointId: null,
    };
    expect(reachLabel(page, { objects: 1, links: 1 }).label).toBe(
      "En vivo en 1 QR o etiqueta, 1 link",
    );
    expect(reachLabel(page).label).toBe("En vivo en 2 QR y etiquetas");
    const kinds: Record<string, string> = { a: "qr", b: "link" };
    expect(
      publishedMessage(
        {
          versionRevision: 3,
          publications: [{ touchpointId: "a" }, { touchpointId: "b" }],
        },
        (touchpointId) => kinds[touchpointId],
      ),
    ).toContain("en 1 QR o etiqueta, 1 link.");
  });
});

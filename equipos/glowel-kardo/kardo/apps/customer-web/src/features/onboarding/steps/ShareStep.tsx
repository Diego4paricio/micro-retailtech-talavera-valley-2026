import {
  type ExperienceContent,
  type ExperienceSummary,
  type Touchpoint,
  whatsappUrlFromPhone,
} from "@kardo/contracts";
import { useState } from "react";
import { experiencesApi } from "../../../api/experiences.js";
import { linksApi } from "../../../api/links.js";
import { qrDesignsApi } from "../../../api/qr-designs.js";
import { touchpointsApi } from "../../../api/touchpoints.js";
import { Icon } from "../../../components/Icon.js";
import { Notice } from "../../../components/Notice.js";
import { errorMessage } from "../../../lib/api.js";
import { touchpointUrls } from "../../../lib/touchpoint-urls.js";
import { useResource } from "../../../lib/use-resource.js";
import { useWorkspace } from "../../../workspace/WorkspaceContext.js";
import { showExperienceOn } from "../../experiences/assign.js";
import {
  describeSampleIssues,
  findSampleContent,
} from "../../experiences/sample-content.js";
import { LinkAddressField } from "../../links/LinkAddressField.js";
import { nfcMeaning } from "../../touchpoints/labels.js";
import {
  effectiveDesign,
  QrDownloadDialog,
  QrPicture,
} from "../../touchpoints/QrDownload.js";
import { ShareIcon } from "../first-steps-icons.js";
import type { FirstStepId } from "../first-steps-model.js";
import { rememberedPendingShare, shareTouchpointName } from "../share-model.js";
import type { FirstSteps } from "../use-first-steps.js";

/**
 * 4. Cómo te encuentran (owner, 2026-10-04): a QR, an NFC tag or a link, in
 * three tiles with the symbols people know. A QR or a tag is created with a
 * name Kardo suggests (it can be renamed in Touchpoints); a link asks only
 * for its address, kardo.com.mx/<negocio>/<link> (Links, relevo 34).
 */
export type ShareKind = "qr" | "nfc" | "link";

const kinds: { kind: ShareKind; title: string; button: string }[] = [
  { kind: "qr", title: "Código QR", button: "Crear mi QR y publicar" },
  {
    kind: "nfc",
    title: "Etiqueta NFC",
    button: "Crear mi etiqueta y publicar",
  },
  { kind: "link", title: "Link", button: "Crear mi link y publicar" },
];

/** The kind a Touchpoint is shown as in these steps. */
export function shareKindOf(touchpoint: Pick<Touchpoint, "kind">): ShareKind {
  if (touchpoint.kind === "nfc") return "nfc";
  if (touchpoint.kind === "other" || touchpoint.kind === "link") return "link";
  return "qr";
}

export function ShareStep({
  experience,
  steps,
  onGo,
  onPublished,
}: {
  experience: ExperienceSummary;
  steps: FirstSteps;
  onGo: (id: FirstStepId) => void;
  onPublished: () => void;
}) {
  const { workspace, touchpoints, upsertTouchpoint, refreshPublicationState } =
    useWorkspace();
  const profile = steps.profile.data;
  const [kind, setKind] = useState<ShareKind>("qr");
  const [slug, setSlug] = useState("");
  const [slugReady, setSlugReady] = useState(false);
  // Created, but publishing failed: publishing again reuses it. It is kept
  // in the steps' own memory, so a reload does not forget it and make
  // another one with the same name (A2-54).
  const [created, setCreated] = useState<Touchpoint | null>(null);
  const pending =
    created ??
    rememberedPendingShare(steps.pendingShare, experience.id, touchpoints.data);
  function setPending(touchpoint: Touchpoint) {
    setCreated(touchpoint);
    steps.rememberPendingShare({
      touchpointId: touchpoint.id,
      experienceId: experience.id,
    });
  }
  // Still looking for the remembered one: do not create another meanwhile.
  const lookingForPending =
    !pending &&
    steps.pendingShare?.experienceId === experience.id &&
    touchpoints.data === null;
  // A pending one decides the way, whatever was picked before the reload.
  const shownKind: ShareKind = pending ? shareKindOf(pending) : kind;
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A QR just published (relevo 37 S8: Chema, «tuve que buscar mucho» para
  // encontrar «Descargar»): held here, with its download in view, before
  // moving on to «Pruébalo».
  const [justPublishedQr, setJustPublishedQr] = useState<Touchpoint | null>(
    null,
  );
  const [downloadOpen, setDownloadOpen] = useState(false);
  const issues = findSampleContent(
    experience.type,
    experience.content as ExperienceContent,
    whatsappUrlFromPhone(profile?.phone, profile?.country),
  );
  const picked = kinds.find((item) => item.kind === shownKind);
  const needsAddress = shownKind === "link" && !workspace.slug;
  const qrDesignState = useResource(
    justPublishedQr ? `qr-design:${workspace.id}:${justPublishedQr.id}` : null,
    (signal) =>
      qrDesignsApi.get(workspace.id, justPublishedQr?.id ?? "", signal),
  );

  // Remembered before the page shows as live: otherwise, for a moment, it
  // reads as published elsewhere and Primeros pasos closes.
  function markDone(touchpoint: Touchpoint) {
    steps.markPublished(touchpoint.id);
    return refreshPublicationState();
  }
  async function done(touchpoint: Touchpoint) {
    await markDone(touchpoint);
    onPublished();
  }

  async function publish() {
    if (
      isBusy ||
      lookingForPending ||
      needsAddress ||
      (shownKind === "link" && !slugReady && !pending)
    )
      return;
    setIsBusy(true);
    setError(null);
    try {
      if (pending) {
        // A link already shows the page; a QR or a tag still needs it.
        if (pending.kind === "link")
          await experiencesApi.publish(workspace.id, experience.id);
        else await showExperienceOn(workspace.id, experience, pending.id);
        await done(pending);
        return;
      }
      if (shownKind === "link") {
        const result = await linksApi.createForExperience(workspace.id, {
          experienceId: experience.id,
          slug,
        });
        upsertTouchpoint(result.link);
        if (!result.published) {
          setPending(result.link);
          setError(errorMessage(result.publishError));
          return;
        }
        await done(result.link);
        return;
      }
      // The business's name and the names in use count, and a tag gets a
      // tag's name (A2-54).
      const touchpoint = await touchpointsApi.create(workspace.id, {
        operationalName: shareTouchpointName({
          kind: shownKind === "nfc" ? "nfc" : "qr",
          experienceType: experience.type,
          experienceName: experience.name,
          planType: steps.state.plan.type,
          industry: profile?.industry,
          businessName: workspace.name,
          existingNames: (touchpoints.data ?? []).map(
            (item) => item.operationalName,
          ),
        }),
        kind: shownKind === "nfc" ? "nfc" : "qr",
      });
      upsertTouchpoint(touchpoint);
      setPending(touchpoint);
      await showExperienceOn(workspace.id, experience, touchpoint.id);
      if (shownKind === "qr") {
        // «Descargar tu QR» first, in view; «Pruébalo» comes after.
        await markDone(touchpoint);
        setJustPublishedQr(touchpoint);
        return;
      }
      await done(touchpoint);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setIsBusy(false);
    }
  }

  if (justPublishedQr) {
    const urls = touchpointUrls(justPublishedQr.publicId);
    return (
      <div className="fs-form fs-card fs-narrow">
        <p className="fs-note fs-center">Tu página ya está publicada.</p>
        <QrPicture
          className="fs-qr-image"
          state={qrDesignState}
          touchpoint={justPublishedQr}
        />
        <button
          className="button button-secondary"
          disabled={!qrDesignState.data}
          onClick={() => setDownloadOpen(true)}
          type="button"
        >
          <Icon name="download" size={16} /> Descargar tu QR
        </button>
        {qrDesignState.data ? (
          <QrDownloadDialog
            design={effectiveDesign(qrDesignState.data)}
            onClose={() => setDownloadOpen(false)}
            onRecorded={(lastExport) =>
              qrDesignState.setData((current) =>
                current ? { ...current, lastExport } : current,
              )
            }
            open={downloadOpen}
            touchpoint={justPublishedQr}
            url={urls.qr}
          />
        ) : null}
        <button
          className="button button-primary fs-cta"
          onClick={() => onPublished()}
          type="button"
        >
          Continuar
        </button>
      </div>
    );
  }

  return (
    <div className="fs-form fs-narrow">
      {issues.length ? (
        <Notice
          action={
            <button
              className="link-button"
              onClick={() => onGo("content")}
              type="button"
            >
              Corregir
            </button>
          }
          title="Antes de publicar"
          tone="warning"
        >
          Tus clientes verían {describeSampleIssues(issues)}.
        </Notice>
      ) : null}
      <fieldset className="fs-ways">
        <legend className="visually-hidden">¿Cómo te encuentran?</legend>
        {kinds.map((item) => (
          <button
            aria-pressed={shownKind === item.kind}
            className="fs-way"
            disabled={pending !== null}
            key={item.kind}
            onClick={() => {
              setKind(item.kind);
              setError(null);
            }}
            type="button"
          >
            <ShareIcon kind={item.kind} />
            <strong>{item.title}</strong>
          </button>
        ))}
      </fieldset>
      {shownKind === "nfc" && !pending ? (
        // «Etiqueta NFC» was a word Rosa and Javier did not know (relevo 37,
        // round 3): said plainly, without promising anything else.
        <p className="fs-note fs-center">{nfcMeaning}</p>
      ) : null}
      {shownKind === "link" && !pending ? (
        needsAddress ? (
          steps.canManageBusiness ? (
            <p className="fs-note fs-center">
              Primero elige la dirección de tu negocio.{" "}
              <button
                className="link-button"
                onClick={() => onGo("business")}
                type="button"
              >
                Ir al paso 1
              </button>
            </p>
          ) : (
            <p className="fs-note fs-center">
              Pídele a quien administra la organización que elija la dirección
              de tu negocio.
            </p>
          )
        ) : (
          <div className="fs-card">
            <LinkAddressField
              businessSlug={workspace.slug}
              experience={{ name: experience.name, type: experience.type }}
              label="Tu link"
              onChange={setSlug}
              onReadyChange={setSlugReady}
              value={slug}
              workspaceId={workspace.id}
            />
          </div>
        )
      ) : null}
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <button
        aria-busy={isBusy || undefined}
        className="button button-primary fs-cta"
        disabled={
          isBusy ||
          lookingForPending ||
          needsAddress ||
          (shownKind === "link" && !slugReady && !pending)
        }
        onClick={() => void publish()}
        type="button"
      >
        {isBusy
          ? "Publicando…"
          : pending
            ? "Publicar otra vez"
            : (picked?.button ?? "Publicar")}
      </button>
    </div>
  );
}

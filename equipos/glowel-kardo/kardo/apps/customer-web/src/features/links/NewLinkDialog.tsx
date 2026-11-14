import type { ExperienceSummary, Touchpoint } from "@kardo/contracts";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import { linkPublicUrl, linksApi } from "../../api/links.js";
import { Dialog } from "../../components/Dialog.js";
import { Icon } from "../../components/Icon.js";
import { Notice } from "../../components/Notice.js";
import { useToast } from "../../components/Toast.js";
import { errorMessage } from "../../lib/api.js";
import { businessAddressLabel } from "../../lib/business-address.js";
import { copyText } from "../../lib/clipboard.js";
import { useRouter } from "../../lib/router.js";
import { useWorkspace } from "../../workspace/WorkspaceContext.js";
import {
  ExperienceTiles,
  linkableExperiences,
} from "../experiences/ExperienceTiles.js";
import { experiencePlaces } from "../experiences/targets.js";
import { whatsappHref } from "./LinkActions.js";
import { LinkAddressField } from "./LinkAddressField.js";

type Created = {
  link: Touchpoint;
  url: string;
  experience: ExperienceSummary;
  publishError: string | null;
  isMain: boolean;
};

/**
 * «Nuevo link» (Links redesign, relevo 34): what it shows, in tiles with
 * their real page, and the last part of its address, always in view at the
 * bottom. The business's address is chosen elsewhere (Links or
 * Configuración), never here.
 */
export function NewLinkDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const {
    workspace,
    experiences,
    touchpoints,
    upsertTouchpoint,
    refreshPublicationState,
    reloadWorkspaces,
  } = useWorkspace();
  const { navigate } = useRouter();
  const [experienceId, setExperienceId] = useState<string | null>(null);
  const [slug, setSlug] = useState("");
  const [slugReady, setSlugReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [created, setCreated] = useState<Created | null>(null);

  const choices = useMemo(
    () => linkableExperiences(experiences.data ?? []),
    [experiences.data],
  );
  // Where each page shows (a QR, a tag or a link), and which ones a link
  // already shows: the dialog starts on a page that has no link yet.
  const places = useMemo(
    () => experiencePlaces(touchpoints.data ?? []),
    [touchpoints.data],
  );
  const onLinks = useMemo(
    () =>
      experiencePlaces(
        (touchpoints.data ?? []).filter((item) => item.kind === "link"),
      ),
    [touchpoints.data],
  );
  const picked = choices.find((item) => item.id === experienceId) ?? null;

  // biome-ignore lint/correctness/useExhaustiveDependencies: reset only when the dialog opens
  useEffect(() => {
    if (!open) return;
    // The newest one that no link shows yet, else the newest.
    setExperienceId(
      (choices.find((item) => !onLinks.has(item.id)) ?? choices[0])?.id ?? null,
    );
    setSlug("");
    setSlugReady(false);
    setError(null);
    setCreated(null);
  }, [open]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!picked || !workspace.slug) return;
    setError(null);
    setIsCreating(true);
    try {
      const result = await linksApi.createForExperience(workspace.id, {
        experienceId: picked.id,
        slug,
      });
      upsertTouchpoint(result.link);
      setCreated({
        link: result.link,
        url: linkPublicUrl(result.link, workspace.slug),
        experience: picked,
        publishError: result.publishError
          ? errorMessage(result.publishError)
          : null,
        isMain: !workspace.mainLinkId,
      });
      await Promise.all([
        refreshPublicationState(),
        workspace.mainLinkId ? Promise.resolve() : reloadWorkspaces(),
      ]);
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setIsCreating(false);
    }
  }

  if (created)
    return (
      <LinkReadyDialog
        created={created}
        onClose={onClose}
        onOpenLink={() => {
          onClose();
          navigate({ name: "link", id: created.link.id });
        }}
        open={open}
      />
    );

  const createNew = () => {
    onClose();
    navigate({ name: "experience-new", touchpointId: null });
  };

  return (
    <Dialog
      footer={
        choices.length ? (
          <div className="new-link-foot">
            <LinkAddressField
              businessSlug={workspace.slug}
              experience={picked}
              label="Dirección"
              onChange={(next) => {
                setError(null);
                setSlug(next);
              }}
              onReadyChange={setSlugReady}
              value={slug}
              workspaceId={workspace.id}
            />
            <div className="new-link-foot-actions">
              <button
                className="button button-secondary"
                onClick={onClose}
                type="button"
              >
                Cancelar
              </button>
              <button
                aria-busy={isCreating || undefined}
                className="button button-primary"
                disabled={!picked || !slugReady || isCreating}
                form="new-link-form"
                type="submit"
              >
                {isCreating ? "Creando…" : "Crear link"}
              </button>
            </div>
          </div>
        ) : null
      }
      onClose={onClose}
      open={open}
      size="large"
      title="Nuevo link"
    >
      {choices.length ? (
        <form className="new-link-form" id="new-link-form" onSubmit={submit}>
          {error ? <Notice tone="danger">{error}</Notice> : null}
          <ExperienceTiles
            experiences={choices}
            onChange={setExperienceId}
            onCreateNew={createNew}
            places={places}
            value={experienceId}
          />
        </form>
      ) : (
        <div className="new-link-empty">
          <p className="address-note">Primero crea lo que vas a compartir.</p>
          <button
            className="button button-primary"
            onClick={createNew}
            type="button"
          >
            <Icon name="plus" size={16} /> Crear una página
          </button>
        </div>
      )}
    </Dialog>
  );
}

/** The link is created: share it right away. */
function LinkReadyDialog({
  open,
  created,
  onClose,
  onOpenLink,
}: {
  open: boolean;
  created: Created;
  onClose: () => void;
  onOpenLink: () => void;
}) {
  const { workspace } = useWorkspace();
  const { notify } = useToast();
  const [copied, setCopied] = useState(false);

  return (
    <Dialog
      footer={
        <>
          <button
            className="button button-secondary"
            onClick={onOpenLink}
            type="button"
          >
            Ver el link
          </button>
          <button
            className="button button-primary"
            onClick={onClose}
            type="button"
          >
            Listo
          </button>
        </>
      }
      onClose={onClose}
      open={open}
      title="Tu link está listo"
    >
      {created.publishError ? (
        <Notice tone="warning">
          «{created.experience.name}» no se pudo publicar:{" "}
          {created.publishError}
        </Notice>
      ) : null}
      <div className="link-ready">
        <div className="link-copybox">
          <span>{created.url.replace(/^https?:\/\//, "")}</span>
          <button
            className="button button-primary button-small"
            onClick={() =>
              void copyText(created.url).then((done) => {
                setCopied(done);
                if (done) notify("Link copiado.");
              })
            }
            type="button"
          >
            <Icon name={copied ? "check" : "copy"} size={16} />
            {copied ? "Copiado" : "Copiar"}
          </button>
        </div>
        <div className="link-ready-actions">
          <a
            className="button button-secondary"
            href={whatsappHref(created.url)}
            rel="noopener noreferrer"
            target="_blank"
          >
            <Icon name="send" size={18} /> WhatsApp
          </a>
          <a
            className="button button-secondary"
            href={created.url}
            rel="noopener noreferrer"
            target="_blank"
          >
            <Icon name="external" size={18} /> Abrir
          </a>
        </div>
        {created.isMain && workspace.slug ? (
          <p className="link-ready-main">
            <Icon name="star" size={14} /> También abre en{" "}
            {businessAddressLabel(workspace.slug)}.
          </p>
        ) : null}
      </div>
    </Dialog>
  );
}

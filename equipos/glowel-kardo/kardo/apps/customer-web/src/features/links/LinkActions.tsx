import type { Touchpoint } from "@kardo/contracts";
import { DropdownMenu } from "radix-ui";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import { linkPublicUrl, linksApi } from "../../api/links.js";
import { touchpointsApi } from "../../api/touchpoints.js";
import { Dialog } from "../../components/Dialog.js";
import { Icon } from "../../components/Icon.js";
import { Notice } from "../../components/Notice.js";
import { useToast } from "../../components/Toast.js";
import { errorMessage } from "../../lib/api.js";
import {
  businessAddressLabel,
  dayAndMonth,
  nextAddressChange,
} from "../../lib/business-address.js";
import { copyText } from "../../lib/clipboard.js";
import { useRouter } from "../../lib/router.js";
import { useWorkspace } from "../../workspace/WorkspaceContext.js";
import { useWorkspaceProfile } from "../business-profile/profile-store.js";
import { showExperienceOn } from "../experiences/assign.js";
import {
  ExperienceTiles,
  linkableExperiences,
} from "../experiences/ExperienceTiles.js";
import { experiencePlaces } from "../experiences/targets.js";
import { suggestTouchpointName } from "../touchpoints/naming.js";
import { LinkAddressField } from "./LinkAddressField.js";
import { experienceOnLink } from "./link-experience.js";

/** The dialogs a link opens from its «⋯» menu. */
export type LinkDialogKind = "show" | "address" | "retire";

/** «/menu»: how a link is named (owner, 2026-10-04). */
export function linkTitle(link: Touchpoint): string {
  return link.slug ? `/${link.slug}` : link.operationalName;
}

export function whatsappHref(url: string): string {
  return `https://wa.me/?text=${encodeURIComponent(url)}`;
}

/** One-click actions: copy, a QR to print, main, pause. */
export function useLinkQuickActions() {
  const {
    workspace,
    experiences,
    touchpoints,
    reloadWorkspaces,
    upsertTouchpoint,
    refreshPublicationState,
  } = useWorkspace();
  const { navigate } = useRouter();
  const { notify } = useToast();
  const profile = useWorkspaceProfile();
  return {
    copy: (link: Touchpoint) =>
      void copyText(linkPublicUrl(link, workspace.slug)).then((copied) => {
        if (copied) notify("Link copiado.");
      }),
    /**
     * A link is for sharing; a code to print is a QR of «QR y etiquetas»
     * (domain audit A9-1, owner's decision). This creates that QR showing
     * the same page and opens its page, where it downloads with the
     * business's design and its print is recorded. Its address never
     * changes, unlike the link's.
     */
    createPrintableQr: async (link: Touchpoint) => {
      const { experience } = experienceOnLink(link, experiences.data ?? []);
      if (!experience) {
        notify("Primero elige qué muestra este link.", "error");
        return;
      }
      try {
        const operationalName = suggestTouchpointName({
          kind: "qr",
          pageType: experience.type,
          industry: profile.data?.industry,
          businessName: workspace.name,
          existingNames: (touchpoints.data ?? []).map(
            (item) => item.operationalName,
          ),
          pageName: experience.name,
        });
        const qr = await touchpointsApi.create(workspace.id, {
          operationalName,
          kind: "qr",
        });
        upsertTouchpoint(qr);
        await showExperienceOn(workspace.id, experience, qr.id);
        void refreshPublicationState();
        notify(
          `Listo: el QR «${operationalName}» muestra «${experience.name}». Descárgalo aquí.`,
        );
        navigate({ name: "touchpoint", id: qr.id });
      } catch (requestError) {
        notify(errorMessage(requestError), "error");
      }
    },
    makeMain: async (link: Touchpoint) => {
      try {
        await linksApi.setMain(workspace.id, link.id);
        await reloadWorkspaces();
        notify(
          `Listo: ${businessAddressLabel(workspace.slug ?? "")} abre ${linkTitle(link)}.`,
        );
      } catch (requestError) {
        notify(errorMessage(requestError), "error");
      }
    },
    setPaused: async (link: Touchpoint, paused: boolean) => {
      try {
        upsertTouchpoint(
          await linksApi.setPaused(workspace.id, link.id, paused),
        );
        notify(
          paused
            ? `${linkTitle(link)} está en pausa.`
            : `${linkTitle(link)} vuelve a abrir.`,
        );
      } catch (requestError) {
        notify(errorMessage(requestError), "error");
      }
    },
  };
}

/**
 * The «⋯» of a link, in the list and in its page. In the list it also
 * copies, makes a QR to print and sends it by WhatsApp; its page shows
 * those.
 */
export function LinkMenu({
  link,
  inList = false,
  onDialog,
}: {
  link: Touchpoint;
  inList?: boolean | undefined;
  onDialog: (kind: LinkDialogKind) => void;
}) {
  const { workspace, can } = useWorkspace();
  const actions = useLinkQuickActions();
  const url = linkPublicUrl(link, workspace.slug);
  const canManage = can("touchpoints.manage");
  const canShow = can("experiences.publish") && can("experiences.edit");
  const isMain = workspace.mainLinkId === link.id;
  const canPause = canManage && link.status === "active";
  const canResume = canManage && link.status === "paused";
  const canPrint = canManage && can("experiences.publish");

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          aria-label={`Acciones de ${linkTitle(link)}`}
          className={inList ? "icon-button" : "icon-button link-more"}
          type="button"
        >
          <Icon name="more" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          className="kd-dropdown-content"
          sideOffset={6}
        >
          {inList ? (
            <>
              <DropdownMenu.Item
                className="kd-dropdown-item"
                onSelect={() => actions.copy(link)}
              >
                <Icon name="copy" size={16} /> Copiar
              </DropdownMenu.Item>
              {canPrint ? (
                <DropdownMenu.Item
                  className="kd-dropdown-item"
                  onSelect={() => void actions.createPrintableQr(link)}
                >
                  <Icon name="qr" size={16} /> Crear un QR para imprimir
                </DropdownMenu.Item>
              ) : null}
              <DropdownMenu.Item asChild className="kd-dropdown-item">
                <a
                  href={whatsappHref(url)}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  <Icon name="send" size={16} /> Mandar por WhatsApp
                </a>
              </DropdownMenu.Item>
              <DropdownMenu.Separator className="kd-dropdown-separator" />
            </>
          ) : null}
          {canShow ? (
            <DropdownMenu.Item
              className="kd-dropdown-item"
              onSelect={() => onDialog("show")}
            >
              <Icon name="experience" size={16} /> Cambiar qué muestra
            </DropdownMenu.Item>
          ) : null}
          {canManage ? (
            <DropdownMenu.Item
              className="kd-dropdown-item"
              onSelect={() => onDialog("address")}
            >
              <Icon name="edit" size={16} /> Cambiar dirección
            </DropdownMenu.Item>
          ) : null}
          {canManage && !isMain && link.slug && workspace.slug ? (
            <DropdownMenu.Item
              className="kd-dropdown-item"
              onSelect={() => void actions.makeMain(link)}
            >
              <Icon name="star" size={16} /> Hacer principal
            </DropdownMenu.Item>
          ) : null}
          {canPause || canResume ? (
            <DropdownMenu.Item
              className="kd-dropdown-item"
              onSelect={() => void actions.setPaused(link, canPause)}
            >
              <Icon name={canPause ? "pause" : "play"} size={16} />
              {canPause ? "Pausar" : "Reanudar"}
            </DropdownMenu.Item>
          ) : null}
          {can("touchpoints.retire") ? (
            <>
              <DropdownMenu.Separator className="kd-dropdown-separator" />
              <DropdownMenu.Item
                className="kd-dropdown-item kd-dropdown-item-danger"
                onSelect={() => onDialog("retire")}
              >
                <Icon name="trash" size={16} /> Retirar
              </DropdownMenu.Item>
            </>
          ) : null}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

/** The dialogs behind the «⋯» of one link. */
export function LinkDialogs({
  link,
  open,
  onClose,
  onRetired,
}: {
  link: Touchpoint | null;
  open: LinkDialogKind | null;
  onClose: () => void;
  onRetired?: (() => void) | undefined;
}) {
  if (!link) return null;
  return (
    <>
      <ChooseExperienceDialog
        link={link}
        onClose={onClose}
        open={open === "show"}
      />
      <LinkAddressDialog
        link={link}
        onClose={onClose}
        open={open === "address"}
      />
      <RetireLinkDialog
        link={link}
        onClose={onClose}
        onRetired={onRetired}
        open={open === "retire"}
      />
    </>
  );
}

/** «¿Qué muestra /menu?»: the same tiles as «Nuevo link»; the address
 * stays. */
function ChooseExperienceDialog({
  open,
  link,
  onClose,
}: {
  open: boolean;
  link: Touchpoint;
  onClose: () => void;
}) {
  const { workspace, experiences, touchpoints, refreshPublicationState } =
    useWorkspace();
  const { navigate } = useRouter();
  const { notify } = useToast();
  const all = experiences.data ?? [];
  const { experience: current, live: currentLive } = experienceOnLink(
    link,
    all,
  );
  const choices = useMemo(() => linkableExperiences(all), [all]);
  const places = useMemo(
    () => experiencePlaces(touchpoints.data ?? []),
    [touchpoints.data],
  );
  const [chosen, setChosen] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // biome-ignore lint/correctness/useExhaustiveDependencies: reset only when the dialog opens
  useEffect(() => {
    if (!open) return;
    setChosen(current?.id ?? choices[0]?.id ?? null);
    setError(null);
  }, [open]);

  const picked = choices.find((item) => item.id === chosen) ?? null;
  const unchanged = picked?.id === current?.id && currentLive;

  async function confirm() {
    if (!picked) return;
    setError(null);
    setIsSaving(true);
    try {
      await showExperienceOn(workspace.id, picked, link.id);
      await refreshPublicationState();
      notify(`${linkTitle(link)} muestra «${picked.name}».`);
      onClose();
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Dialog
      footer={
        <>
          <button
            className="button button-secondary"
            onClick={onClose}
            type="button"
          >
            Cancelar
          </button>
          <button
            aria-busy={isSaving || undefined}
            className="button button-primary"
            disabled={!picked || unchanged || isSaving}
            onClick={() => void confirm()}
            type="button"
          >
            {isSaving ? "Publicando…" : "Mostrar esta"}
          </button>
        </>
      }
      onClose={onClose}
      open={open}
      size="large"
      title={`¿Qué muestra ${linkTitle(link)}?`}
    >
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <ExperienceTiles
        current={currentLive ? current?.id : null}
        experiences={choices}
        label="Tus páginas"
        onChange={setChosen}
        onCreateNew={() => {
          onClose();
          navigate({ name: "experience-new", touchpointId: link.id });
        }}
        places={places}
        value={chosen}
      />
    </Dialog>
  );
}

/** Only the last part of kardo.com.mx/negocio/<esto>, once every 7 days;
 * the old one keeps leading here. */
function LinkAddressDialog({
  open,
  link,
  onClose,
}: {
  open: boolean;
  link: Touchpoint;
  onClose: () => void;
}) {
  const { workspace, experiences, upsertTouchpoint } = useWorkspace();
  const { notify } = useToast();
  const [slug, setSlug] = useState(link.slug ?? "");
  const [ready, setReady] = useState(Boolean(link.slug));
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const { experience } = experienceOnLink(link, experiences.data ?? []);
  const lockedUntil = link.slug ? nextAddressChange(link.slugChangedAt) : null;

  useEffect(() => {
    if (!open) return;
    setSlug(link.slug ?? "");
    setError(null);
  }, [open, link.slug]);

  const changed = slug !== (link.slug ?? "");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setError(null);
    try {
      const updated = await linksApi.setSlug(workspace.id, link.id, slug);
      upsertTouchpoint(updated);
      notify(
        `Listo: ${linkPublicUrl(updated, workspace.slug).replace(/^https?:\/\//, "")}`,
      );
      onClose();
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setIsSaving(false);
    }
  }

  if (lockedUntil)
    return (
      <Dialog
        footer={
          <button
            className="button button-primary"
            onClick={onClose}
            type="button"
          >
            Entendido
          </button>
        }
        onClose={onClose}
        open={open}
        title="Cambiar dirección"
      >
        <LinkAddressField
          businessSlug={workspace.slug}
          disabled
          experience={experience}
          label="Dirección"
          linkId={link.id}
          onChange={() => undefined}
          savedSlug={link.slug}
          value={link.slug ?? ""}
          workspaceId={workspace.id}
        />
        <p className="address-note">
          Podrás cambiarla el {dayAndMonth(lockedUntil)}.
        </p>
      </Dialog>
    );

  return (
    <Dialog
      footer={
        <>
          <button
            className="button button-secondary"
            onClick={onClose}
            type="button"
          >
            Cancelar
          </button>
          <button
            aria-busy={isSaving || undefined}
            className="button button-primary"
            disabled={isSaving || !changed || !ready}
            form="link-address-form"
            type="submit"
          >
            {isSaving ? "Guardando…" : "Guardar"}
          </button>
        </>
      }
      onClose={onClose}
      open={open}
      title={link.slug ? "Cambiar dirección" : "Dale una dirección"}
    >
      <form
        className="link-address-form"
        id="link-address-form"
        onSubmit={submit}
      >
        <LinkAddressField
          businessSlug={workspace.slug}
          error={error}
          experience={experience}
          hint={
            link.slug ? "La anterior seguirá abriendo este link." : undefined
          }
          label="Dirección"
          linkId={link.id}
          onChange={(next) => {
            setError(null);
            setSlug(next);
          }}
          onReadyChange={setReady}
          savedSlug={link.slug}
          value={slug}
          workspaceId={workspace.id}
        />
      </form>
    </Dialog>
  );
}

/** Retired for good: its address stops opening. Pausing is right there for
 * «only for a while». */
function RetireLinkDialog({
  open,
  link,
  onClose,
  onRetired,
}: {
  open: boolean;
  link: Touchpoint;
  onClose: () => void;
  onRetired?: (() => void) | undefined;
}) {
  const { workspace, upsertTouchpoint, reloadWorkspaces, can } = useWorkspace();
  const { notify } = useToast();
  const actions = useLinkQuickActions();
  const [error, setError] = useState<string | null>(null);
  const [isRetiring, setIsRetiring] = useState(false);
  const isMain = workspace.mainLinkId === link.id;
  const url = linkPublicUrl(link, workspace.slug).replace(/^https?:\/\//, "");

  useEffect(() => {
    if (open) setError(null);
  }, [open]);

  async function retire() {
    setIsRetiring(true);
    setError(null);
    try {
      upsertTouchpoint(await linksApi.retire(workspace.id, link.id));
      if (isMain) await reloadWorkspaces();
      notify(`${linkTitle(link)} se retiró.`);
      onClose();
      onRetired?.();
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setIsRetiring(false);
    }
  }

  return (
    <Dialog
      footer={
        <>
          {link.status === "active" && can("touchpoints.manage") ? (
            <button
              className="button button-ghost link-retire-pause"
              disabled={isRetiring}
              onClick={() => {
                onClose();
                void actions.setPaused(link, true);
              }}
              type="button"
            >
              <Icon name="pause" size={16} /> Mejor pausar
            </button>
          ) : null}
          <button
            className="button button-secondary"
            onClick={onClose}
            type="button"
          >
            Cancelar
          </button>
          <button
            aria-busy={isRetiring || undefined}
            className="button button-danger"
            disabled={isRetiring}
            onClick={() => void retire()}
            type="button"
          >
            {isRetiring ? "Retirando…" : "Retirar"}
          </button>
        </>
      }
      onClose={onClose}
      open={open}
      title={`¿Retirar ${linkTitle(link)}?`}
    >
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <p className="address-note link-retire-text">
        {url} dejará de abrir para siempre.
        {isMain && workspace.slug
          ? ` ${businessAddressLabel(workspace.slug)} tampoco abrirá nada hasta que elijas otro principal.`
          : ""}
      </p>
    </Dialog>
  );
}

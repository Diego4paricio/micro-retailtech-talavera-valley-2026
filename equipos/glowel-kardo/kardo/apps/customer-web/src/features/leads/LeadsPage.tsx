import type { Lead, LeadStatus } from "@kardo/contracts";
import { socialIcon } from "@kardo/page-render";
import { Tabs } from "radix-ui";
import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { leadsApi } from "../../api/leads.js";
import { ConfirmDialog } from "../../components/Dialog.js";
import { EmptyState } from "../../components/EmptyState.js";
import { Icon } from "../../components/Icon.js";
import { Notice } from "../../components/Notice.js";
import { PageHeader } from "../../components/PageHeader.js";
import { Skeleton } from "../../components/Skeleton.js";
import { StatusBadge } from "../../components/StatusBadge.js";
import { useToast } from "../../components/Toast.js";
import { errorMessage } from "../../lib/api.js";
import { downloadFile } from "../../lib/download.js";
import { formatDateTime, type StatusTone } from "../../lib/format.js";
import { useRouter } from "../../lib/router.js";
import { useResource } from "../../lib/use-resource.js";
import { useWorkspace } from "../../workspace/WorkspaceContext.js";
import { useWorkspaceProfile } from "../business-profile/profile-store.js";
import { leadStatusLabels } from "./labels.js";
import {
  confirmContactedQuestion,
  leadContactLinks,
  leadPhoneCountryUnknown,
  shouldAskIfAttended,
  unknownPhoneCountryNotice,
} from "./lead-contact.js";
import {
  leadFilterChipLabel,
  leadFilterOrder,
  leadsEmptyState,
} from "./lead-filters.js";
import "./leads.css";
import { leadRetentionApi } from "../../api/lead-retention.js";
import { LeadDeliverySection } from "./LeadDeliverySection.js";
import { LeadRetentionSection } from "./LeadRetentionSection.js";
import { leadRetentionNote } from "./lead-retention-note.js";

const messagePreviewLength = 120;
const leadStatusOptions: LeadStatus[] = ["new", "contacted", "closed"];
const maxHighlightPageAttempts = 5;
const highlightFadeMs = 3600;

const leadStatusTone: Record<LeadStatus, StatusTone> = {
  new: "info",
  contacted: "success",
  closed: "neutral",
};

function leadStatusView(status: LeadStatus | undefined): {
  label: string;
  tone: StatusTone;
} {
  const value = status ?? "new";
  return { label: leadStatusLabels[value], tone: leadStatusTone[value] };
}

/** Sets `status`, or drops the key entirely when there is none (never an
 * explicit `undefined`, which `exactOptionalPropertyTypes` forbids). */
function withStatus(item: Lead, status: LeadStatus | undefined): Lead {
  if (status === undefined) {
    const { status: _drop, ...rest } = item;
    return rest;
  }
  return { ...item, status };
}

/** The WhatsApp, phone or email glyph (C3a): a fixed, internal icon
 * constant, never built from a request or from a lead's own data, so
 * inlining its markup is safe. */
function ContactGlyph({
  network,
}: {
  network: "whatsapp" | "phone" | "email";
}) {
  return (
    <span
      aria-hidden="true"
      className="lead-contact-icon"
      // biome-ignore lint/security/noDangerouslySetInnerHtml: socialIcon() only ever returns one of a few fixed, internal SVG constants (@kardo/page-render), never anything from a lead or a request.
      dangerouslySetInnerHTML={{ __html: socialIcon(network) }}
    />
  );
}

/** WhatsApp, Llamar y Correo (C3a): solo el botón de un dato que la
 * solicitud sí trae, siempre en un renglón. En la tabla (`compact`),
 * «Llamar» se reduce a su ícono para que los tres quepan sin apilarse. */
function LeadContactButtons({
  lead,
  businessName,
  country,
  onFollow,
  compact = false,
}: {
  lead: Pick<Lead, "name" | "phone" | "email">;
  businessName: string;
  country: string;
  onFollow: () => void;
  compact?: boolean;
}) {
  const links = leadContactLinks(lead, businessName, country);
  const unknownCountry = leadPhoneCountryUnknown(lead.phone, country);
  return (
    <div
      className={
        compact
          ? "lead-contact-actions lead-contact-actions-compact"
          : "lead-contact-actions lead-contact-actions-grid"
      }
    >
      {unknownCountry ? (
        <span className="muted lead-phone-unknown">
          {unknownPhoneCountryNotice}
        </span>
      ) : null}
      {links.whatsapp ? (
        <a
          className="button lead-contact-button lead-contact-whatsapp button-small"
          href={links.whatsapp}
          onClick={onFollow}
          rel="noopener noreferrer"
          target="_blank"
        >
          <ContactGlyph network="whatsapp" />
          WhatsApp
        </a>
      ) : null}
      {links.tel ? (
        compact ? (
          <a
            aria-label="Llamar"
            className="icon-button lead-contact-button lead-contact-button-icon"
            href={links.tel}
            onClick={onFollow}
            title="Llamar"
          >
            <ContactGlyph network="phone" />
          </a>
        ) : (
          <a
            className="button button-secondary lead-contact-button button-small"
            href={links.tel}
            onClick={onFollow}
          >
            <ContactGlyph network="phone" />
            Llamar
          </a>
        )
      ) : null}
      <a
        className="button button-secondary lead-contact-button button-small"
        href={links.mailto}
        onClick={onFollow}
      >
        <ContactGlyph network="email" />
        Correo
      </a>
    </div>
  );
}

/** «¿Ya atendiste a {nombre}?» (C3b): justo bajo la solicitud que se
 * acaba de contestar, nunca arriba de toda la lista. */
function LeadConfirmBanner({
  lead,
  onConfirm,
  onDismiss,
}: {
  lead: Pick<Lead, "name">;
  onConfirm: () => void;
  onDismiss: () => void;
}) {
  return (
    <Notice
      action={
        <div className="lead-confirm-actions">
          <button
            className="button button-primary button-small"
            onClick={onConfirm}
            type="button"
          >
            Sí, ya la atendí
          </button>
          <button
            className="button button-secondary button-small"
            onClick={onDismiss}
            type="button"
          >
            Todavía no
          </button>
        </div>
      }
      tone="info"
    >
      {confirmContactedQuestion(lead.name)}
    </Notice>
  );
}

export function LeadsPage() {
  const { workspace, touchpoints, can } = useWorkspace();
  const { notify } = useToast();
  const { route, navigate } = useRouter();
  const profile = useWorkspaceProfile();
  const country = profile.data?.country ?? "MX";
  const canRead = can("leads.read");
  const canManageLeads = can("leads.manage");
  const [touchpointId, setTouchpointId] = useState<string>("all");
  // «Por atender» por omisión (C3d): lo que urge responder, no «Todas». Una
  // carga directa de «/leads?lead=<id>» (la campana) parte de «Todas»: no se
  // sabe de qué estado es la solicitud hasta encontrarla.
  const [statusFilter, setStatusFilter] = useState<"all" | LeadStatus>(() =>
    route.name === "leads" && route.leadId ? "all" : "new",
  );
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [pendingStatusId, setPendingStatusId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Lead | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  // Contestar una solicitud (C3b): qué solicitud pregunta «¿ya la
  // atendiste?» después de tocar uno de sus tres botones.
  const [confirmingLeadId, setConfirmingLeadId] = useState<string | null>(null);
  // Abrir desde la campana (C3c/P4, A2-73): el router trae la solicitud a
  // resaltar en la dirección («/leads?lead=<id>») y se lleva a la vista en
  // cuanto aparece en la lista.
  const highlightLeadId =
    route.name === "leads" ? (route.leadId ?? null) : null;
  const [tab, setTab] = useState<"leads" | "delivery">("leads");
  const highlightAttempts = useRef(0);
  const listRef = useRef<HTMLElement>(null);

  const leads = useResource(
    canRead ? `leads:${workspace.id}:${touchpointId}:${statusFilter}` : null,
    (signal) =>
      leadsApi.list(
        workspace.id,
        {
          ...(touchpointId === "all" ? {} : { touchpointId }),
          ...(statusFilter === "all" ? {} : { status: statusFilter }),
        },
        signal,
      ),
  );

  // El número de «Por atender» (C3d): aparte del filtro activo, para que se
  // vea sin tener que cambiarlo.
  const newCount = useResource(
    canRead ? `leads-new-count:${workspace.id}` : null,
    (signal) => leadsApi.list(workspace.id, { status: "new" }, signal),
  );
  const newCountLabel = newCount.data
    ? newCount.data.nextCursor
      ? "50+"
      : String(newCount.data.items.length)
    : null;

  const retention = useResource(
    canRead ? `lead-retention:${workspace.id}` : null,
    (signal) => leadRetentionApi.get(workspace.id, signal),
  );

  const loadMore = useCallback(async () => {
    if (!leads.data?.nextCursor) return;
    setIsLoadingMore(true);
    setLoadMoreError(null);
    try {
      const next = await leadsApi.list(workspace.id, {
        ...(touchpointId === "all" ? {} : { touchpointId }),
        ...(statusFilter === "all" ? {} : { status: statusFilter }),
        cursor: leads.data.nextCursor,
      });
      leads.setData((current) =>
        current
          ? {
              items: [...current.items, ...next.items],
              nextCursor: next.nextCursor,
            }
          : next,
      );
    } catch (requestError) {
      setLoadMoreError(errorMessage(requestError));
    } finally {
      setIsLoadingMore(false);
    }
  }, [leads.data, leads.setData, touchpointId, statusFilter, workspace.id]);

  // Una solicitud nueva a resaltar (la campana, aun con esta página
  // abierta): se busca entre todas.
  useEffect(() => {
    if (!highlightLeadId) return;
    highlightAttempts.current = 0;
    setStatusFilter("all");
    setTouchpointId("all");
    setTab("leads");
  }, [highlightLeadId]);

  // Encuentra la solicitud resaltada, la lleva a la vista y, si no está en
  // esta página, sigue cargando más (hasta un límite) antes de rendirse.
  useEffect(() => {
    if (!highlightLeadId || !leads.data) return;
    const found = leads.data.items.some((item) => item.id === highlightLeadId);
    if (found) {
      const node = listRef.current?.querySelector(
        `[data-lead-id="${highlightLeadId}"]`,
      );
      node?.scrollIntoView({ behavior: "smooth", block: "center" });
      const timeout = window.setTimeout(() => {
        navigate({ name: "leads" }, { replace: true });
      }, highlightFadeMs);
      return () => window.clearTimeout(timeout);
    }
    if (
      leads.data.nextCursor &&
      highlightAttempts.current < maxHighlightPageAttempts
    ) {
      highlightAttempts.current += 1;
      void loadMore();
    }
    return undefined;
  }, [highlightLeadId, leads.data, loadMore, navigate]);

  if (!canRead) {
    return (
      <div className="page">
        <PageHeader title="Solicitudes" />
        <EmptyState
          icon="lead"
          title="Solo Owner y Admin ven los datos personales"
        >
          Las solicitudes incluyen correo, teléfono y mensaje de cada persona:
          tu rol no incluye acceso a esa información.
        </EmptyState>
      </div>
    );
  }

  async function exportCsv() {
    setIsExporting(true);
    try {
      // The file holds what the list shows: the same QR/tag and status.
      const csv = await leadsApi.exportCsv(workspace.id, {
        ...(touchpointId === "all" ? {} : { touchpointId }),
        ...(statusFilter === "all" ? {} : { status: statusFilter }),
      });
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const stamp = new Date().toISOString().slice(0, 10);
      downloadFile(blob, `kardo-leads-${stamp}.csv`);
      notify("El CSV se descargó correctamente.");
    } catch (requestError) {
      notify(errorMessage(requestError), "error");
    } finally {
      setIsExporting(false);
    }
  }

  function toggleExpanded(id: string) {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function changeStatus(lead: Lead, status: LeadStatus) {
    const previous = lead.status;
    setPendingStatusId(lead.id);
    // Optimistic update, rolled back on error.
    leads.setData((current) =>
      current
        ? {
            ...current,
            items: current.items.map(
              (item): Lead =>
                item.id === lead.id ? { ...item, status } : item,
            ),
          }
        : current,
    );
    const wasNew = (previous ?? "new") === "new";
    if (wasNew && status !== "new") {
      newCount.setData((current) =>
        current
          ? {
              ...current,
              items: current.items.filter((item) => item.id !== lead.id),
            }
          : current,
      );
    }
    try {
      const updated = await leadsApi.updateStatus(workspace.id, lead.id, {
        status,
      });
      leads.setData((current) =>
        current
          ? {
              ...current,
              items: current.items.map((item) =>
                item.id === lead.id ? updated : item,
              ),
            }
          : current,
      );
    } catch (requestError) {
      leads.setData((current) =>
        current
          ? {
              ...current,
              items: current.items.map((item) =>
                item.id === lead.id ? withStatus(item, previous) : item,
              ),
            }
          : current,
      );
      if (wasNew && status !== "new") {
        newCount.setData((current) =>
          current && !current.items.some((item) => item.id === lead.id)
            ? { ...current, items: [lead, ...current.items] }
            : current,
        );
      }
      notify(errorMessage(requestError), "error");
    } finally {
      setPendingStatusId(null);
    }
  }

  // Only a request still «Por atender» asks «¿ya la atendiste?»: one that is
  // already attended or closed must not be moved back (A2-53).
  function followUp(lead: Lead) {
    if (shouldAskIfAttended(lead.status)) setConfirmingLeadId(lead.id);
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await leadsApi.remove(workspace.id, deleteTarget.id);
      leads.setData((current) =>
        current
          ? {
              ...current,
              items: current.items.filter(
                (item) => item.id !== deleteTarget.id,
              ),
            }
          : current,
      );
      notify("Solicitud eliminada, junto con sus datos personales.");
      setDeleteTarget(null);
    } catch (requestError) {
      notify(errorMessage(requestError), "error");
    } finally {
      setIsDeleting(false);
    }
  }

  const items = leads.data?.items ?? [];
  const touchpointItems = touchpoints.data ?? [];
  const actionsColumn = canManageLeads ? 1 : 0;
  const tableColumnCount = 6 + actionsColumn;

  function statusCell(lead: Lead) {
    const view = leadStatusView(lead.status);
    if (!canManageLeads)
      return <StatusBadge tone={view.tone}>{view.label}</StatusBadge>;
    return (
      <select
        aria-label={`Estado de la solicitud de ${lead.name?.trim() || "esta persona"}`}
        disabled={pendingStatusId === lead.id}
        onChange={(event) =>
          void changeStatus(lead, event.target.value as LeadStatus)
        }
        value={lead.status ?? "new"}
      >
        {leadStatusOptions.map((option) => (
          <option key={option} value={option}>
            {leadStatusLabels[option]}
          </option>
        ))}
      </select>
    );
  }

  const retentionText = retention.data
    ? leadRetentionNote(retention.data.days)
    : null;
  const empty = leadsEmptyState(statusFilter, touchpointId !== "all");

  const leadsContent = (
    <>
      <Notice tone="info">
        Estos datos se recolectaron con consentimiento explícito. Úsalos solo
        para responder a la persona que los compartió.
      </Notice>
      {retentionText ? (
        <p className="muted lead-retention-note">
          {retentionText}
          {canManageLeads ? (
            <>
              {" "}
              <button
                className="link-button"
                onClick={() => setTab("delivery")}
                type="button"
              >
                Cambiar en Entrega
              </button>
            </>
          ) : null}
        </p>
      ) : null}

      <div className="toolbar">
        <label>
          <span className="visually-hidden">Filtrar por QR o etiqueta</span>
          <select
            onChange={(event) => setTouchpointId(event.target.value)}
            value={touchpointId}
          >
            <option value="all">Todos los QR y etiquetas</option>
            {touchpointItems.map((touchpoint) => (
              <option key={touchpoint.id} value={touchpoint.id}>
                {touchpoint.operationalName}
              </option>
            ))}
          </select>
        </label>
        <fieldset className="segmented">
          <legend className="visually-hidden">Filtrar por estado</legend>
          {leadFilterOrder.map((value) => (
            <button
              aria-pressed={statusFilter === value}
              className={
                statusFilter === value ? "segment segment-current" : "segment"
              }
              key={value}
              onClick={() => setStatusFilter(value)}
              type="button"
            >
              {leadFilterChipLabel(
                value,
                value === "new" ? newCountLabel : null,
              )}
            </button>
          ))}
        </fieldset>
      </div>

      {leads.error ? (
        <Notice
          action={
            <button
              className="text-action"
              onClick={() => void leads.reload()}
              type="button"
            >
              Reintentar
            </button>
          }
          tone="danger"
        >
          {leads.error}
        </Notice>
      ) : null}

      {leads.isLoading && !leads.data ? (
        <Skeleton lines={4} />
      ) : items.length ? (
        <section
          aria-label="Solicitudes recibidas"
          className="panel leads-list-panel"
          ref={listRef}
        >
          <div className="table-wrap leads-table">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Fecha</th>
                  <th scope="col">Quién</th>
                  <th scope="col">Mensaje</th>
                  <th scope="col">QR o etiqueta</th>
                  <th scope="col">Contestar</th>
                  <th scope="col">Estado</th>
                  {canManageLeads ? (
                    <th scope="col">
                      <span className="visually-hidden">Acciones</span>
                    </th>
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {items.map((lead) => {
                  const isLong =
                    (lead.message?.length ?? 0) > messagePreviewLength;
                  const isExpanded = expandedIds.has(lead.id);
                  return (
                    <Fragment key={lead.id}>
                      <tr
                        className={
                          lead.id === highlightLeadId
                            ? "lead-row-highlight"
                            : ""
                        }
                        data-lead-id={lead.id}
                      >
                        <td>{formatDateTime(lead.createdAt)}</td>
                        <td>
                          <strong>{lead.name ?? "Sin nombre"}</strong>
                          <br />
                          <a
                            className="muted"
                            href={`mailto:${encodeURIComponent(lead.email)}`}
                          >
                            {lead.email}
                          </a>
                          {lead.phone ? (
                            <>
                              <br />
                              <span className="muted">{lead.phone}</span>
                            </>
                          ) : null}
                        </td>
                        <td className="leads-message-cell">
                          {lead.message ? (
                            <>
                              {isExpanded || !isLong
                                ? lead.message
                                : `${lead.message.slice(0, messagePreviewLength)}…`}
                              {isLong ? (
                                <button
                                  className="link-button"
                                  onClick={() => toggleExpanded(lead.id)}
                                  type="button"
                                >
                                  {isExpanded ? "Ver menos" : "Ver más"}
                                </button>
                              ) : null}
                            </>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td>
                          {lead.touchpointName ?? "QR o etiqueta eliminado"}
                        </td>
                        <td>
                          <LeadContactButtons
                            businessName={workspace.name}
                            compact
                            country={country}
                            lead={lead}
                            onFollow={() => followUp(lead)}
                          />
                        </td>
                        <td>{statusCell(lead)}</td>
                        {canManageLeads ? (
                          <td>
                            <button
                              aria-label={`Eliminar solicitud de ${lead.name ?? lead.email}`}
                              className="icon-button icon-button-danger"
                              onClick={() => setDeleteTarget(lead)}
                              type="button"
                            >
                              <Icon name="trash" size={16} />
                            </button>
                          </td>
                        ) : null}
                      </tr>
                      {confirmingLeadId === lead.id ? (
                        <tr className="lead-confirm-row">
                          <td colSpan={tableColumnCount}>
                            <LeadConfirmBanner
                              lead={lead}
                              onConfirm={() => {
                                void changeStatus(lead, "contacted");
                                setConfirmingLeadId(null);
                              }}
                              onDismiss={() => setConfirmingLeadId(null)}
                            />
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          <ul className="lead-cards">
            {items.map((lead) => {
              const isLong = (lead.message?.length ?? 0) > messagePreviewLength;
              const isExpanded = expandedIds.has(lead.id);
              const view = leadStatusView(lead.status);
              return (
                <Fragment key={lead.id}>
                  <li
                    className={
                      lead.id === highlightLeadId
                        ? "lead-card lead-card-highlight"
                        : "lead-card"
                    }
                    data-lead-id={lead.id}
                  >
                    <div className="lead-card-header">
                      <strong>{lead.name ?? "Sin nombre"}</strong>
                      <StatusBadge tone={view.tone}>{view.label}</StatusBadge>
                    </div>
                    <p className="muted">
                      {formatDateTime(lead.createdAt)}
                      {lead.touchpointName ? ` · ${lead.touchpointName}` : ""}
                    </p>
                    <p>
                      <a href={`mailto:${encodeURIComponent(lead.email)}`}>
                        {lead.email}
                      </a>
                    </p>
                    {lead.phone ? <p>{lead.phone}</p> : null}
                    {lead.message ? (
                      <p>
                        {isExpanded || !isLong
                          ? lead.message
                          : `${lead.message.slice(0, messagePreviewLength)}…`}
                        {isLong ? (
                          <button
                            className="link-button"
                            onClick={() => toggleExpanded(lead.id)}
                            type="button"
                          >
                            {isExpanded ? "Ver menos" : "Ver más"}
                          </button>
                        ) : null}
                      </p>
                    ) : null}
                    <LeadContactButtons
                      businessName={workspace.name}
                      country={country}
                      lead={lead}
                      onFollow={() => followUp(lead)}
                    />
                    <div className="lead-card-footer">
                      {canManageLeads ? statusCell(lead) : null}
                      {canManageLeads ? (
                        <button
                          aria-label={`Eliminar solicitud de ${lead.name ?? lead.email}`}
                          className="icon-button icon-button-danger"
                          onClick={() => setDeleteTarget(lead)}
                          type="button"
                        >
                          <Icon name="trash" size={16} />
                        </button>
                      ) : null}
                    </div>
                  </li>
                  {confirmingLeadId === lead.id ? (
                    <li className="lead-confirm-row">
                      <LeadConfirmBanner
                        lead={lead}
                        onConfirm={() => {
                          void changeStatus(lead, "contacted");
                          setConfirmingLeadId(null);
                        }}
                        onDismiss={() => setConfirmingLeadId(null)}
                      />
                    </li>
                  ) : null}
                </Fragment>
              );
            })}
          </ul>

          {loadMoreError ? (
            <Notice tone="danger">{loadMoreError}</Notice>
          ) : null}
          {leads.data?.nextCursor ? (
            <div className="form-actions">
              <button
                className="button button-secondary"
                disabled={isLoadingMore}
                onClick={() => void loadMore()}
                type="button"
              >
                {isLoadingMore ? "Cargando…" : "Cargar más"}
              </button>
            </div>
          ) : null}
        </section>
      ) : !leads.error ? (
        <EmptyState icon="lead" title={empty.title}>
          {empty.body}
        </EmptyState>
      ) : null}
    </>
  );

  return (
    <div className="page">
      <PageHeader
        actions={
          items.length ? (
            <button
              className="button button-secondary"
              disabled={isExporting}
              onClick={() => void exportCsv()}
              type="button"
            >
              <Icon name="download" />{" "}
              {isExporting ? "Exportando…" : "Exportar CSV"}
            </button>
          ) : null
        }
        description="Lo que te dejan en tus formularios."
        title="Solicitudes"
      />

      {canManageLeads ? (
        <Tabs.Root
          className="kd-tabs"
          onValueChange={(value) =>
            setTab(value === "delivery" ? "delivery" : "leads")
          }
          value={tab}
        >
          <Tabs.List
            aria-label="Secciones de solicitudes"
            className="kd-tabs-list"
          >
            <Tabs.Trigger className="kd-tabs-trigger" value="leads">
              Solicitudes
            </Tabs.Trigger>
            <Tabs.Trigger className="kd-tabs-trigger" value="delivery">
              Entrega
            </Tabs.Trigger>
          </Tabs.List>
          <Tabs.Content className="kd-tabs-content" value="leads">
            {leadsContent}
          </Tabs.Content>
          <Tabs.Content className="kd-tabs-content" value="delivery">
            <LeadDeliverySection />
            <LeadRetentionSection />
          </Tabs.Content>
        </Tabs.Root>
      ) : (
        leadsContent
      )}

      <ConfirmDialog
        confirmLabel="Eliminar"
        description={`¿Eliminar la solicitud de ${deleteTarget?.name ?? deleteTarget?.email ?? "esta persona"}? Se borran sus datos personales de forma definitiva.`}
        isBusy={isDeleting}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => void confirmDelete()}
        open={Boolean(deleteTarget)}
        title="Eliminar solicitud"
        tone="danger"
      />
    </div>
  );
}

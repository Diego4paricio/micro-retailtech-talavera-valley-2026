import type {
  StaffServiceStatus,
  StaffStatusIncident,
  StaffStatusIncidentList,
  StatusIncidentKind,
} from "@kardo/contracts";
import { useCallback, useEffect, useState } from "react";
import { statusApi } from "../../api/status.js";
import { Notice } from "../../components/Notice.js";
import { PageHeader, SectionHeading } from "../../components/PageHeader.js";
import { Skeleton } from "../../components/Skeleton.js";
import { useToast } from "../../components/Toast.js";
import { ApiRequestError, errorMessage, isAbortError } from "../../lib/api.js";
import { staffPermissions } from "../../lib/permissions.js";
import { useStaff } from "../../shell/StaffContext.js";
import { IncidentCard } from "./IncidentCard.js";
import { AddUpdateDialog, CreateIncidentDialog } from "./IncidentDialogs.js";
import { ProbesTable } from "./ProbesTable.js";
import { ProvidersPanel } from "./ProvidersPanel.js";
import { StatusAreas } from "./StatusAreas.js";

const refreshIntervalMs = 30_000;

type DetailState =
  | { kind: "loading" }
  | { kind: "ready"; detail: StaffServiceStatus }
  | { kind: "unavailable" }
  | { kind: "error"; message: string };

export function StatusPage() {
  const { can } = useStaff();
  const { notify } = useToast();
  const canWrite = can(staffPermissions.statusWrite);

  const [detail, setDetail] = useState<DetailState>({ kind: "loading" });
  const [incidents, setIncidents] = useState<StaffStatusIncidentList | null>(
    null,
  );
  const [incidentsError, setIncidentsError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [isChecking, setIsChecking] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [creating, setCreating] = useState<StatusIncidentKind | null>(null);
  const [updating, setUpdating] = useState<StaffStatusIncident | null>(null);

  const loadDetail = useCallback((signal?: AbortSignal) => {
    return statusApi
      .current(signal)
      .then((value) => {
        setDetail({ kind: "ready", detail: value });
        setNow(Date.now());
      })
      .catch((requestError: unknown) => {
        if (isAbortError(requestError)) return;
        if (
          requestError instanceof ApiRequestError &&
          requestError.status === 503
        )
          setDetail({ kind: "unavailable" });
        else setDetail({ kind: "error", message: errorMessage(requestError) });
      });
  }, []);

  const loadIncidents = useCallback((signal?: AbortSignal) => {
    return statusApi
      .incidents(signal)
      .then((value) => {
        setIncidents(value);
        setIncidentsError(null);
      })
      .catch((requestError: unknown) => {
        if (!isAbortError(requestError))
          setIncidentsError(errorMessage(requestError));
      });
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void loadDetail(controller.signal);
    void loadIncidents(controller.signal);
    return () => controller.abort();
  }, [loadDetail, loadIncidents]);

  // Refresh every 30 s while the tab is visible.
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      void loadDetail();
      void loadIncidents();
    }, refreshIntervalMs);
    return () => window.clearInterval(timer);
  }, [loadDetail, loadIncidents]);

  async function checkNow() {
    setIsChecking(true);
    try {
      setDetail({ kind: "ready", detail: await statusApi.check() });
      setNow(Date.now());
      notify("Pruebas ejecutadas");
    } catch (requestError) {
      notify(errorMessage(requestError), "error");
    } finally {
      setIsChecking(false);
    }
  }

  async function sync() {
    setIsSyncing(true);
    try {
      const result = await statusApi.sync();
      notify(
        result.incidents === 1
          ? "Se reenvió 1 aviso al Worker"
          : `Se reenviaron ${result.incidents} avisos al Worker`,
      );
    } catch (requestError) {
      notify(errorMessage(requestError), "error");
    } finally {
      setIsSyncing(false);
    }
  }

  function afterWrite(message: string) {
    notify(message);
    void loadIncidents();
    void loadDetail();
  }

  return (
    <div className="page">
      <PageHeader
        actions={
          canWrite ? (
            <>
              <button
                className="button button-secondary"
                disabled={isChecking}
                onClick={() => void checkNow()}
                type="button"
              >
                {isChecking ? "Probando…" : "Probar ahora"}
              </button>
              <button
                className="button button-secondary"
                onClick={() => setCreating("maintenance")}
                type="button"
              >
                Programar mantenimiento
              </button>
              <button
                className="button button-primary"
                onClick={() => setCreating("incident")}
                type="button"
              >
                Reportar incidente
              </button>
            </>
          ) : undefined
        }
        description="Los clientes ven solo las áreas y los mensajes, nunca el detalle técnico. Se actualiza cada 30 segundos mientras esta pestaña está visible."
        eyebrow="Kardo Operations"
        title="Estado del servicio"
      />

      {detail.kind === "loading" ? <Skeleton lines={6} /> : null}
      {detail.kind === "error" ? (
        <Notice tone="error">{detail.message}</Notice>
      ) : null}
      {detail.kind === "unavailable" ? (
        <Notice tone="warning" title="El Worker de estado no responde">
          El Worker de estado no está configurado o no contesta. Revisa
          STATUS_URL y STATUS_COMMAND_KEY en la Staff API. Mientras tanto puedes
          ver y publicar incidentes abajo.
        </Notice>
      ) : null}
      {detail.kind === "ready" ? (
        <>
          <StatusAreas now={now} status={detail.detail.status} />
          <section aria-labelledby="st-probes">
            <SectionHeading
              description="Detalle técnico, solo para el equipo."
              id="st-probes"
              title="Pruebas"
            />
            <ProbesTable probes={detail.detail.probes} />
          </section>
          <section aria-labelledby="st-providers">
            <SectionHeading
              description="Lo que reportan las páginas de estado de nuestros proveedores."
              id="st-providers"
              title="Proveedores"
            />
            <ProvidersPanel providers={detail.detail.providers} />
          </section>
        </>
      ) : null}

      <section aria-labelledby="st-open" className="st-section">
        <SectionHeading
          actions={
            canWrite ? (
              <div className="st-sync">
                <button
                  className="button button-secondary button-small"
                  disabled={isSyncing}
                  onClick={() => void sync()}
                  type="button"
                >
                  {isSyncing ? "Reenviando…" : "Reenviar al Worker"}
                </button>
                <small>
                  Solo si el Worker se volvió a desplegar y no muestra los
                  avisos.
                </small>
              </div>
            ) : undefined
          }
          id="st-open"
          title="Abiertos"
        />
        {incidentsError ? (
          <Notice tone="error">{incidentsError}</Notice>
        ) : !incidents ? (
          <Skeleton lines={3} />
        ) : incidents.open.length === 0 ? (
          <p className="st-empty">
            No hay incidentes ni mantenimientos abiertos.
          </p>
        ) : (
          <div className="st-incident-list">
            {incidents.open.map((incident) => (
              <IncidentCard
                incident={incident}
                key={incident.id}
                onAddUpdate={canWrite ? () => setUpdating(incident) : undefined}
              />
            ))}
          </div>
        )}
      </section>

      <section aria-labelledby="st-recent" className="st-section">
        <SectionHeading id="st-recent" title="Últimos 30 días" />
        {!incidents ? null : incidents.recent.length === 0 ? (
          <p className="st-empty">
            Sin incidentes cerrados en los últimos 30 días.
          </p>
        ) : (
          <div className="st-incident-list">
            {incidents.recent.map((incident) => (
              <IncidentCard incident={incident} key={incident.id} />
            ))}
          </div>
        )}
      </section>

      <CreateIncidentDialog
        kind={creating ?? "incident"}
        onClose={() => setCreating(null)}
        onCreated={(incident) =>
          afterWrite(
            incident.kind === "maintenance"
              ? "Mantenimiento programado"
              : "Incidente publicado",
          )
        }
        open={creating !== null}
      />
      <AddUpdateDialog
        incident={updating}
        onClose={() => setUpdating(null)}
        onUpdated={() => afterWrite("Actualización publicada")}
      />
    </div>
  );
}

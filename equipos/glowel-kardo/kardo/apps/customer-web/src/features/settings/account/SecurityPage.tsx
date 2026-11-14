import type { Factor } from "@supabase/supabase-js";
import { useCallback, useEffect, useState } from "react";
import { accountApi } from "../../../api/account.js";
import { ConfirmDialog } from "../../../components/Dialog.js";
import { Notice } from "../../../components/Notice.js";
import {
  SettingsGroup,
  SettingsIntro,
  SettingsRow,
  StatusText,
} from "../../../components/SettingsBlocks.js";
import { Skeleton } from "../../../components/Skeleton.js";
import { useToast } from "../../../components/Toast.js";
import { errorMessage } from "../../../lib/api.js";
import { isDemoMode } from "../../../lib/demo.js";
import { formatDateTime, formatRelative } from "../../../lib/format.js";
import { useResource } from "../../../lib/use-resource.js";
import { supabase } from "../../../supabase.js";
import { useWorkspace } from "../../../workspace/WorkspaceContext.js";
import { ChangePasswordDialog } from "./ChangePasswordDialog.js";
import { describeDevice } from "./device.js";
import { ChangeButton } from "./ProfilePage.js";
import { leadsAnyOrganization } from "./security-model.js";
import { TwoFactorDialog } from "./TwoFactorDialog.js";

const HISTORY_PREVIEW = 8;

/** Tu cuenta → Seguridad (ADR 023). */
export function SecurityPage() {
  const { workspace, workspaces, session } = useWorkspace();
  const [dialog, setDialog] = useState<"password" | "two-factor" | null>(null);
  const [factors, setFactors] = useState<Factor[] | null>(
    isDemoMode ? [] : null,
  );

  const loadFactors = useCallback(async () => {
    if (!supabase || isDemoMode) return;
    const { data } = await supabase.auth.mfa.listFactors();
    setFactors(data?.totp ?? []);
  }, []);

  useEffect(() => {
    void loadFactors();
  }, [loadFactors]);

  const leads = leadsAnyOrganization([workspace, ...workspaces]);
  const twoFactorOn = (factors?.length ?? 0) > 0;

  return (
    <>
      <SettingsIntro
        description="Cómo entras a Kardo y desde dónde tienes sesión abierta."
        title="Seguridad"
      />

      <SettingsGroup id="security-sign-in" title="Inicio de sesión">
        <SettingsRow
          action={
            <ChangeButton
              label="Cambiar contraseña"
              onClick={() => setDialog("password")}
            />
          }
          description="Para cambiarla te pedimos la actual."
          label="Contraseña"
          value={
            <>
              <span className="visually-hidden">Contraseña guardada</span>
              <span aria-hidden="true">••••••••••</span>
            </>
          }
        />
        <SettingsRow
          action={
            factors === null ? null : (
              <ChangeButton
                label={
                  twoFactorOn
                    ? "Administrar la verificación en dos pasos"
                    : "Activar la verificación en dos pasos"
                }
                onClick={() => setDialog("two-factor")}
                text={twoFactorOn ? "Administrar" : "Activar"}
              />
            )
          }
          description={
            twoFactorOn
              ? "Cada inicio de sesión pide el código de tu app."
              : leads
                ? "Recomendada para Owners y Admins: protege a toda tu organización."
                : "Además de tu contraseña, pide un código de tu app de autenticación."
          }
          label="Verificación en dos pasos"
          value={
            factors === null ? null : twoFactorOn ? (
              <StatusText tone="on">
                Activada
                {factors.length > 1 ? ` · ${factors.length} apps` : " · 1 app"}
              </StatusText>
            ) : (
              <StatusText tone={leads ? "warning" : "off"}>
                Desactivada
              </StatusText>
            )
          }
        />
      </SettingsGroup>

      <SessionsGroup />
      <SignInHistoryGroup />

      <ChangePasswordDialog
        email={session.user.email ?? ""}
        onClose={() => setDialog(null)}
        open={dialog === "password"}
      />
      <TwoFactorDialog
        factors={factors ?? []}
        onChanged={() => void loadFactors()}
        onClose={() => setDialog(null)}
        open={dialog === "two-factor"}
      />
    </>
  );
}

function SessionsGroup() {
  const { notify } = useToast();
  const sessions = useResource("account-sessions", (signal) =>
    accountApi.sessions(signal),
  );
  const [closing, setClosing] = useState<string | null>(null);
  const [confirmOthers, setConfirmOthers] = useState(false);

  async function close(sessionId: string) {
    setClosing(sessionId);
    try {
      await accountApi.closeSession(sessionId);
      notify("Cerramos esa sesión.");
      await sessions.reload();
    } catch (requestError) {
      notify(errorMessage(requestError), "error");
    } finally {
      setClosing(null);
    }
  }

  async function closeOthers() {
    setClosing("others");
    try {
      const { closed } = await accountApi.closeOtherSessions();
      notify(
        closed === 1
          ? "Cerramos la otra sesión."
          : `Cerramos ${closed} sesiones.`,
      );
      setConfirmOthers(false);
      await sessions.reload();
    } catch (requestError) {
      notify(errorMessage(requestError), "error");
    } finally {
      setClosing(null);
    }
  }

  const items = sessions.data?.items ?? [];
  const others = items.filter((item) => !item.current).length;
  return (
    <SettingsGroup
      actions={
        others > 0 ? (
          <button
            className="button button-secondary button-small"
            disabled={closing !== null}
            onClick={() => setConfirmOthers(true)}
            type="button"
          >
            Cerrar las demás
          </button>
        ) : null
      }
      description="Dispositivos donde tu cuenta está abierta ahora. Si no reconoces uno, ciérralo y cambia tu contraseña."
      id="security-sessions"
      title="Sesiones activas"
    >
      {sessions.error ? (
        <Notice tone="danger">{sessions.error}</Notice>
      ) : !sessions.data ? (
        <Skeleton lines={2} />
      ) : (
        items.map((item) => (
          <SettingsRow
            action={
              item.current ? null : (
                <button
                  aria-label={`Cerrar la sesión de ${describeDevice(item.userAgent)}`}
                  className="text-action"
                  disabled={closing !== null}
                  onClick={() => void close(item.id)}
                  type="button"
                >
                  {closing === item.id ? "Cerrando…" : "Cerrar"}
                </button>
              )
            }
            description={[
              item.ip ? `IP ${item.ip}` : null,
              `inició el ${formatDateTime(item.createdAt)}`,
            ]
              .filter(Boolean)
              .join(" · ")}
            key={item.id}
            label={
              <>
                {describeDevice(item.userAgent)}
                {item.current ? (
                  <span className="settings-tag">Esta sesión</span>
                ) : null}
              </>
            }
            value={
              item.current
                ? "Activa ahora"
                : `Activa ${formatRelative(item.lastActiveAt)}`
            }
          />
        ))
      )}
      <ConfirmDialog
        confirmLabel="Cerrar las demás"
        description={`Se cerrará tu cuenta en ${others === 1 ? "el otro dispositivo" : `los otros ${others} dispositivos`}. Este sigue abierto.`}
        isBusy={closing === "others"}
        onClose={() => setConfirmOthers(false)}
        onConfirm={() => void closeOthers()}
        open={confirmOthers}
        title="Cerrar las demás sesiones"
      />
    </SettingsGroup>
  );
}

function SignInHistoryGroup() {
  const history = useResource("account-sign-ins", (signal) =>
    accountApi.signIns(signal),
  );
  const [showAll, setShowAll] = useState(false);
  const items = history.data?.items ?? [];
  const visible = showAll ? items : items.slice(0, HISTORY_PREVIEW);

  return (
    <SettingsGroup
      description={`Cada vez que alguien entró a tu cuenta en los últimos ${history.data?.days ?? 90} días.`}
      footer={
        items.length > HISTORY_PREVIEW ? (
          <button
            className="text-action"
            onClick={() => setShowAll((value) => !value)}
            type="button"
          >
            {showAll
              ? "Ver menos"
              : `Ver los ${items.length} inicios de sesión`}
          </button>
        ) : null
      }
      id="security-history"
      title="Historial de inicios de sesión"
    >
      {history.error ? (
        <Notice tone="danger">{history.error}</Notice>
      ) : !history.data ? (
        <Skeleton lines={3} />
      ) : items.length === 0 ? (
        <SettingsRow label="Aún no hay inicios de sesión registrados." />
      ) : (
        visible.map((item) => (
          <SettingsRow
            description={item.ip ? `IP ${item.ip}` : undefined}
            key={item.id}
            label={describeDevice(item.userAgent)}
            value={formatDateTime(item.signedInAt)}
          />
        ))
      )}
    </SettingsGroup>
  );
}

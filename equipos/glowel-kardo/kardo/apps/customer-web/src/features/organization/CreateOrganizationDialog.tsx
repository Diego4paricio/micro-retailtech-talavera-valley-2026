import {
  type BillingMyAccount,
  type BillingPlanList,
  EMAIL_PATTERN,
} from "@kardo/contracts";
import { type FormEvent, useEffect, useState } from "react";
import { billingApi } from "../../api/billing.js";
import { workspacesApi } from "../../api/workspaces.js";
import { Dialog } from "../../components/Dialog.js";
import { Field } from "../../components/Field.js";
import { Icon } from "../../components/Icon.js";
import { Notice } from "../../components/Notice.js";
import { StepTrack } from "../../components/StepTrack.js";
import { useToast } from "../../components/Toast.js";
import { errorMessage } from "../../lib/api.js";
import { useRouter } from "../../lib/router.js";
import { useWorkspace } from "../../workspace/WorkspaceContext.js";
import { uploadImage } from "../assets/upload.js";
import { BrandPicker } from "../business-profile/BrandPicker.js";
import { countries, listTimeZones } from "../business-profile/options.js";
import { saveWorkspaceProfile } from "../business-profile/profile-store.js";
import { useLogoColor } from "../onboarding/logo-color.js";
import { CityCombobox } from "../profile-fields/CityCombobox.js";
import { HoursPicker } from "../profile-fields/HoursPicker.js";
import { PhoneInput } from "../profile-fields/PhoneInput.js";
import { phoneProblem } from "../profile-fields/phone.js";
import {
  accountInterval,
  accountPhase,
  atOrganizationCap,
  buildProfile,
  choosePlanForOrganizationLine,
  effectiveZone,
  extraChargeLine,
  extraOrganizationPrice,
  industryLabel,
  industryTiles,
  initialWizardState,
  needsPlanForOrganization,
  newOrganizationSteps,
  nextPlanUp,
  organizationCapLine,
  organizationPlanLine,
  paletteChoices,
  readDraft,
  saveDraft,
  type WizardState,
  zoneForCity,
} from "./new-organization-model.js";
import "./organization.css";
import { loadMyBillingAccount } from "../billing/my-account.js";

export { buildProfile, initialWizardState };

/**
 * «Crear organización» (relevo 36, approved 2026-10-07): four steps centered
 * on top — Negocio, Ubicación, Marca, Confirmar — and only the name is
 * required. The giro is picked, the city searched, the hours chosen, the
 * logo uploaded with colors taken from it, and Confirmar shows how it looks.
 * What was typed survives a reload of this tab; the logo is uploaded right
 * after the organization exists.
 */
export function CreateOrganizationDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { workspace, reloadWorkspaces, selectWorkspace } = useWorkspace();
  const { notify } = useToast();
  const [step, setStep] = useState(0);
  const [state, setState] = useState<WizardState>(initialWizardState);
  const [logo, setLogo] = useState<{ file: File; url: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [wasOpen, setWasOpen] = useState(false);
  const { navigate } = useRouter();
  const [account, setAccount] = useState<BillingMyAccount | null>(null);
  // Loading and failed are different (A2-8): a failed read must not leave
  // the dialog on «Un momento…» forever.
  const [accountFailed, setAccountFailed] = useState(false);
  const [accountTry, setAccountTry] = useState(0);
  const [catalog, setCatalog] = useState<BillingPlanList | null>(null);
  // The cap step: which option, the quoted charge, and "room made".
  const [capChoice, setCapChoice] = useState<"plan" | "extra">("plan");
  const [quote, setQuote] = useState<number | null>(null);
  const [capBusy, setCapBusy] = useState(false);
  const [madeRoom, setMadeRoom] = useState(false);
  const atLimit = !madeRoom && atOrganizationCap(account);

  // Every opening starts from the draft of this tab, or from scratch.
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setState(readDraft() ?? initialWizardState);
      setStep(0);
      setError(null);
      setCapChoice("plan");
      setQuote(null);
      setMadeRoom(false);
    }
  }

  // The plan is the person's (ADR 024): read her account when this opens.
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setAccountFailed(false);
    // «Reintentar» asks the server again; a first open reuses the copy the
    // side menu already read (A2-12).
    loadMyBillingAccount({ force: accountTry > 0 })
      .then((value) => {
        if (!controller.signal.aborted) setAccount(value);
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setAccount(null);
        setAccountFailed(true);
      });
    return () => controller.abort();
  }, [open, accountTry]);

  // The catalog is only needed to offer the next plan at the cap.
  useEffect(() => {
    if (!open || !atLimit || catalog) return;
    billingApi
      .plans()
      .then(setCatalog)
      .catch(() => setCatalog(null));
  }, [open, atLimit, catalog]);

  // The local preview of the logo goes away with it.
  useEffect(
    () => () => {
      if (logo) URL.revokeObjectURL(logo.url);
    },
    [logo],
  );

  const logoColor = useLogoColor(logo?.url ?? null, logo ? "ready" : "idle");
  // A new logo suggests its colors, unless the person chose their own.
  useEffect(() => {
    if (!logoColor || state.customColors) return;
    const first = paletteChoices(logoColor)[0];
    if (first) {
      setState((current) => ({
        ...current,
        primary: first.primary,
        accent: first.accent,
      }));
    }
  }, [logoColor, state.customColors]);

  function update(patch: Partial<WizardState>) {
    setState((current) => {
      const next = { ...current, ...patch };
      saveDraft(next);
      return next;
    });
  }

  function close() {
    // Closing while it is being created would switch spaces unexpectedly (E10).
    if (isSubmitting) return;
    onClose();
  }

  function cancel() {
    saveDraft(null);
    setLogo(null);
    onClose();
  }

  const phoneError = phoneProblem(state.whatsapp, state.country);
  const emailError =
    state.email.trim() && !EMAIL_PATTERN.test(state.email.trim())
      ? "Revisa el correo."
      : null;
  const canAdvance =
    step === 0
      ? Boolean(state.name.trim())
      : step === 1
        ? !phoneError && !emailError
        : true;

  async function create() {
    setError(null);
    setIsSubmitting(true);
    try {
      const organization = await workspacesApi.createOrganization({
        name: state.name.trim(),
      });
      let logoAssetId: string | undefined;
      let logoFailed = false;
      let logoProblem = "";
      if (logo) {
        try {
          logoAssetId = (await uploadImage(organization.id, logo.file)).id;
        } catch (cause) {
          logoFailed = true;
          logoProblem = errorMessage(cause);
        }
      }
      try {
        await saveWorkspaceProfile(
          organization.id,
          buildProfile(state, logoAssetId),
        );
      } catch (cause) {
        // The organization exists: say exactly what was not saved (E9).
        notify(
          `Creamos «${organization.name}», pero no guardamos sus datos: ${errorMessage(cause)} Complétalos en Configuración.`,
          "error",
        );
      }
      if (logoFailed)
        notify(
          `Creamos «${organization.name}», pero no pudimos subir el logo: ${logoProblem} Lo agregas después en Configuración → Marca.`,
          "error",
        );
      saveDraft(null);
      setLogo(null);
      await reloadWorkspaces();
      selectWorkspace(organization.id);
      notify(`Organización «${organization.name}» creada.`);
      onClose();
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setIsSubmitting(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canAdvance) return;
    if (step === newOrganizationSteps.length - 1) {
      void create();
      return;
    }
    setError(null);
    setStep((current) => current + 1);
  }

  if (atLimit && account) {
    const next = nextPlanUp(account, catalog);
    const extraPrice = account.canAddExtras
      ? extraOrganizationPrice(account)
      : null;
    // During the trial extras aren't available, so only the plan upgrade
    // shows and people think it's the only way out (round 4, Diego). Mention
    // the cheaper extra-organization path they'll have once the trial ends.
    const trialExtraPrice =
      !account.canAddExtras && account.plan?.source === "trial"
        ? extraOrganizationPrice(account)
        : null;
    const noPlan = needsPlanForOrganization(account);
    const choice = noPlan || next || !extraPrice ? capChoice : "extra";
    const interval = accountInterval(account);
    const homeId = account.homeWorkspaceId;

    async function continueCap() {
      if (!account) return;
      setError(null);
      if (noPlan || choice === "plan") {
        saveDraft(null);
        if (homeId && homeId !== workspace.id) selectWorkspace(homeId);
        navigate({ name: "settings", section: "plan" });
        onClose();
        return;
      }
      if (!homeId) return;
      const current =
        account.extras.find((extra) => extra.code === "organization")
          ?.quantity ?? 0;
      setCapBusy(true);
      try {
        const result = await billingApi.changeExtras(homeId, {
          quantities: { organization: current + 1 },
          confirm: quote !== null,
        });
        if (quote === null) {
          setQuote(result.amountDueToday);
        } else {
          setMadeRoom(true);
          loadMyBillingAccount({ force: true }).then(setAccount, () => {});
        }
      } catch (cause) {
        setError(errorMessage(cause));
      } finally {
        setCapBusy(false);
      }
    }

    return (
      <Dialog
        footer={
          <>
            <button
              className="button button-secondary"
              disabled={capBusy}
              onClick={quote !== null ? () => setQuote(null) : cancel}
              type="button"
            >
              {quote !== null ? "Atrás" : "Cancelar"}
            </button>
            <button
              aria-busy={capBusy || undefined}
              className="button button-primary"
              disabled={capBusy || (!noPlan && choice === "plan" && !next)}
              onClick={() => void continueCap()}
              type="button"
            >
              {quote !== null
                ? capBusy
                  ? "Agregando…"
                  : "Agregar y seguir"
                : noPlan
                  ? "Elegir un plan"
                  : "Continuar"}
            </button>
          </>
        }
        onClose={capBusy ? () => {} : onClose}
        open={open}
        title="Crear organización"
      >
        <div className="new-org-cap">
          <p className="new-org-plan new-org-plan-cap">
            <span aria-hidden="true" />
            {noPlan
              ? choosePlanForOrganizationLine
              : organizationCapLine(account)}
          </p>
          {noPlan ? null : quote !== null ? (
            <p className="new-org-line">{extraChargeLine(quote, interval)}</p>
          ) : (
            <fieldset className="new-org-cap-options">
              <legend className="visually-hidden">Cómo seguir</legend>
              {next ? (
                <label className="new-org-cap-option">
                  <input
                    checked={choice === "plan"}
                    name="new-org-cap"
                    onChange={() => setCapChoice("plan")}
                    type="radio"
                  />
                  <span>
                    <b>Subir a {next.name}</b>
                    <small>{next.line}</small>
                  </span>
                </label>
              ) : null}
              {extraPrice ? (
                <label className="new-org-cap-option">
                  <input
                    checked={choice === "extra"}
                    name="new-org-cap"
                    onChange={() => setCapChoice("extra")}
                    type="radio"
                  />
                  <span>
                    <b>Agregar una organización</b>
                    <small>
                      {extraPrice}. Comparte los límites de tu plan.
                    </small>
                  </span>
                </label>
              ) : null}
            </fieldset>
          )}
          {!noPlan && quote === null && trialExtraPrice ? (
            <p className="field-hint">
              Al terminar tu prueba puedes quedarte en{" "}
              {account.plan?.name ?? "tu plan"} y agregar una organización por{" "}
              {trialExtraPrice} (comparte los límites de tu plan), sin subir
              {next ? ` a ${next.name}` : " de plan"}.
            </p>
          ) : null}
          {error ? <Notice tone="danger">{error}</Notice> : null}
        </div>
      </Dialog>
    );
  }

  // Until the account is known, do not show the create form: otherwise it
  // flashes and then flips to the cap screen when the person turns out to be
  // at their organization limit (round 4, owner). Show a brief loading
  // instead, so at the limit the dialog opens straight on the cap.
  if (open && accountPhase(account, accountFailed) === "loading") {
    return (
      <Dialog onClose={onClose} open={open} title="Crear organización">
        <p className="field-hint">Un momento…</p>
      </Dialog>
    );
  }

  const last = step === newOrganizationSteps.length - 1;
  return (
    <Dialog
      footer={
        <>
          {step > 0 ? (
            <button
              className="button button-secondary"
              disabled={isSubmitting}
              onClick={() => setStep((current) => current - 1)}
              type="button"
            >
              Atrás
            </button>
          ) : (
            <button
              className="button button-secondary"
              onClick={cancel}
              type="button"
            >
              Cancelar
            </button>
          )}
          <button
            aria-busy={isSubmitting || undefined}
            className="button button-primary"
            disabled={isSubmitting || !canAdvance}
            form="create-organization-form"
            type="submit"
          >
            {!last
              ? "Siguiente"
              : isSubmitting
                ? "Creando…"
                : "Crear organización"}
          </button>
        </>
      }
      onClose={close}
      open={open}
      title="Crear organización"
    >
      <div className="new-org">
        <StepTrack
          current={step}
          items={newOrganizationSteps.map((label, index) => ({
            label,
            done: index < step,
          }))}
          label="Pasos para crear la organización"
          onSelect={(index) => {
            // Back freely; forward only once the name is there.
            if (index <= step || state.name.trim()) setStep(index);
          }}
        />
        <form
          className="form-grid new-org-form"
          id="create-organization-form"
          onSubmit={submit}
        >
          {error ? <Notice tone="danger">{error}</Notice> : null}
          {accountFailed ? (
            <Notice tone="info">
              No pudimos revisar tu plan; Kardo lo revisará al crear.{" "}
              <button
                className="text-action"
                onClick={() => setAccountTry((current) => current + 1)}
                type="button"
              >
                Reintentar
              </button>
            </Notice>
          ) : null}
          {step === 0 ? (
            <BusinessStep account={account} state={state} update={update} />
          ) : null}
          {step === 1 ? (
            <PlaceStep
              emailError={emailError}
              phoneError={phoneError}
              state={state}
              update={update}
            />
          ) : null}
          {step === 2 ? (
            <BrandPicker
              accent={state.accent}
              logo={logo}
              logoColor={logoColor ?? null}
              logoNote="Se sube al crear la organización. Si no se sube, lo agregas después en Configuración → Marca."
              onColors={(colors) => update({ ...colors, customColors: true })}
              onLogo={(file) => {
                setLogo(file ? { file, url: URL.createObjectURL(file) } : null);
                if (!file)
                  update({
                    primary: initialWizardState.primary,
                    accent: initialWizardState.accent,
                  });
              }}
              primary={state.primary}
            />
          ) : null}
          {step === 3 ? (
            <ConfirmStep
              account={account}
              logoUrl={logo?.url ?? null}
              onEdit={setStep}
              state={state}
            />
          ) : null}
        </form>
      </div>
    </Dialog>
  );
}

type StepProps = {
  state: WizardState;
  update: (patch: Partial<WizardState>) => void;
};

function PlanLine({ account }: { account: BillingMyAccount | null }) {
  return (
    <p className="new-org-plan" data-tone={account?.plan ? "ok" : "none"}>
      <span aria-hidden="true" />
      {organizationPlanLine(account)}
    </p>
  );
}

function BusinessStep({
  account,
  state,
  update,
}: StepProps & { account: BillingMyAccount | null }) {
  return (
    <>
      <Field id="new-org-name" label="Nombre">
        <input
          // biome-ignore lint/a11y/noAutofocus: the dialog's first and only required field
          autoFocus
          id="new-org-name"
          maxLength={120}
          onChange={(event) => update({ name: event.target.value })}
          placeholder="Por ejemplo, Florería Lila Centro"
          required
          value={state.name}
        />
      </Field>
      <fieldset className="new-org-giros">
        <legend>Giro</legend>
        {industryTiles.map((choice) => (
          <button
            aria-pressed={state.industry === choice.value}
            className="new-org-giro"
            key={choice.value}
            onClick={() =>
              update({
                industry: state.industry === choice.value ? "" : choice.value,
              })
            }
            type="button"
          >
            <Icon name={choice.icon} size={18} />
            {choice.label}
          </button>
        ))}
      </fieldset>
      <Field
        counter={{ value: state.about.length, max: 280 }}
        hint="Una frase: qué haces y para quién."
        id="new-org-about"
        label="Sobre tu negocio"
        optional
      >
        <input
          id="new-org-about"
          maxLength={280}
          onChange={(event) => update({ about: event.target.value })}
          value={state.about}
        />
      </Field>
      <PlanLine account={account} />
    </>
  );
}

function PlaceStep({
  state,
  update,
  phoneError,
  emailError,
}: StepProps & { phoneError: string | null; emailError: string | null }) {
  const [choosingZone, setChoosingZone] = useState(state.timezone !== null);
  const zone = state.timezone
    ? { zone: state.timezone, label: state.timezone }
    : zoneForCity(state.city, state.country);
  return (
    <>
      <div className="form-grid-2">
        <Field id="new-org-country" label="País">
          <select
            id="new-org-country"
            onChange={(event) => update({ country: event.target.value })}
            value={state.country}
          >
            {countries.map((country) => (
              <option key={country.code} value={country.code}>
                {country.label}
              </option>
            ))}
          </select>
        </Field>
        <Field id="new-org-city" label="Ciudad" optional>
          <CityCombobox
            country={state.country}
            id="new-org-city"
            onChange={(city) => update({ city })}
            value={state.city}
          />
        </Field>
      </div>
      {choosingZone ? (
        <Field
          hint="Para las horas de tus visitas y solicitudes."
          id="new-org-zone"
          label="Zona horaria del negocio"
        >
          <select
            id="new-org-zone"
            onChange={(event) => update({ timezone: event.target.value })}
            value={effectiveZone(state)}
          >
            {listTimeZones().map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </Field>
      ) : (
        <p className="new-org-zone">
          Zona horaria del negocio: <strong>{zone.label}</strong>, por la
          ciudad. Es para las horas de tus visitas y solicitudes.{" "}
          <button
            className="text-action"
            onClick={() => setChoosingZone(true)}
            type="button"
          >
            Cambiar
          </button>
        </p>
      )}
      <Field
        hint="Calle, número y colonia."
        id="new-org-address"
        label="Dirección"
        optional
      >
        <input
          autoComplete="street-address"
          id="new-org-address"
          maxLength={200}
          onChange={(event) => update({ address: event.target.value })}
          value={state.address}
        />
      </Field>
      <Field id="new-org-hours" label="Horario" optional>
        <HoursPicker
          id="new-org-hours"
          onChange={(hours) => update({ hours })}
          value={state.hours}
        />
      </Field>
      <div className="form-grid-2">
        <Field
          error={phoneError ?? undefined}
          id="new-org-whatsapp"
          label="WhatsApp"
          optional
        >
          <PhoneInput
            country={state.country}
            id="new-org-whatsapp"
            onChange={(whatsapp) => update({ whatsapp })}
            value={state.whatsapp}
          />
        </Field>
        <Field
          error={emailError ?? undefined}
          id="new-org-email"
          label="Correo"
          optional
        >
          <input
            autoComplete="email"
            id="new-org-email"
            onChange={(event) => update({ email: event.target.value })}
            type="email"
            value={state.email}
          />
        </Field>
      </div>
    </>
  );
}

function ConfirmStep({
  account,
  state,
  logoUrl,
  onEdit,
}: {
  account: BillingMyAccount | null;
  state: WizardState;
  logoUrl: string | null;
  onEdit: (step: number) => void;
}) {
  const giro = industryLabel(state.industry);
  const city = state.city.trim();
  const country = countries.find((item) => item.code === state.country)?.label;
  const contact = [
    state.whatsapp.trim() ? `WhatsApp ${state.whatsapp.trim()}` : "",
    state.email.trim(),
  ]
    .filter(Boolean)
    .join(" · ");
  const row = (
    label: string,
    value: string,
    detail: string | null,
    stepIndex: number,
  ) => (
    <div className="new-org-sum-row">
      <span>{label}</span>
      <strong>{value}</strong>
      {detail ? <small>{detail}</small> : null}
      <button
        className="text-action"
        onClick={() => onEdit(stepIndex)}
        type="button"
      >
        Cambiar
      </button>
    </div>
  );
  return (
    <div className="new-org-confirm">
      <div>
        <p className="new-org-hint">Así se verán tu logo y tus colores</p>
        <div className="new-org-preview" aria-hidden="true">
          <div
            className="new-org-preview-top"
            style={{ background: state.primary }}
          >
            <span className="new-org-preview-logo">
              {logoUrl ? (
                <img alt="" src={logoUrl} />
              ) : (
                <b style={{ color: state.primary }}>
                  {state.name.trim().charAt(0).toUpperCase() || "K"}
                </b>
              )}
            </span>
            <strong>{state.name.trim() || "Tu negocio"}</strong>
            <small>
              {[giro, city.split(",")[0]].filter(Boolean).join(" · ")}
            </small>
          </div>
          <div className="new-org-preview-body">
            {state.hours.trim() ? (
              <span>
                <Icon name="history" size={13} /> {state.hours.trim()}
              </span>
            ) : null}
            {city ? (
              <span>
                <Icon name="location" size={13} /> {city}
              </span>
            ) : null}
            {state.whatsapp.trim() ? (
              <i style={{ background: state.primary }}>WhatsApp</i>
            ) : null}
            <em style={{ background: state.accent }} />
            <em />
          </div>
        </div>
      </div>
      <div className="new-org-sum">
        {row(
          "Negocio",
          state.name.trim() || "Sin nombre",
          [giro, state.about.trim()].filter(Boolean).join(" · ") || null,
          0,
        )}
        {row(
          "Ubicación",
          [city, country].filter(Boolean).join(", ") || "Sin ubicación",
          [state.address.trim(), state.hours.trim()]
            .filter(Boolean)
            .join(" · ") || null,
          1,
        )}
        {row("Contacto", contact || "Sin contacto", null, 1)}
        {row("Marca", logoUrl ? "Logo y colores" : "Colores", null, 2)}
        <PlanLine account={account} />
      </div>
    </div>
  );
}

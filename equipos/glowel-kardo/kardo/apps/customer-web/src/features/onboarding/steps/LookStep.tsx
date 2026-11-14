import {
  type DesignableExperienceType,
  type ExperienceContent,
  type ExperienceSummary,
  type PageDesign,
  whatsappUrlFromPhone,
} from "@kardo/contracts";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { experiencesApi } from "../../../api/experiences.js";
import { Notice } from "../../../components/Notice.js";
import { errorMessage } from "../../../lib/api.js";
import { useAssetImage } from "../../../lib/asset-images.js";
import { useRouter } from "../../../lib/router.js";
import { useWorkspace } from "../../../workspace/WorkspaceContext.js";
import { saveWorkspaceProfile } from "../../business-profile/profile-store.js";
import { republishIfLive } from "../../experiences/assign.js";
import {
  contentItemIds,
  contentMenuSectionIds,
} from "../../studio/model/content.js";
import { createIdFactory } from "../../studio/model/ids.js";
import { validateDesign } from "../../studio/model/validate.js";
import { DesignedPreview } from "../../studio/preview/DesignedPreview.js";
import { DesignThumbnail } from "../../studio/preview/DesignThumbnail.js";
import { requestStudioRail } from "../../studio/studio-entry-rail.js";
import {
  familyFor,
  firstImpressionDesign,
  type Look,
  looksFor,
  quickColors,
} from "../../studio/templates/first-impression/index.js";
import {
  contentHasPhotos,
  contentWithTexts,
  type LookTexts,
  listTitleFor,
  lookTexts,
} from "../first-look.js";
import { logoBrandToSave, useLogoColor } from "../logo-color.js";
import type { FirstSteps } from "../use-first-steps.js";
import { LogoAsk } from "./LogoAsk.js";

const CURRENT = "current";

const colorNames: Record<string, string> = {
  "#b42318": "Rojo",
  "#8e3b4e": "Vino",
  "#2346a0": "Azul",
  "#1f6f5c": "Verde",
  "#b7791f": "Mostaza",
  "#1f2328": "Carbón",
};

const isHex = (value: string | undefined): value is string =>
  Boolean(value && /^#[0-9a-f]{6}$/i.test(value));

/**
 * 3. Cómo se ve (relevo 33, owner 2026-10-04: «es la primera impresión que
 * le daremos al cliente»). The page as its customers will see it, in one of
 * twenty first-impression looks (the giro's best first) already filled with
 * the business's data; the color and the two texts change right here, and
 * anything else in the Estudio.
 */
export function LookStep({
  experience,
  steps,
  onDone,
}: {
  experience: ExperienceSummary;
  steps: FirstSteps;
  onDone: () => void;
}) {
  if (experience.type === "redirect")
    return (
      <div className="fs-form fs-card fs-narrow">
        <p className="fs-note">Quien escanee va directo a tu sitio web.</p>
        <button
          className="button button-primary fs-cta"
          onClick={onDone}
          type="button"
        >
          Seguir
        </button>
      </div>
    );
  return (
    <FirstLook
      experience={experience}
      onDone={onDone}
      steps={steps}
      type={experience.type as DesignableExperienceType}
    />
  );
}

function FirstLook({
  experience,
  type,
  steps,
  onDone,
}: {
  experience: ExperienceSummary;
  type: DesignableExperienceType;
  steps: FirstSteps;
  onDone: () => void;
}) {
  const { workspace, can, upsertExperience, refreshPublicationState } =
    useWorkspace();
  const { navigate } = useRouter();
  const profile = steps.profile.data;
  // Read from the steps' own profile: the logo uploaded a moment ago shows
  // in every look at once.
  const logoAssetId = profile?.logoAssetId;
  const whatsappUrl = whatsappUrlFromPhone(profile?.phone, profile?.country);
  const [askLogo, setAskLogo] = useState(
    () => !profile?.logoAssetId && !steps.logoAsked,
  );
  const plan = steps.state.plan;
  const family = familyFor(profile?.industry);
  const looks = useMemo(() => looksFor(family), [family]);
  const content = experience.content as ExperienceContent;
  const saved = (content as { design?: PageDesign }).design;
  const brandColors = useMemo(() => {
    const brand = profile?.brand;
    return [...new Set([brand?.primary, brand?.accent].filter(isHex))].map(
      (color) => color.toLowerCase(),
    );
  }, [profile?.brand]);
  const logo = useAssetImage(workspace.id, logoAssetId, "thumb");
  // With a brand saved, the logo is not read again.
  const logoColor = useLogoColor(profile?.brand ? null : logo.url, logo.status);
  // The business's own color: its brand's, or else its logo's (owner,
  // 2026-10-07: a purple logo should not get a blue page).
  const ownColors = useMemo(
    () => (brandColors.length ? brandColors : logoColor ? [logoColor] : []),
    [brandColors, logoColor],
  );
  // The logo's color is kept ONCE as the organization's brand, so Marca
  // shows it too and it is not read again next time (A2-6).
  const keptLogoBrand = useRef(false);
  const canManageBusiness = can("workspace.manage");
  useEffect(() => {
    const brand = logoBrandToSave({
      profile: profile ?? null,
      logoColor,
      canManage: canManageBusiness,
    });
    if (!brand || keptLogoBrand.current) return;
    keptLogoBrand.current = true;
    // Best effort: the looks already use the color either way.
    void saveWorkspaceProfile(workspace.id, { brand }).catch(() => undefined);
  }, [profile, logoColor, canManageBusiness, workspace.id]);
  const readingLogo =
    !brandColors.length && Boolean(logoAssetId) && logoColor === undefined;

  const [choice, setChoice] = useState(saved ? CURRENT : (looks[0]?.id ?? ""));
  const [accent, setAccent] = useState<string | null>(null);
  const [texts, setTexts] = useState<LookTexts>(() =>
    lookTexts({
      type,
      content,
      plan,
      businessName: workspace.name,
      city: profile?.city,
    }),
  );
  // Typing redraws the previews a moment later, not on every key.
  const shownTexts = useDeferredValue(texts);
  const [busy, setBusy] = useState<"use" | "studio" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const contentIds = useMemo(() => contentItemIds(content), [content]);
  const accentFor = (look: Look) =>
    accent ?? ownColors[0] ?? look.defaultAccent;
  const build = (look: Look, value: LookTexts): PageDesign =>
    firstImpressionDesign({
      type,
      family,
      look: look.id,
      accent: accentFor(look),
      title: value.title.trim() || workspace.name,
      phrase: value.phrase,
      listTitle: listTitleFor(plan),
      hours: profile?.hours,
      city: profile?.city,
      whatsappUrl,
      logoAssetId,
      hasPhotos: contentHasPhotos(content),
      profileName: value.title,
      profileBio: value.phrase,
      newId: createIdFactory(contentIds),
    });
  // biome-ignore lint/correctness/useExhaustiveDependencies: `build` reads exactly these
  const designs = useMemo(
    () => new Map(looks.map((look) => [look.id, build(look, shownTexts)])),
    [looks, shownTexts, accent, ownColors, profile, content],
  );
  const shownContent = useMemo(
    () =>
      withLogoPhoto(
        type,
        contentWithTexts(type, content, shownTexts),
        logoAssetId,
      ),
    [type, content, shownTexts, logoAssetId],
  );
  const selected =
    choice === CURRENT
      ? saved
      : (designs.get(choice) ?? designs.values().next().value);
  const look = looks.find((item) => item.id === choice) ?? null;

  /** Saves the chosen look with the owner's texts; «Tu diseño» stays. */
  async function keep() {
    if (!look) return;
    const design = build(look, texts);
    const issues = validateDesign(
      type,
      design,
      contentIds,
      contentMenuSectionIds(content),
    );
    if (issues.length)
      throw new Error("No se pudo preparar este estilo. Elige otro.");
    const updated = await experiencesApi.update(workspace.id, experience.id, {
      name: experience.name,
      content: {
        ...(withLogoPhoto(
          type,
          contentWithTexts(type, content, texts),
          logoAssetId,
        ) as Record<string, unknown>),
        design,
      } as unknown as ExperienceContent,
    });
    upsertExperience(updated);
    if (await republishIfLive(workspace.id, experience))
      await refreshPublicationState();
  }
  async function run(action: "use" | "studio") {
    if (busy) return;
    setBusy(action);
    setError(null);
    try {
      await keep();
      if (action === "use") onDone();
      else navigate({ name: "experience-studio", id: experience.id });
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(null);
    }
  }
  function askAi() {
    requestStudioRail(experience.id, "ai");
    navigate({ name: "experience-studio", id: experience.id });
  }

  if (askLogo)
    return <LogoAsk onDone={() => setAskLogo(false)} steps={steps} />;
  if (readingLogo)
    return (
      <p aria-busy="true" className="fs-note fs-center">
        Preparando tus estilos…
      </p>
    );

  const colors = [
    ...ownColors,
    ...quickColors.filter((color) => !ownColors.includes(color)),
  ].slice(0, 7);
  const ownLabel = brandColors.length ? "Tu marca" : "De tu logo";
  const currentAccent = look ? accentFor(look) : null;
  const ownName = type === "profile" || type === "linkpage";

  return (
    <div className="fs-look">
      <div className="fs-look-phone">
        {selected ? (
          <DesignedPreview
            placeholders={false}
            content={shownContent}
            design={selected}
            type={type}
          />
        ) : null}
      </div>
      <div className="fs-look-controls">
        <div className="fs-look-logo">
          {logo.url ? (
            <img alt="Tu logo" className="fs-look-logo-image" src={logo.url} />
          ) : null}
          <span>Logo</span>
          <button
            className="link-button"
            onClick={() => setAskLogo(true)}
            type="button"
          >
            {logoAssetId ? "Cambiar tu logo" : "Subir tu logo"}
          </button>
        </div>
        <fieldset className="fs-look-field">
          <legend>Estilo</legend>
          <div className="fs-look-strip">
            {saved ? (
              <LookOption
                content={content}
                design={saved}
                name="Tu diseño"
                onPick={() => setChoice(CURRENT)}
                pressed={choice === CURRENT}
                type={type}
              />
            ) : null}
            {looks.map((item) => {
              const design = designs.get(item.id);
              return design ? (
                <LookOption
                  content={shownContent}
                  design={design}
                  key={item.id}
                  name={item.name}
                  onPick={() => setChoice(item.id)}
                  pressed={choice === item.id}
                  type={type}
                />
              ) : null;
            })}
          </div>
        </fieldset>
        {look ? (
          <>
            <fieldset className="fs-look-field">
              <legend>Color</legend>
              <div className="fs-swatches">
                {colors.map((color, index) => {
                  const brand = index < ownColors.length;
                  return (
                    <button
                      aria-label={
                        brand
                          ? brandColors.length
                            ? "Color de tu marca"
                            : "Color de tu logo"
                          : (colorNames[color] ?? color)
                      }
                      aria-pressed={currentAccent === color}
                      className={
                        brand ? "fs-swatch fs-swatch-brand" : "fs-swatch"
                      }
                      key={color}
                      onClick={() => setAccent(color)}
                      style={{ background: color }}
                      title={brand ? ownLabel : colorNames[color]}
                      type="button"
                    />
                  );
                })}
              </div>
            </fieldset>
            <label className="fs-look-text">
              <span>{ownName ? "Nombre" : "Título"}</span>
              <input
                className="input"
                maxLength={60}
                onChange={(event) =>
                  setTexts((current) => ({
                    ...current,
                    title: event.target.value,
                  }))
                }
                value={texts.title}
              />
            </label>
            <label className="fs-look-text">
              <span>Frase</span>
              <input
                className="input"
                maxLength={type === "profile" ? 160 : 90}
                onChange={(event) =>
                  setTexts((current) => ({
                    ...current,
                    phrase: event.target.value,
                  }))
                }
                value={texts.phrase}
              />
            </label>
          </>
        ) : null}
        {error ? <Notice tone="danger">{error}</Notice> : null}
        <button
          aria-busy={busy === "use" || undefined}
          className="button button-primary fs-cta"
          disabled={busy !== null}
          onClick={() => void run("use")}
          type="button"
        >
          {busy === "use"
            ? "Guardando…"
            : look
              ? "Usar este diseño y seguir"
              : "Seguir con mi diseño"}
        </button>
        <p className="fs-more">
          ¿Quieres cambiar más?{" "}
          <button
            className="link-button"
            disabled={busy !== null}
            onClick={() => void run("studio")}
            type="button"
          >
            Ábrela en el Estudio
          </button>{" "}
          o{" "}
          <button className="link-button" onClick={askAi} type="button">
            pídeselo a la IA
          </button>
          .
        </p>
      </div>
    </div>
  );
}

function LookOption({
  type,
  content,
  design,
  name,
  pressed,
  onPick,
}: {
  type: DesignableExperienceType;
  content: ExperienceContent;
  design: PageDesign;
  name: string;
  pressed: boolean;
  onPick: () => void;
}) {
  return (
    <button
      aria-pressed={pressed}
      className="fs-look-option"
      onClick={onPick}
      type="button"
    >
      <DesignThumbnail
        placeholders={false}
        content={content}
        design={design}
        label={`Estilo «${name}»`}
        scale={0.26}
        type={type}
      />
      <span>{name}</span>
    </button>
  );
}

/** A Perfil or a Página de enlaces without a photo of their own show the
 * business's logo as one. */
function withLogoPhoto(
  type: DesignableExperienceType,
  content: ExperienceContent,
  logoAssetId: string | undefined,
): ExperienceContent {
  if (!logoAssetId || (type !== "profile" && type !== "linkpage"))
    return content;
  const value = content as { avatarAssetId?: string };
  return value.avatarAssetId
    ? content
    : ({ ...value, avatarAssetId: logoAssetId } as ExperienceContent);
}

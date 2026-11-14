import { Check } from "lucide-react";
import { loadKits, lowestMonthlyPrice } from "@/lib/kits";
import { formatPesos, loadPricing } from "@/lib/pricing";
import { panel, whatsappLink } from "@/lib/site";
import { WhatsAppIcon } from "../ui";
import { lowestKitPrice } from "./start-copy";

const kitQuestion = "Hola, quiero saber qué kit de Kardo me conviene";

/**
 * The two ways in, side by side (ADR 020 and ADR 025): the panel alone with
 * the trial, for whoever already has where to put a QR or an NFC, or a kit of
 * printed pieces that brings its own days of panel. Numbers come from the
 * two catalogs.
 */
export function StartPaths() {
  const pricing = loadPricing();
  const kits = loadKits();
  const planFrom = lowestMonthlyPrice();
  const kitFrom = lowestKitPrice(kits);
  return (
    <div className="start-paths">
      <article className="start-path">
        <p className="editorial-label">Solo el panel</p>
        <h3>Prueba el panel {pricing.trialDays} días gratis.</h3>
        <p className="start-path-lead">
          Creas tu cuenta sin tarjeta y conectas los QR que imprimas desde el
          panel o los NFC que ya tengas.
        </p>
        {planFrom !== null ? (
          <p className="start-path-price">
            <span>Después, desde</span>
            {formatPesos(planFrom)}
            <span>al mes, IVA incluido</span>
          </p>
        ) : null}
        <ul className="start-path-list">
          <li>
            <Check aria-hidden="true" className="size-4 shrink-0" />
            Sin tarjeta y sin cobro al terminar
          </li>
          <li>
            <Check aria-hidden="true" className="size-4 shrink-0" />
            Diseñas tus QR y los descargas listos para imprenta
          </li>
          <li>
            <Check aria-hidden="true" className="size-4 shrink-0" />
            Tu prueba usa el plan {pricing.trialPlanName}
          </li>
        </ul>
        <div className="start-path-actions">
          <a className="editorial-button" href={panel.signUp}>
            Crear mi cuenta
          </a>
        </div>
      </article>

      <article className="start-path start-path-kit">
        <p className="editorial-label">Con piezas Kardo</p>
        <h3>Pide un kit con tu marca.</h3>
        <p className="start-path-lead">
          Stand, Card, Magnet o Sticker, impresos con tu logo y probados, con QR
          y NFC. Tu kit trae {kits.panelDays} días del panel.
        </p>
        {kitFrom !== null ? (
          <p className="start-path-price">
            <span>Kits desde</span>
            {formatPesos(kitFrom)}
            <span>un solo pago, IVA incluido</span>
          </p>
        ) : null}
        <ul className="start-path-list">
          <li>
            <Check aria-hidden="true" className="size-4 shrink-0" />
            Te enseñamos el diseño antes de imprimir
          </li>
          <li>
            <Check aria-hidden="true" className="size-4 shrink-0" />
            Un código activa todas las piezas del kit
          </li>
          <li>
            <Check aria-hidden="true" className="size-4 shrink-0" />
            {kits.panelDays} días del panel incluidos
          </li>
        </ul>
        <div className="start-path-actions">
          <a className="editorial-button editorial-button-ink" href="#kits">
            Ver los kits
          </a>
          <a
            className="editorial-link"
            href={whatsappLink(kitQuestion)}
            rel="noopener"
          >
            <WhatsAppIcon className="size-[18px] text-whatsapp" />
            <span>Pregúntanos</span>
          </a>
        </div>
      </article>
    </div>
  );
}

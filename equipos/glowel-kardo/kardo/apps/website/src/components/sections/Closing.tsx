import { closing } from "@/content/landing";
import { loadKits } from "@/lib/kits";
import { loadPricing } from "@/lib/pricing";
import { panel, whatsappLink } from "@/lib/site";
import { closingLead } from "../pricing/start-copy";
import { WhatsAppIcon } from "../ui";

/** High contrast close: the two ways in, with the catalogs' numbers. */
export function Closing() {
  return (
    <section
      aria-labelledby="cierre-title"
      className="editorial-closing"
      id="cierre"
    >
      <p className="editorial-label">{closing.label}</p>
      <h2 id="cierre-title">{closing.title}</h2>
      <p className="editorial-closing-lead">
        {closingLead(loadPricing(), loadKits())}
      </p>
      <div className="editorial-actions">
        <a
          className="editorial-button editorial-button-aqua"
          href={panel.signUp}
        >
          {closing.cta}
        </a>
        <a
          className="editorial-link editorial-link-light"
          href={whatsappLink(closing.whatsappMessage)}
          rel="noopener"
        >
          <WhatsAppIcon className="size-[18px] text-whatsapp" />
          <span>{closing.ctaSecondary}</span>
        </a>
      </div>
    </section>
  );
}

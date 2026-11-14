import { Plus } from "lucide-react";
import type { ReactNode } from "react";
import { faqs } from "@/content/landing";

export function Faq({
  items = faqs,
  title = "Preguntas frecuentes",
  lead = "Si tu duda no está aquí, escríbenos por WhatsApp para resolverla.",
}: {
  items?: { q: string; a: string }[];
  title?: string;
  lead?: ReactNode;
}) {
  return (
    <section
      aria-labelledby="preguntas-title"
      className="editorial-section faq-editorial"
      id="preguntas"
    >
      <div>
        <h2 id="preguntas-title">{title}</h2>
        {lead ? <p className="faq-lead">{lead}</p> : null}
      </div>
      <div className="faq-list">
        {items.map((faq) => (
          <details className="group" key={faq.q}>
            <summary>
              <span>{faq.q}</span>
              <Plus
                aria-hidden="true"
                className="size-5 shrink-0 text-soft transition-transform duration-300 group-open:rotate-45 group-open:text-teal"
              />
            </summary>
            <p>{faq.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

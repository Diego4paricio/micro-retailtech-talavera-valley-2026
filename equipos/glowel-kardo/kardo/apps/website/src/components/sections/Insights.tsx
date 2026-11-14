import { Check, FileDown } from "lucide-react";
import { insights } from "@/content/landing";
import { ResumenBoard } from "../insights/ResumenBoard";
import { ResumenCaption } from "../insights/ResumenCaption";
import { Container, Section, SectionTitle } from "../ui";

export function Insights() {
  return (
    <Section
      className="relative overflow-hidden"
      id="resultados"
      labelledBy="resultados-title"
      tone="ink"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-40 left-1/2 h-[36rem] w-[64rem] -translate-x-1/2 bg-[radial-gradient(closest-side,rgba(78,195,206,0.14),transparent)]"
      />
      <Container className="relative">
        <div className="grid gap-10 lg:grid-cols-[1fr_1fr] lg:items-end lg:gap-16">
          <SectionTitle
            id="resultados-title"
            lead={insights.lead}
            title={insights.title}
            tone="dark"
          />
          <ul className="grid gap-3.5">
            {insights.points.map((point) => (
              <li
                className="flex gap-3.5 text-[16px] leading-snug text-ink-text"
                key={point}
              >
                <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-aqua/15 text-aqua">
                  <Check aria-hidden="true" className="size-4" />
                </span>
                {point}
              </li>
            ))}
          </ul>
        </div>

        <figure className="reveal mt-14">
          <ResumenBoard />
          <figcaption className="mt-4 flex flex-wrap items-center justify-between gap-3 text-[13px] text-ink-soft">
            <ResumenCaption />
            <span className="inline-flex items-center gap-2 text-ink-text">
              <FileDown aria-hidden="true" className="size-4 text-aqua" />
              {insights.leads}
            </span>
          </figcaption>
        </figure>
      </Container>
    </Section>
  );
}

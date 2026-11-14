import { demo } from "@/content/demo";
import { LiveDemo } from "../demo/LiveDemo";
import { Container, Section, SectionTitle } from "../ui";

/** "Cómo funciona", shown instead of told: the panel and a customer's phone. */
export function Demo() {
  return (
    <Section id="demo" labelledBy="demo-title">
      <Container>
        <div className="grid gap-8 lg:grid-cols-[1fr_1fr] lg:items-end lg:gap-16">
          <SectionTitle id="demo-title" lead={demo.lead} title={demo.title} />
          <ol className="grid gap-3">
            {demo.steps.map((step, index) => (
              <li
                className="flex gap-3.5 text-[15px] leading-snug text-muted"
                key={step}
              >
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-ink font-display text-[13px] font-semibold text-white">
                  {index + 1}
                </span>
                <span className="pt-1">{step}</span>
              </li>
            ))}
          </ol>
        </div>
        <div className="mt-12 lg:mt-16">
          <LiveDemo />
        </div>
        <p className="mt-8 text-center text-sm text-soft">{demo.note}</p>
      </Container>
    </Section>
  );
}

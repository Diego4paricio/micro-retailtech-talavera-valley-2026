import {
  Building2,
  History,
  Inbox,
  LifeBuoy,
  PackageCheck,
  PauseCircle,
  ShieldCheck,
  Users,
} from "lucide-react";
import type { ReactNode } from "react";
import { included } from "@/content/landing";
import { Container, Section, SectionTitle } from "../ui";

const icons: Record<(typeof included.items)[number]["id"], ReactNode> = {
  versions: <History aria-hidden="true" className="size-5" />,
  safe: <ShieldCheck aria-hidden="true" className="size-5" />,
  availability: <PackageCheck aria-hidden="true" className="size-5" />,
  team: <Users aria-hidden="true" className="size-5" />,
  orgs: <Building2 aria-hidden="true" className="size-5" />,
  leads: <Inbox aria-hidden="true" className="size-5" />,
  pause: <PauseCircle aria-hidden="true" className="size-5" />,
  help: <LifeBuoy aria-hidden="true" className="size-5" />,
};

export function Included() {
  return (
    <Section labelledBy="incluido-title" tone="paper">
      <Container>
        <SectionTitle id="incluido-title" title={included.title} />
        <ul className="mt-12 grid gap-x-10 gap-y-8 sm:grid-cols-2 lg:grid-cols-4">
          {included.items.map((item) => (
            <li className="flex gap-4" key={item.id}>
              <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-tint text-teal">
                {icons[item.id]}
              </span>
              <div>
                <h3 className="text-lg font-semibold tracking-[-0.02em]">
                  {item.title}
                </h3>
                <p className="mt-1 text-[15px] leading-relaxed text-muted">
                  {item.text}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </Container>
    </Section>
  );
}

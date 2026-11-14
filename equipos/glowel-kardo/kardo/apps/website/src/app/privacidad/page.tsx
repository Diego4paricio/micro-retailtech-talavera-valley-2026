import { LegalPage, legalMetadata } from "@/components/legal/LegalPage";

export const metadata = legalMetadata("privacidad");

export default function Page() {
  return <LegalPage slug="privacidad" />;
}

import { LegalPage, legalMetadata } from "@/components/legal/LegalPage";

export const metadata = legalMetadata("terminos");

export default function Page() {
  return <LegalPage slug="terminos" />;
}

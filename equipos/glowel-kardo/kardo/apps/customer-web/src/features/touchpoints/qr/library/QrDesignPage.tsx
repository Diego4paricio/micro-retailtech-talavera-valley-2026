import { TemplateStudio } from "../studio/TemplateStudio.js";

/** `/qr/designs/:id`: one library design in the Estudio QR editor. */
export function QrDesignPage({ templateId }: { templateId: string }) {
  return <TemplateStudio templateId={templateId} />;
}

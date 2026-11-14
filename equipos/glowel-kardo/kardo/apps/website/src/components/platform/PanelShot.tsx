import { EditorialImage } from "../landing/EditorialImage";

/**
 * A real screen of the panel (panel-<name> in media.json) in a plain frame:
 * a thin border and a soft shadow, no fake browser bar.
 */
export function PanelShot({
  name,
  alt,
  sizes = "(max-width: 1023px) 94vw, 60vw",
  priority = false,
}: {
  name: string;
  alt: string;
  sizes?: string;
  priority?: boolean;
}) {
  return (
    <div className="panel-shot">
      <EditorialImage alt={alt} name={name} priority={priority} sizes={sizes} />
    </div>
  );
}

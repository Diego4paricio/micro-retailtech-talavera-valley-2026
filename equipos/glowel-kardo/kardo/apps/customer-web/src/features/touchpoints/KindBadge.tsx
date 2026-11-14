import { Icon } from "../../components/Icon.js";
import {
  type PhysicalTouchpointKind,
  touchpointKindIcons,
  touchpointKindLabels,
} from "./kind.js";

/** Compact format chip (NFC/QR/Otro), shown next to the status badge. */
export function KindBadge({ kind }: { kind: PhysicalTouchpointKind }) {
  return (
    <span className={`kind-chip kind-chip-${kind}`}>
      <Icon name={touchpointKindIcons[kind]} size={13} />
      {touchpointKindLabels[kind]}
    </span>
  );
}

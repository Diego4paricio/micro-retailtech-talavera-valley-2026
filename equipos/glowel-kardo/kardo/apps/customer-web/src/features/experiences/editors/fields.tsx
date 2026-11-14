import type { Asset } from "@kardo/contracts";
import type { ValidationErrors } from "../content.js";

// The generic fields moved to `components/FormFields.tsx` (domain audit
// A2-34); re-exported so the other features keep importing them from here
// until their owners switch.
export {
  AssetSelect,
  ItemControls,
  type Loose,
  merge,
  moveItem,
  PriceInput,
  photoLabel,
  replaceAt,
  TextInput,
} from "../../../components/FormFields.js";

export type EditorProps<T> = {
  content: T;
  onChange: (content: T) => void;
  errors: ValidationErrors;
  assets: readonly Asset[];
  /** Whether the user may change anything (viewers see a read-only editor). */
  readOnly: boolean;
  /** Bubbles a just-uploaded asset up so every picker sharing `assets` sees it. */
  onAssetUploaded: (asset: Asset) => void;
};

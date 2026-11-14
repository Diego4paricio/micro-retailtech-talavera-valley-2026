import { Segmented } from "../../../components/controls/index.js";

export type SocialsLook = "theme" | "brand";

const options = [
  { value: "theme" as const, label: "Del tema" },
  { value: "brand" as const, label: "Colores de marca" },
];

/**
 * `contentSocials.look`: Kardo's line icons in the page accent ("Del tema",
 * the default when `value` is `undefined`) or each network's official logo
 * and color ("Colores de marca"). Same `Segmented` control as everywhere
 * else in the inspector.
 */
export function SocialsLookField({
  value,
  onChange,
}: {
  value: SocialsLook | undefined;
  onChange: (value: SocialsLook) => void;
}) {
  return (
    <Segmented
      fill
      label="Colores de los íconos"
      onChange={onChange}
      options={options}
      value={value ?? "theme"}
    />
  );
}

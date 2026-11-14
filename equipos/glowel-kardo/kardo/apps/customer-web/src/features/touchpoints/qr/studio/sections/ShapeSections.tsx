import {
  qrEyeBallShapes,
  qrEyeFrameShapes,
  qrModuleShapes,
} from "@kardo/contracts";
import { ShapePicker } from "../controls.js";
import {
  asChoice,
  eyeBallShapeLabels,
  eyeFrameShapeLabels,
  moduleShapeLabels,
} from "../labels.js";
import { useStudio } from "../StudioContext.js";

export function ModulesSection() {
  const { design, change, readOnly } = useStudio();
  return (
    <ShapePicker
      disabled={readOnly}
      hint="Todas las formas se leen bien. Las barras y los rombos son más delicados en tamaños pequeños: verifica la lectura antes de imprimir."
      kind="module"
      label="Forma"
      labels={moduleShapeLabels}
      onChange={(shape) =>
        change((current) => ({
          ...current,
          modules: { ...current.modules, shape },
        }))
      }
      options={qrModuleShapes}
      value={asChoice(qrModuleShapes, design.modules.shape)}
    />
  );
}

export function EyesSection() {
  const { design, change, readOnly, goToSection } = useStudio();
  return (
    <>
      <ShapePicker
        disabled={readOnly}
        kind="eye-frame"
        label="Marco del ojo"
        labels={eyeFrameShapeLabels}
        onChange={(frameShape) =>
          change((current) => ({
            ...current,
            eyes: { ...current.eyes, frameShape },
          }))
        }
        options={qrEyeFrameShapes}
        value={asChoice(qrEyeFrameShapes, design.eyes.frameShape)}
      />
      <ShapePicker
        disabled={readOnly}
        kind="eye-ball"
        label="Centro del ojo"
        labels={eyeBallShapeLabels}
        onChange={(ballShape) =>
          change((current) => ({
            ...current,
            eyes: { ...current.eyes, ballShape },
          }))
        }
        options={qrEyeBallShapes}
        value={asChoice(qrEyeBallShapes, design.eyes.ballShape)}
      />
      <p className="qrs-hint">
        La forma se aplica a los tres ojos para que la cámara los reconozca
        igual. Sus colores se eligen en{" "}
        <button
          className="link-button"
          onClick={() => goToSection("colors")}
          type="button"
        >
          Colores
        </button>
        .
      </p>
    </>
  );
}

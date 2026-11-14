import type { StaffKit } from "@kardo/contracts";
import { pieceModels } from "@kardo/contracts";
import { useState } from "react";
import { piecesApi } from "../../api/pieces.js";
import { Field } from "../../components/Field.js";
import { useToast } from "../../components/Toast.js";
import { useRouter } from "../../lib/router.js";
import { ActionDialog } from "../billing/ActionDialog.js";
import {
  emptyQuantities,
  itemsText,
  kitPlanText,
  type LooseQuantities,
  referenceBounds,
  validateBatch,
} from "./new-batch.js";
import { pieceModelLabels } from "./workshop-file.js";

export function NewPieceBatchDialog({
  kits,
  onClose,
}: {
  kits: readonly StaffKit[];
  onClose: () => void;
}) {
  const { notify } = useToast();
  const { navigate } = useRouter();
  const [kitCode, setKitCode] = useState<string | null>(kits[0]?.code ?? null);
  const [quantities, setQuantities] =
    useState<LooseQuantities>(emptyQuantities);
  const [reference, setReference] = useState("");
  const validation = validateBatch({ kitCode, quantities, reference });

  return (
    <ActionDialog
      confirmLabel="Crear lote"
      description="Cada pieza nace con su dirección permanente y su código. El lote se queda registrado en auditoría."
      extraValid={validation.ok}
      onClose={onClose}
      onSubmit={async (reason) => {
        if (!validation.ok) return;
        const created = await piecesApi.createBatch({
          ...validation.body,
          reason,
        });
        notify("Lote creado.");
        navigate({ name: "piece-batch", id: created.batch.id });
      }}
      open
      title="Nuevo lote de piezas"
    >
      <fieldset className="piece-kit-picker">
        <legend>Pedido</legend>
        <div className="piece-kit-grid">
          {kits.map((kit) => (
            <label
              className={
                kitCode === kit.code
                  ? "piece-kit-card piece-kit-card-selected"
                  : "piece-kit-card"
              }
              key={kit.code}
            >
              <input
                checked={kitCode === kit.code}
                name="piece-kit"
                onChange={() => setKitCode(kit.code)}
                type="radio"
              />
              <strong>{kit.name}</strong>
              <span>{itemsText(kit.items)}</span>
              <span className="piece-kit-plan">{kitPlanText(kit)}</span>
            </label>
          ))}
          <label
            className={
              kitCode === null
                ? "piece-kit-card piece-kit-card-selected"
                : "piece-kit-card"
            }
          >
            <input
              checked={kitCode === null}
              name="piece-kit"
              onChange={() => setKitCode(null)}
              type="radio"
            />
            <strong>Piezas sueltas</strong>
            <span>Tú eliges cuántas de cada una.</span>
          </label>
        </div>
      </fieldset>

      {kitCode === null ? (
        <div className="piece-loose">
          <div className="form-grid-2">
            {pieceModels.map((model) => (
              <Field
                id={`piece-qty-${model}`}
                key={model}
                label={pieceModelLabels[model]}
              >
                <input
                  id={`piece-qty-${model}`}
                  inputMode="numeric"
                  max={100}
                  min={0}
                  onChange={(event) =>
                    setQuantities((current) => ({
                      ...current,
                      [model]: event.target.value,
                    }))
                  }
                  type="number"
                  value={quantities[model]}
                />
              </Field>
            ))}
          </div>
          {!validation.ok && validation.error ? (
            <p className="field-error">{validation.error}</p>
          ) : (
            <p className="field-hint">Entre 1 y 100 piezas en total.</p>
          )}
        </div>
      ) : null}

      <Field
        error={validation.ok ? null : validation.referenceError}
        hint="Nombre del negocio y del pedido, por ejemplo «Café Central, pedido del 13»."
        id="piece-batch-reference"
        label="Para quién"
      >
        <input
          id="piece-batch-reference"
          maxLength={referenceBounds.max + 20}
          onChange={(event) => setReference(event.target.value)}
          type="text"
          value={reference}
        />
      </Field>
    </ActionDialog>
  );
}

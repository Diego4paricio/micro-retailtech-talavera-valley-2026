import { useState } from "react";
import { piecesApi } from "../../api/pieces.js";
import { EmptyState } from "../../components/EmptyState.js";
import { Icon } from "../../components/Icon.js";
import { Notice } from "../../components/Notice.js";
import { PageHeader } from "../../components/PageHeader.js";
import { Skeleton } from "../../components/Skeleton.js";
import { formatDate } from "../../lib/format.js";
import { staffPermissions } from "../../lib/permissions.js";
import { Link } from "../../lib/router.js";
import { useResource } from "../../lib/use-resource.js";
import { useStaff } from "../../shell/StaffContext.js";
import { NewPieceBatchDialog } from "./NewPieceBatchDialog.js";
import { panelOutcomeLabel } from "./workshop-file.js";

export function PieceBatchesPage() {
  const { can } = useStaff();
  const [creating, setCreating] = useState(false);
  const batches = useResource("batches", (signal) =>
    piecesApi.listBatches(signal),
  );
  const kits = useResource("kits", (signal) => piecesApi.listKits(signal));
  const canWrite = can(staffPermissions.piecesWrite);
  const items = batches.data?.items ?? [];

  return (
    <>
      <PageHeader
        actions={
          canWrite ? (
            <button
              className="button button-primary"
              disabled={!kits.data}
              onClick={() => setCreating(true)}
              type="button"
            >
              <Icon name="plus" size={16} />
              Nuevo lote
            </button>
          ) : null
        }
        description="Lotes de piezas de Kardo: cada lote es un pedido. Aquí salen los códigos y el archivo para el taller."
        title="Piezas"
      />
      {batches.error ? (
        <Notice tone="error">{batches.error}</Notice>
      ) : batches.isLoading && !batches.data ? (
        <Skeleton lines={6} />
      ) : items.length === 0 ? (
        <EmptyState icon="pieces" title="Todavía no hay lotes">
          Cuando crees el primero, aparecerá aquí con sus códigos.
        </EmptyState>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">Fecha</th>
                <th scope="col">Para quién</th>
                <th scope="col">Pedido</th>
                <th scope="col">Piezas activadas</th>
                <th scope="col">Organización</th>
                <th scope="col">Panel</th>
              </tr>
            </thead>
            <tbody>
              {items.map((batch) => (
                <tr key={batch.id}>
                  <td>{formatDate(batch.createdAt)}</td>
                  <td>
                    <Link to={{ name: "piece-batch", id: batch.id }}>
                      <strong>{batch.reference}</strong>
                    </Link>
                  </td>
                  <td>{batch.kitName ?? "Piezas sueltas"}</td>
                  <td>
                    {batch.claimed} de {batch.pieces}
                  </td>
                  <td>{batch.workspaceName ?? "Sin activar"}</td>
                  <td>
                    {panelOutcomeLabel(batch.panelOutcome, !!batch.kitCode)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {creating && kits.data ? (
        <NewPieceBatchDialog
          kits={kits.data.items}
          onClose={() => setCreating(false)}
        />
      ) : null}
    </>
  );
}

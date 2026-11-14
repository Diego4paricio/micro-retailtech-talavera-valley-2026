import { leadRetentionOptions } from "@kardo/contracts";
import { useState } from "react";
import { leadRetentionApi } from "../../api/lead-retention.js";
import { Field } from "../../components/Field.js";
import { Notice } from "../../components/Notice.js";
import { SectionHeading } from "../../components/PageHeader.js";
import { Skeleton } from "../../components/Skeleton.js";
import { useToast } from "../../components/Toast.js";
import { errorMessage } from "../../lib/api.js";
import { useResource } from "../../lib/use-resource.js";
import { useWorkspace } from "../../workspace/WorkspaceContext.js";
import { leadRetentionLabel } from "./labels.js";

const keepForever = "forever";

/** Older leads are purged automatically every day; `null` keeps them forever. */
export function LeadRetentionSection() {
  const { workspace } = useWorkspace();
  const { notify } = useToast();
  const retention = useResource(`lead-retention:${workspace.id}`, (signal) =>
    leadRetentionApi.get(workspace.id, signal),
  );
  const [isSaving, setIsSaving] = useState(false);

  async function save(value: string) {
    const days =
      value === keepForever
        ? null
        : (Number(value) as (typeof leadRetentionOptions)[number]);
    setIsSaving(true);
    try {
      const updated = await leadRetentionApi.update(workspace.id, { days });
      retention.setData(updated);
      notify(
        days === null
          ? "Las solicitudes se conservarán indefinidamente."
          : `Las solicitudes se conservarán ${leadRetentionLabel(days)}.`,
      );
    } catch (requestError) {
      notify(errorMessage(requestError), "error");
    } finally {
      setIsSaving(false);
    }
  }

  if (retention.isLoading && !retention.data) return <Skeleton lines={2} />;
  if (retention.error)
    return (
      <Notice
        action={
          <button
            className="text-action"
            onClick={() => void retention.reload()}
            type="button"
          >
            Reintentar
          </button>
        }
        tone="danger"
      >
        {retention.error}
      </Notice>
    );

  const value =
    retention.data?.days === null || retention.data?.days === undefined
      ? keepForever
      : String(retention.data.days);

  return (
    <section
      aria-labelledby="lead-retention-heading"
      className="panel kd-delivery"
    >
      <SectionHeading
        description="Las solicitudes más antiguas que este límite se eliminan automáticamente todos los días. Elige «Conservar indefinidamente» para no borrar ninguna."
        id="lead-retention-heading"
        title="Retención de solicitudes"
      />
      <Field id="lead-retention-select" label="Conservar solicitudes por">
        <select
          disabled={isSaving}
          id="lead-retention-select"
          onChange={(event) => void save(event.target.value)}
          value={value}
        >
          {leadRetentionOptions.map((days) => (
            <option key={days} value={days}>
              {leadRetentionLabel(days)}
            </option>
          ))}
          <option value={keepForever}>{leadRetentionLabel(null)}</option>
        </select>
      </Field>
    </section>
  );
}

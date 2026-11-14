import {
  type StatusProviderDetail,
  statusComponentLabels,
} from "@kardo/contracts";
import { StatusBadge } from "../../components/StatusBadge.js";
import { formatDateTime } from "../../lib/format.js";
import { levelLabels, providerLabels } from "./format.js";

export function ProvidersPanel({
  providers,
}: {
  providers: readonly StatusProviderDetail[];
}) {
  return (
    <ul className="st-providers">
      {providers.map((provider) => (
        <li className="st-provider" key={provider.provider}>
          <div className="st-provider-head">
            <strong>
              {providerLabels[provider.provider] ?? provider.provider}
            </strong>
            <StatusBadge tone={provider.ok ? "success" : "danger"}>
              {provider.ok ? "Bien" : "Con error"}
            </StatusBadge>
          </div>
          <p className="st-provider-meta">
            Revisado: {formatDateTime(provider.checkedAt)}
          </p>
          {provider.error ? (
            <p className="field-error">{provider.error}</p>
          ) : null}
          {provider.issues.length > 0 ? (
            <ul className="st-issues">
              {provider.issues.map((issue) => (
                <li key={issue.name}>
                  <span>{issue.name}</span>
                  <small>
                    {levelLabels[issue.level]}
                    {issue.components.length > 0
                      ? ` · ${issue.components
                          .map((id) => statusComponentLabels[id])
                          .join(", ")}`
                      : ""}
                  </small>
                </li>
              ))}
            </ul>
          ) : provider.ok ? (
            <p className="st-provider-meta">Sin problemas en lo que usamos.</p>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

import type { DashboardLayout, DashboardLayoutState } from "@kardo/contracts";
import type { Sql } from "postgres";
import { WorkspaceAccessError } from "../errors.js";
import {
  type CustomerIdentity,
  requireMembershipWithPermission,
  withCustomerContext,
} from "./context.js";

/** Each member's own Resumen layout for one workspace. */
export type DashboardRepository = {
  getLayout(
    identity: CustomerIdentity,
    workspaceId: string,
  ): Promise<DashboardLayoutState>;
  saveLayout(
    identity: CustomerIdentity,
    workspaceId: string,
    layout: DashboardLayout,
  ): Promise<DashboardLayoutState>;
  resetLayout(identity: CustomerIdentity, workspaceId: string): Promise<void>;
};

export class DashboardRepositoryError extends Error {}

export function unavailableDashboardRepository(): DashboardRepository {
  const unavailable = () =>
    Promise.reject(
      new DashboardRepositoryError("Dashboard storage is not configured."),
    );
  return {
    getLayout: unavailable,
    saveLayout: unavailable,
    resetLayout: unavailable,
  };
}

type LayoutRow = { layout: DashboardLayout; updated_at: string | Date };

function toState(row: LayoutRow | undefined): DashboardLayoutState {
  if (!row) return { layout: null, updatedAt: null };
  return {
    layout: row.layout,
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

/**
 * Widgets may overlap or leave gaps in what a client sends; the panel
 * compacts them on load. What the server guarantees is that ids are unique
 * and every widget fits inside the grid.
 */
export function sanitizeDashboardLayout(
  layout: DashboardLayout,
  columns: number,
): DashboardLayout {
  const seen = new Set<string>();
  const widgets = layout.widgets
    .filter((widget) => {
      if (seen.has(widget.id)) return false;
      seen.add(widget.id);
      return true;
    })
    .map((widget) => {
      const w = Math.min(widget.w, columns);
      return { ...widget, w, x: Math.min(widget.x, columns - w) };
    });
  return { version: 1, widgets };
}

export function createPostgresDashboardRepository(
  sql: Sql,
  columns: number,
): DashboardRepository {
  return {
    async getLayout(identity, workspaceId) {
      const rows = await withCustomerContext(sql, identity, async (tx) => {
        await requireMembershipWithPermission(
          tx,
          identity,
          workspaceId,
          "analytics.read",
        );
        return tx<LayoutRow[]>`
          select layout, updated_at
          from kardo_core.dashboard_layouts
          where workspace_id = ${workspaceId}::uuid
            and profile_id = ${identity.subject}::uuid
        `;
      });
      return toState(rows[0]);
    },

    async saveLayout(identity, workspaceId, layout) {
      const clean = sanitizeDashboardLayout(layout, columns);
      const rows = await withCustomerContext(sql, identity, async (tx) => {
        await requireMembershipWithPermission(
          tx,
          identity,
          workspaceId,
          "analytics.read",
        );
        return tx<LayoutRow[]>`
          insert into kardo_core.dashboard_layouts (workspace_id, profile_id, layout)
          values (
            ${workspaceId}::uuid,
            ${identity.subject}::uuid,
            ${tx.json(clean as unknown as Parameters<Sql["json"]>[0])}
          )
          on conflict (workspace_id, profile_id)
          do update set layout = excluded.layout, updated_at = now()
          returning layout, updated_at
        `;
      });
      const row = rows[0];
      if (!row) throw new WorkspaceAccessError();
      return toState(row);
    },

    async resetLayout(identity, workspaceId) {
      await withCustomerContext(sql, identity, async (tx) => {
        await requireMembershipWithPermission(
          tx,
          identity,
          workspaceId,
          "analytics.read",
        );
        await tx`
          delete from kardo_core.dashboard_layouts
          where workspace_id = ${workspaceId}::uuid
            and profile_id = ${identity.subject}::uuid
        `;
      });
    },
  };
}

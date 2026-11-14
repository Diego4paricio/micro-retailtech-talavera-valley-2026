import type { StaffMemberList } from "@kardo/contracts";
import { staffPermissions } from "@kardo/contracts";
import type { Sql } from "postgres";
import { requireStaffPermission, withStaffContext } from "../http/context.js";
import { StaffRepositoryError } from "../http/errors.js";

export type StaffMemberRepository = {
  listStaffMembers(subject: string): Promise<StaffMemberList>;
};

export function unavailableStaffMemberRepository(): StaffMemberRepository {
  return {
    listStaffMembers: async () => Promise.reject(new StaffRepositoryError()),
  };
}

type StaffMemberRow = {
  id: string;
  email: string | null;
  display_name: string | null;
  status: string;
  roles: string[] | null;
  created_at: string;
};

export function createPostgresStaffMemberRepository(
  sql: Sql,
): StaffMemberRepository {
  return {
    async listStaffMembers(subject) {
      const rows = await withStaffContext(sql, subject, async (tx) => {
        await requireStaffPermission(tx, subject, staffPermissions.staffManage);
        return tx<StaffMemberRow[]>`
          select sp.id, prof.email, sp.display_name, sp.status::text as status, sp.created_at,
            coalesce(
              array_agg(role.code) filter (where role.code is not null),
              '{}'
            ) as roles
          from kardo_staff.staff_profiles sp
          left join kardo_core.profiles prof on prof.id = sp.id
          left join kardo_staff.role_assignments ra on ra.staff_id = sp.id
          left join kardo_staff.roles role on role.id = ra.role_id
          group by sp.id, prof.email, sp.display_name, sp.status, sp.created_at
          order by sp.created_at asc
          limit 200
        `;
      });
      return rows.map((row) => ({
        id: row.id,
        email: row.email,
        displayName: row.display_name,
        status: row.status as StaffMemberList[number]["status"],
        roles: row.roles ?? [],
        createdAt: new Date(row.created_at).toISOString(),
      }));
    },
  };
}

import type { StaffSession } from "@kardo/contracts";
import type { Session } from "@supabase/supabase-js";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
} from "react";
import { hasPermission, type StaffPermission } from "../lib/permissions.js";
import { supabase } from "../supabase.js";

type StaffContextValue = {
  session: Session;
  staff: StaffSession;
  can: (permission: StaffPermission) => boolean;
  signOut: () => Promise<void>;
};

const StaffContext = createContext<StaffContextValue | null>(null);

export function StaffProvider({
  session,
  staff,
  children,
}: {
  session: Session;
  staff: StaffSession;
  children: ReactNode;
}) {
  const can = useCallback(
    (permission: StaffPermission) =>
      hasPermission(staff.permissions, permission),
    [staff.permissions],
  );
  const signOut = useCallback(async () => {
    await supabase?.auth.signOut();
  }, []);

  const value = useMemo(
    () => ({ session, staff, can, signOut }),
    [session, staff, can, signOut],
  );
  return (
    <StaffContext.Provider value={value}>{children}</StaffContext.Provider>
  );
}

export function useStaff(): StaffContextValue {
  const value = useContext(StaffContext);
  if (!value) throw new Error("useStaff must be used inside StaffProvider.");
  return value;
}

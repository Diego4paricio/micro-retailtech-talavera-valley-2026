import { useEffect } from "react";
import { exitDurations } from "../components/motion.js";
import { NativeDialog } from "../components/NativeDialog.js";
import { SidebarContent } from "./Sidebar.js";

/**
 * Small-screen navigation: the same sidebar, as a modal drawer from the left
 * (focus trap, Escape and inert page come from the native <dialog>).
 */
export function MobileNav({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  // Growing past the breakpoint with the drawer open simply closes it.
  useEffect(() => {
    if (!open || !window.matchMedia) return;
    const query = window.matchMedia("(min-width: 901px)");
    const onChange = () => {
      if (query.matches) onClose();
    };
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, [open, onClose]);

  return (
    <NativeDialog
      aria-label="Menú"
      className="mobile-nav"
      exitMs={exitDurations.slow}
      onClose={onClose}
      open={open}
    >
      <div className="sidebar sidebar-drawer">
        <SidebarContent onClose={onClose} />
      </div>
    </NativeDialog>
  );
}

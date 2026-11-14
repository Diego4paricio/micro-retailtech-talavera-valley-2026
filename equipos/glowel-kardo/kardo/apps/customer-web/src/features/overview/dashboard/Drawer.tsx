import { type ReactNode, type Ref, useId, useRef } from "react";
import { Icon } from "../../../components/Icon.js";
import { exitDurations } from "../../../components/motion.js";
import { NativeDialog } from "../../../components/NativeDialog.js";

type DrawerContent = {
  title: string;
  description: ReactNode;
  children: ReactNode;
  footer: ReactNode;
};

/**
 * Side panel on a native modal <dialog>: the browser traps focus, handles
 * Escape and makes the page inert. It slides in from the right and keeps
 * its last content while it slides out.
 */
export function Drawer({
  open,
  title,
  description,
  onClose,
  children,
  footer,
  size = "medium",
  scrim = "default",
  titleRef,
}: {
  open: boolean;
  title: string;
  description?: ReactNode | undefined;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode | undefined;
  /** `wide` fits a gallery of previews. */
  size?: "medium" | "wide" | undefined;
  /** `light` keeps the board readable behind the panel (live edits). */
  scrim?: "default" | "light" | undefined;
  /** The heading, focusable from script: a panel that changes step moves
   * focus there so the new step is announced. */
  titleRef?: Ref<HTMLHeadingElement> | undefined;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const snapshot = useRef<DrawerContent | null>(null);
  if (open) snapshot.current = { title, description, children, footer };
  const content = snapshot.current;

  return (
    <NativeDialog
      aria-describedby={content?.description ? descriptionId : undefined}
      aria-labelledby={titleId}
      className={`db-drawer db-drawer-${size}`}
      data-scrim={scrim}
      exitMs={exitDurations.slow}
      onClose={onClose}
      open={open}
    >
      {content ? (
        <div className="db-drawer-panel">
          <header className="db-drawer-header">
            <div className="db-drawer-heading">
              <h2 id={titleId} ref={titleRef} tabIndex={-1}>
                {content.title}
              </h2>
              {content.description ? (
                <p id={descriptionId}>{content.description}</p>
              ) : null}
            </div>
            <button
              aria-label="Cerrar"
              className="icon-button"
              onClick={onClose}
              type="button"
            >
              <Icon name="close" />
            </button>
          </header>
          <div className="db-drawer-body">{content.children}</div>
          {content.footer ? (
            <footer className="db-drawer-footer">{content.footer}</footer>
          ) : null}
        </div>
      ) : null}
    </NativeDialog>
  );
}

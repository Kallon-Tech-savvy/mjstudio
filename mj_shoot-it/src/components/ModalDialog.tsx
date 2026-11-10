import { type ReactNode, useEffect, useRef } from "react";

/** Native modal behaviour with an explicit keyboard loop and opener restoration. */
export function ModalDialog({
  children,
  className,
  label,
  closeDisabled = false,
  onRequestClose,
}: {
  children: ReactNode;
  className: string;
  label: string;
  closeDisabled?: boolean;
  onRequestClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    const opener =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    dialog?.showModal();
    return () => {
      dialog?.close();
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className={className}
      aria-label={label}
      onCancel={(event) => {
        event.preventDefault();
        if (!closeDisabled) onRequestClose();
      }}
      onKeyDown={(event) => {
        if (event.key !== "Tab") return;
        const items = Array.from(
          event.currentTarget.querySelectorAll<HTMLElement>(
            'button:not(:disabled):not([tabindex="-1"]), a[href], input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [tabindex="0"]',
          ),
        ).filter((item) => item.getClientRects().length > 0);
        const first = items[0];
        const last = items.at(-1);
        if (!first || !last) {
          event.preventDefault();
          event.currentTarget.focus();
          return;
        }
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }}
    >
      {children}
    </dialog>
  );
}

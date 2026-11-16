import { useEffect, useRef } from "react";

export function KeywordSaveDialog({
  count,
  isSaving,
  error,
  onClose,
  onSave,
}: {
  count: number;
  isSaving: boolean;
  error: string | null;
  onClose: () => void;
  onSave: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    const trigger = document.activeElement;
    element.showModal();
    return () => {
      element.close();
      if (trigger instanceof HTMLElement && trigger.isConnected)
        trigger.focus({ preventScroll: true });
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      aria-labelledby="save-keywords-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!isSaving) onClose();
      }}
      onClick={(event) => {
        if (!isSaving && event.target === event.currentTarget) onClose();
      }}
      className="fixed inset-0 m-0 h-dvh max-h-none w-screen max-w-none border-0 bg-transparent p-4 text-base-content backdrop:bg-black/50 open:flex open:items-center open:justify-center"
    >
      <div className="card bg-base-100 border border-base-300 w-full max-w-md max-h-full shadow-xl">
        <div className="card-body gap-4 overflow-y-auto">
          <h3 id="save-keywords-title" className="text-lg font-semibold">
            Save {count} keyword{count === 1 ? "" : "s"}?
          </h3>
          <p className="text-sm text-base-content/70">
            Add to this project's saved keywords.
          </p>
          {error && (
            <p className="text-sm text-error" role="alert">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2" aria-busy={isSaving}>
            <button
              type="button"
              className="btn"
              disabled={isSaving}
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={isSaving}
              onClick={onSave}
            >
              {isSaving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </div>
    </dialog>
  );
}

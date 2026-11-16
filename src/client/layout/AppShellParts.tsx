import { useEffect, useRef } from "react";
import { Link } from "@tanstack/react-router";
import { CircleHelp, Plug } from "lucide-react";
import { Sidebar } from "@/client/components/Sidebar";
import { dataforseoHelpLinkOptions } from "@/client/navigation/items";

export function SeoApiStatusBanners({
  shouldShowSeoApiWarning,
  seoApiKeyStatusError,
}: {
  shouldShowSeoApiWarning: boolean;
  seoApiKeyStatusError: boolean;
}) {
  if (!shouldShowSeoApiWarning && !seoApiKeyStatusError) return null;
  return (
    <div className="workspace-provider-status">
      {seoApiKeyStatusError ? (
        <CircleHelp aria-hidden="true" />
      ) : (
        <Plug aria-hidden="true" />
      )}
      <span>
        {seoApiKeyStatusError
          ? "DataForSEO setup could not be checked."
          : "DataForSEO is not connected."}
      </span>
      <Link {...dataforseoHelpLinkOptions}>Setup guide</Link>
    </div>
  );
}

export function MobileSidebarDrawer({
  opener,
  projectId,
  onClose,
}: {
  opener: HTMLButtonElement | null;
  projectId: string | null;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog || !opener) return;
    dialog.showModal();
    const desktop = window.matchMedia("(min-width: 48rem)");
    function resize() {
      if (desktop.matches) closeRef.current();
    }
    desktop.addEventListener("change", resize);
    return () => {
      desktop.removeEventListener("change", resize);
      dialog.close();
      if (opener.isConnected) opener.focus({ preventScroll: true });
    };
  }, [opener]);
  if (!opener) return null;
  return (
    <dialog
      ref={ref}
      id="workspace-navigation"
      aria-label="Workspace navigation"
      className="workspace-drawer"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (
          event.target === event.currentTarget &&
          event.clientX >= event.currentTarget.getBoundingClientRect().right
        )
          onClose();
      }}
    >
      <Sidebar projectId={projectId} onNavigate={onClose} onClose={onClose} />
    </dialog>
  );
}

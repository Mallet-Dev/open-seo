import * as React from "react";
import { Link, useLocation } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Menu } from "lucide-react";
import {
  MobileSidebarDrawer,
  SeoApiStatusBanners,
} from "@/client/layout/AppShellParts";
import { GscReEngagementModal } from "@/client/features/gsc/GscReEngagementModal";
import { Sidebar } from "@/client/components/Sidebar";
import { BILLING_ROUTE } from "@/shared/billing";
import { getSeoApiKeyStatus } from "@/serverFunctions/config";
import { getProjects } from "@/serverFunctions/projects";
import { getLastProjectId } from "@/client/lib/active-project";

const DATAFORSEO_HELP_PATH = "/help/dataforseo-api-key";

export function AuthenticatedAppLayout({
  children,
  projectId,
  banner,
}: {
  children: React.ReactNode;
  projectId?: string;
  banner?: React.ReactNode;
}) {
  const location = useLocation();
  const [drawerOpener, setDrawerOpener] =
    React.useState<HTMLButtonElement | null>(null);
  const drawerOpen = drawerOpener !== null;
  // On non-project pages (e.g. /settings) there's no projectId in the URL, so
  // derive one for the nav/switcher: prefer the last-visited project, else the
  // most recent. The whole app tree is client-only (see root ClientOnly), so we
  // can read localStorage synchronously during the first render — this lets the
  // sidebar show the full project nav on the very first paint instead of briefly
  // flashing only the always-visible Connect group while projects load.
  const projectsQuery = useQuery({
    queryKey: ["projects"],
    queryFn: () => getProjects(),
    enabled: !projectId,
  });
  const [rememberedProjectId] = React.useState<string | null>(() =>
    getLastProjectId(),
  );
  const fallbackProjects = projectsQuery.data ?? [];
  const fallbackProjectId =
    fallbackProjects.find((project) => project.id === rememberedProjectId)
      ?.id ??
    fallbackProjects[0]?.id ??
    null;
  // Once the projects list loads, fallbackProjectId is the validated choice
  // (remembered-if-valid, else most recent). Before it loads, fall back to the
  // remembered id so the project nav renders immediately; a stale id here only
  // builds links that self-correct via the route guard once data arrives.
  const sidebarProjectId =
    projectId ?? fallbackProjectId ?? rememberedProjectId;
  const shouldCheckSeoApiKeyStatus = location.pathname !== BILLING_ROUTE;
  const seoApiKeyStatusQuery = useQuery({
    queryKey: ["seoApiKeyStatus"],
    queryFn: () => getSeoApiKeyStatus(),
    enabled: shouldCheckSeoApiKeyStatus,
  });
  const isSeoApiKeyConfigured = shouldCheckSeoApiKeyStatus
    ? (seoApiKeyStatusQuery.data?.configured ?? null)
    : null;
  const seoApiKeyStatusError =
    shouldCheckSeoApiKeyStatus && seoApiKeyStatusQuery.isError;

  const shouldShowSeoApiWarning =
    isSeoApiKeyConfigured === false &&
    location.pathname !== DATAFORSEO_HELP_PATH;

  return (
    <div className="flex h-[100dvh] bg-base-200">
      <a
        href="#workspace-content"
        className="workspace-skip-link"
        onClick={(event) => {
          event.preventDefault();
          document.getElementById("workspace-content")?.focus();
        }}
      >
        Skip to content
      </a>
      <div className="hidden shrink-0 md:block">
        <Sidebar projectId={sidebarProjectId} />
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <MobileTopBar drawerOpen={drawerOpen} onOpenDrawer={setDrawerOpener} />

        <div className="flex min-h-0 flex-1 flex-col md:pt-2">
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-base-100 md:rounded-tl-lg md:border-l md:border-t md:border-base-300">
            <SeoApiStatusBanners
              shouldShowSeoApiWarning={shouldShowSeoApiWarning}
              seoApiKeyStatusError={seoApiKeyStatusError}
            />

            {banner}

            <div
              id="workspace-content"
              tabIndex={-1}
              className="min-h-0 flex-1 overflow-auto"
            >
              {children}
            </div>
          </div>
        </div>
      </div>

      <MobileSidebarDrawer
        opener={drawerOpener}
        projectId={sidebarProjectId}
        onClose={() => setDrawerOpener(null)}
      />

      <GscReEngagementModal
        projectId={sidebarProjectId}
        suppressed={drawerOpen}
      />
    </div>
  );
}

function MobileTopBar({
  drawerOpen,
  onOpenDrawer,
}: {
  drawerOpen: boolean;
  onOpenDrawer: (button: HTMLButtonElement) => void;
}) {
  return (
    <div className="flex shrink-0 items-center gap-1 border-b border-base-300 bg-base-100 px-2 py-1.5 md:hidden">
      <button
        type="button"
        className="btn btn-square btn-ghost btn-sm"
        aria-label="Open navigation"
        aria-controls="workspace-navigation"
        aria-expanded={drawerOpen}
        onClick={(event) => onOpenDrawer(event.currentTarget)}
      >
        <Menu className="h-5 w-5" />
      </button>
      <Link
        to="/"
        className="workspace-wordmark ml-1 font-semibold text-base-content"
      >
        <span className="workspace-brand-mark" aria-hidden="true">
          <span />
          <span />
          <span />
          <span />
        </span>
        OpenSEO
      </Link>
    </div>
  );
}

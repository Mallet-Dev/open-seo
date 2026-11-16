import { analysisContextSchema } from "@/client/features/search-intelligence/analysisContext";
import { createFileRoute } from "@tanstack/react-router";
import workspaceStyles from "@/client/components/SearchWorkspace.css?url";
import analysisStyles from "@/client/features/search-intelligence/AnalysisWorkspace.css?url";
import { AnalysisPage } from "@/client/features/search-intelligence/AnalysisPage";
export const Route = createFileRoute("/_project/p/$projectId/performance")({
  validateSearch: analysisContextSchema,
  component: PerformanceRoute,
  head: () => ({
    links: [
      { rel: "stylesheet", href: workspaceStyles },
      { rel: "stylesheet", href: analysisStyles },
    ],
  }),
});
function PerformanceRoute() {
  const { projectId } = Route.useParams();
  const { page, startDate, endDate } = Route.useSearch();
  return (
    <AnalysisPage
      key={`${projectId}:${page ?? "all"}:${startDate ?? "default"}:${endDate ?? "default"}`}
      projectId={projectId}
      pageFocus={page}
      initialStartDate={startDate}
      initialEndDate={endDate}
    />
  );
}

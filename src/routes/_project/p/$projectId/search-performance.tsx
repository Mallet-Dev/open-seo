import workspaceStyles from "@/client/components/SearchWorkspace.css?url";
import retainedStyles from "@/client/features/search-performance/RetainedSearchPerformance.css?url";
import { createFileRoute } from "@tanstack/react-router";
import { SearchPerformancePage } from "@/client/features/search-performance/SearchPerformancePage";

export const Route = createFileRoute(
  "/_project/p/$projectId/search-performance",
)({
  component: SearchPerformanceRoute,
  head: () => ({
    links: [
      { rel: "stylesheet", href: workspaceStyles },
      { rel: "stylesheet", href: retainedStyles },
    ],
  }),
});

function SearchPerformanceRoute() {
  const { projectId } = Route.useParams();
  return <SearchPerformancePage projectId={projectId} />;
}

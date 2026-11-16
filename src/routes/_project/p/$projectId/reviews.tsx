import { createFileRoute } from "@tanstack/react-router";
import workspaceStyles from "@/client/components/SearchWorkspace.css?url";
import reviewsStyles from "@/client/features/local-business/LocalReviews.css?url";
import { LocalReviewsPage } from "@/client/features/local-business/LocalReviewsPage";
export const Route = createFileRoute("/_project/p/$projectId/reviews")({
  component: ReviewsRoute,
  head: () => ({
    links: [
      { rel: "stylesheet", href: workspaceStyles },
      { rel: "stylesheet", href: reviewsStyles },
    ],
  }),
});
function ReviewsRoute() {
  const { projectId } = Route.useParams();
  return <LocalReviewsPage key={projectId} projectId={projectId} />;
}

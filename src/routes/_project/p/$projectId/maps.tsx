import leafletStyles from "leaflet/dist/leaflet.css?url";
import { createFileRoute } from "@tanstack/react-router";
import mapsStyles from "@/client/components/SearchWorkspace.css?url";
import { mapsSelectionSchema } from "@/client/features/local-maps/mapsSelection";
import { MapsPage } from "@/client/features/local-maps/MapsPage";
export const Route = createFileRoute("/_project/p/$projectId/maps")({
  validateSearch: mapsSelectionSchema,
  component: MapsRoute,
  head: () => ({
    links: [
      { rel: "stylesheet", href: mapsStyles },
      { rel: "stylesheet", href: leafletStyles },
    ],
  }),
});
function MapsRoute() {
  const { projectId } = Route.useParams();
  return <MapsPage key={projectId} projectId={projectId} />;
}

import { mapsRunSchema, type MapsRun } from "@/shared/local-maps";

// Synthetic coordinates and businesses are confined to the labelled example.
export function mapsFixture(id: string, previous = false): MapsRun {
  const points = Array.from({ length: 25 }, (_, index) => ({
    row: Math.floor(index / 5),
    col: index % 5,
    latitude: 43.72 - Math.floor(index / 5) * 0.009,
    longitude: -79.43 + (index % 5) * 0.012,
  }));
  return mapsRunSchema.parse({
    id,
    provenance: "invented",
    spec: {
      query: "tile installation",
      languageCode: "en",
      source: "invented-example",
      searchType: "google-maps",
      device: "mobile",
      depth: 20,
      zoom: 12,
      rankBasis: "absolute",
      points,
    },
    points: points.map((coordinate, index) => {
      if (index === 4)
        return { status: "failed", message: "Example provider timeout" };
      if (index === 20)
        return {
          status: "excluded",
          reason: "Outside the example service area",
        };
      if (index === 24) return { status: "unobserved" };
      const distance =
        Math.abs(coordinate.row - 2) + Math.abs(coordinate.col - 2);
      const targetRank = 1 + distance * 2 + (previous ? 2 : 0);
      return {
        status: "success",
        observedAt: previous ? "2026-11-08T14:00:00Z" : "2026-11-15T14:00:00Z",
        coverage: "sparse",
        results: [
          {
            title: "Northline Tile",
            cid: "example-northline",
            placeId: null,
            rank: targetRank,
          },
          {
            title: "Atlas Surfaces",
            cid: "example-atlas",
            placeId: null,
            rank: targetRank === 2 ? 3 : 2,
          },
          ...(distance > 2
            ? []
            : [
                {
                  title: "Fieldwork Ceramics",
                  cid: "example-fieldwork",
                  placeId: null,
                  rank: targetRank === 4 ? 5 : 4,
                },
              ]),
        ],
      };
    }),
  });
}

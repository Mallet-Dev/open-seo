import { useEffect, useRef, useState } from "react";
import type * as Leaflet from "leaflet";
import type { Map as LeafletMap, Marker } from "leaflet";
import type { MapsBusiness, MapsRun } from "@/shared/local-maps";
import { mapsPointRank } from "@/shared/local-maps";
import { pointLabel } from "./mapsPointLabel";
import { pointTone } from "./mapsPointTone";

export function MapsStreetMap({
  run,
  coordinates,
  view,
  active,
  onSelect,
  onMove,
}: {
  run: MapsRun;
  coordinates: [number, number][];
  view: MapsBusiness;
  active: number;
  onSelect: (index: number) => void;
  onMove: (index: number, key: string) => number;
}) {
  const container = useRef<HTMLDivElement>(null);
  const markers = useRef<Marker[]>([]);
  const callbacks = useRef({ onSelect, onMove });
  const [runtime, setRuntime] = useState<{
    map: LeafletMap;
    L: typeof Leaflet;
  } | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    callbacks.current = { onSelect, onMove };
  }, [onSelect, onMove]);
  useEffect(() => {
    let cancelled = false;
    let instance: LeafletMap | undefined;
    let observer: ResizeObserver | undefined;
    void import("leaflet")
      .then((L) => {
        if (cancelled || !container.current) return;
        instance = L.map(container.current, {
          scrollWheelZoom: false,
          zoomAnimation: false,
          fadeAnimation: false,
          markerZoomAnimation: false,
          inertia: false,
        });
        L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19,
          crossOrigin: "anonymous",
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        })
          .on("tileerror", () => {
            if (!cancelled)
              setError(
                "Some map tiles could not load. Saved point evidence is still available.",
              );
          })
          .addTo(instance);
        observer = new ResizeObserver(() =>
          instance?.invalidateSize({ pan: false }),
        );
        observer.observe(container.current);
        setRuntime({ map: instance, L });
      })
      .catch(() => {
        if (!cancelled)
          setError(
            "The street map could not load. Use the grid to explore saved evidence.",
          );
      });
    return () => {
      cancelled = true;
      observer?.disconnect();
      instance?.remove();
    };
  }, []);
  const lastFit = useRef("");
  useEffect(() => {
    if (!runtime) return;
    const key = JSON.stringify(coordinates);
    if (lastFit.current === key) return;
    lastFit.current = key;
    runtime.map.fitBounds(runtime.L.latLngBounds(coordinates), {
      padding: [28, 28],
      maxZoom: 19,
      animate: false,
    });
  }, [runtime, coordinates]);
  useEffect(() => {
    if (!runtime) return;
    const { map, L } = runtime;
    markers.current = coordinates.map((coordinate, index) => {
      const status = run.points[index].status;
      const label =
        mapsPointRank(run.points[index], view) ??
        (status === "failed" ? "×" : "−");
      const marker = L.marker(coordinate, {
        icon: L.divIcon({
          className: `maps-street-point maps-point-${pointTone(run, index, view)}`,
          html: String(label),
          iconSize: [38, 38],
          iconAnchor: [19, 19],
        }),
        keyboard: true,
        autoPanOnFocus: false,
      })
        .on("click", () => callbacks.current.onSelect(index))
        .addTo(map);
      const element = marker.getElement();
      if (element) {
        const point = run.spec.points[index];
        element.setAttribute(
          "aria-label",
          `Point ${point.row + 1}, ${point.col + 1}: ${pointLabel(run, index, view)}`,
        );
        element.dataset.pointIndex = String(index);
      }
      return marker;
    });
    return () => {
      markers.current.forEach((marker) => marker.remove());
      markers.current = [];
    };
  }, [runtime, coordinates, run, view]);
  useEffect(() => {
    markers.current.forEach((marker, index) => {
      const element = marker.getElement();
      element?.classList.toggle("is-selected", active === index);
      element?.setAttribute("aria-pressed", String(active === index));
      if (element) element.tabIndex = active === index ? 0 : -1;
      marker.setZIndexOffset(active === index ? 1000 : 0);
    });
  }, [active, runtime, coordinates, run, view]);
  return (
    <div className="maps-street-wrap">
      <div
        ref={container}
        className="maps-street"
        role="group"
        aria-label="Street map. Zoom changes the view, not the saved scan. Use arrow keys on a point to explore."
        onKeyDownCapture={(event) => {
          if (!(event.target instanceof HTMLElement)) return;
          const index = event.target.dataset.pointIndex;
          if (index === undefined) return;
          if (event.key === " ") {
            event.preventDefault();
            callbacks.current.onSelect(Number(index));
          } else if (
            ["ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight"].includes(
              event.key,
            )
          ) {
            event.preventDefault();
            event.stopPropagation();
            const next = callbacks.current.onMove(Number(index), event.key);
            markers.current[next]?.getElement()?.focus();
          }
        }}
      />
      {error && (
        <p className="maps-tile-error" role="status">
          {error}
        </p>
      )}
    </div>
  );
}

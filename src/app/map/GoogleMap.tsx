"use client";
/// <reference types="google.maps" />

// Google Maps renderer. Pins, the heat layer, and the popup are our own DOM,
// drawn into Google's overlay panes, so they look identical to the fallback map
// and stay real, focusable buttons. No Map ID is needed.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { APIProvider, ControlPosition, Map, useMap, useMapsLibrary } from "@vis.gl/react-google-maps";
import { X } from "lucide-react";
import type { MapPoint } from "./MapClient";
import { Pin, PinPopup, heatWeight, initialView, paintHeat, pinLabel } from "./mapShared";

/**
 * The map shows satellite imagery with street and place labels on top
 * (mapTypeId "hybrid"). These styles only affect the labels there: they hide
 * business and transit clutter. The colour rules apply if the map type is ever
 * switched back to "roadmap".
 */
const MAP_STYLE: google.maps.MapTypeStyle[] = [
  { featureType: "poi", elementType: "labels", stylers: [{ visibility: "off" }] },
  { featureType: "poi.school", elementType: "labels.text", stylers: [{ visibility: "on" }] },
  { featureType: "poi.school", elementType: "labels.icon", stylers: [{ visibility: "off" }] },
  { featureType: "poi.business", stylers: [{ visibility: "off" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
  { featureType: "road", elementType: "labels.icon", stylers: [{ visibility: "off" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#e6e9ee" }] },
  { featureType: "road.highway", elementType: "geometry.stroke", stylers: [{ color: "#d2d7df" }] },
  { featureType: "road.arterial", elementType: "geometry", stylers: [{ color: "#ffffff" }] },
  { featureType: "landscape.man_made", elementType: "geometry", stylers: [{ color: "#eef0f3" }] },
  { featureType: "landscape.natural", elementType: "geometry", stylers: [{ color: "#f4f5f7" }] },
  { featureType: "poi.park", elementType: "geometry", stylers: [{ color: "#dcefd9" }] },
  { featureType: "poi.school", elementType: "geometry", stylers: [{ color: "#eaf0f7" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#cfe0f1" }] },
];

type Props = { apiKey: string; points: MapPoint[]; showPins: boolean; showHeat: boolean; now: string; isStudent: boolean; onAuthFailure: () => void };

export default function GoogleMap({ apiKey, points, showPins, showHeat, now, isStudent, onAuthFailure }: Props) {
  const [view] = useState(initialView);
  const [selected, setSelected] = useState<string | null>(null);

  // Google calls this global when the key is rejected; fall back to the free map.
  useEffect(() => {
    const w = window as unknown as { gm_authFailure?: () => void };
    w.gm_authFailure = onAuthFailure;
    return () => {
      delete w.gm_authFailure;
    };
  }, [onAuthFailure]);

  const selectedPoint = points.find((p) => p.id === selected) ?? null;

  return (
    <APIProvider apiKey={apiKey} onError={onAuthFailure}>
      <Map
        defaultCenter={view.center}
        defaultZoom={view.zoom}
        minZoom={14}
        maxZoom={20}
        mapTypeId="hybrid"
        gestureHandling="greedy"
        disableDefaultUI
        zoomControl
        zoomControlOptions={{ position: ControlPosition.RIGHT_BOTTOM }}
        clickableIcons={false}
        styles={MAP_STYLE}
        className="h-full w-full"
        onClick={() => setSelected(null)}
      >
        {showHeat && points.length > 0 && <HeatOverlay points={points} />}
        <DomOverlay>
          {showPins &&
            [...points]
              .sort((a, b) => a.lat - b.lat || a.meTooCount - b.meTooCount)
              .reverse()
              .map((p, i) => (
                <button
                  key={p.id}
                  type="button"
                  className="fx-map-pin"
                  data-lat={p.lat}
                  data-lng={p.lng}
                  aria-label={pinLabel(p)}
                  title={pinLabel(p)}
                  aria-expanded={selected === p.id}
                  style={{ zIndex: selected === p.id ? 1000 : p.severity === "EMERGENCY" ? 500 : p.meTooCount }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelected(selected === p.id ? null : p.id);
                  }}
                >
                  <Pin p={p} selected={selected === p.id} delay={Math.min(i * 30, 600)} />
                </button>
              ))}
          {selectedPoint && (
            <div
              className="fx-map-popup"
              data-lat={selectedPoint.lat}
              data-lng={selectedPoint.lng}
              data-offset={Math.min(40, 32 + selectedPoint.meTooCount) * 1.22 + 6}
              role="dialog"
              aria-label={selectedPoint.summary}
              onKeyDown={(e) => {
                if (e.key === "Escape") setSelected(null);
              }}
            >
              <div className="relative rounded-[10px] bg-surface p-4 shadow-[var(--shadow-lg)] ring-1 ring-line">
                <button type="button" className="absolute right-1.5 top-1.5 grid size-8 place-items-center rounded-full text-ink-3 hover:bg-bg hover:text-ink" aria-label="Close" onClick={() => setSelected(null)}>
                  <X aria-hidden className="size-4" />
                </button>
                <PinPopup p={selectedPoint} now={now} isStudent={isStudent} />
              </div>
            </div>
          )}
        </DomOverlay>
      </Map>
    </APIProvider>
  );
}

/**
 * Renders React children into Google's overlay pane and keeps every child with
 * data-lat/data-lng pinned to its coordinate as the map pans and zooms.
 */
function DomOverlay({ children }: { children: React.ReactNode }) {
  const map = useMap();
  const maps = useMapsLibrary("maps");
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const overlay = useRef<google.maps.OverlayView | null>(null);

  useEffect(() => {
    if (!map || !maps) return;
    const div = document.createElement("div");
    div.style.position = "absolute";
    maps.OverlayView.preventMapHitsAndGesturesFrom(div);
    class Layer extends maps.OverlayView {
      onAdd() {
        this.getPanes()?.floatPane.appendChild(div);
      }
      draw() {
        const proj = this.getProjection();
        if (!proj) return;
        div.querySelectorAll<HTMLElement>(":scope > [data-lat]").forEach((el) => {
          const pt = proj.fromLatLngToDivPixel(new google.maps.LatLng(Number(el.dataset.lat), Number(el.dataset.lng)));
          if (!pt) return;
          el.style.left = `${pt.x}px`;
          el.style.top = `${pt.y - Number(el.dataset.offset ?? 0)}px`;
        });
      }
      onRemove() {
        div.remove();
      }
    }
    const layer = new Layer();
    layer.setMap(map);
    overlay.current = layer;
    setContainer(div);
    return () => {
      layer.setMap(null);
      overlay.current = null;
    };
  }, [map, maps]);

  // Re-position after React adds, removes, or moves children.
  useLayoutEffect(() => {
    overlay.current?.draw();
  });

  return container ? createPortal(children, container) : null;
}

/** The heat layer: a canvas covering the visible map, repainted when the view settles. */
function HeatOverlay({ points }: { points: MapPoint[] }) {
  const map = useMap();
  const maps = useMapsLibrary("maps");
  const pointsRef = useRef(points);
  const layerRef = useRef<google.maps.OverlayView | null>(null);

  const repaint = useCallback(() => layerRef.current?.draw(), []);

  useEffect(() => {
    pointsRef.current = points;
    repaint();
  }, [points, repaint]);

  useEffect(() => {
    if (!map || !maps) return;
    const canvas = document.createElement("canvas");
    canvas.style.position = "absolute";
    canvas.style.pointerEvents = "none";
    class Layer extends maps.OverlayView {
      onAdd() {
        this.getPanes()?.overlayLayer.appendChild(canvas);
      }
      draw() {
        const proj = this.getProjection();
        const bounds = map!.getBounds();
        if (!proj || !bounds) return;
        const ne = proj.fromLatLngToDivPixel(bounds.getNorthEast());
        const sw = proj.fromLatLngToDivPixel(bounds.getSouthWest());
        if (!ne || !sw) return;
        const pad = 200;
        const left = sw.x - pad;
        const top = ne.y - pad;
        const width = Math.max(1, Math.round(ne.x - sw.x + pad * 2));
        const height = Math.max(1, Math.round(sw.y - ne.y + pad * 2));
        canvas.style.left = `${left}px`;
        canvas.style.top = `${top}px`;
        canvas.width = width;
        canvas.height = height;
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
        const zoom = map!.getZoom() ?? 16;
        const radius = Math.max(18, Math.min(110, 38 * 2 ** (zoom - 16)));
        const pts = pointsRef.current.flatMap((p) => {
          const px = proj.fromLatLngToDivPixel(new google.maps.LatLng(p.lat, p.lng));
          return px ? [{ x: px.x - left, y: px.y - top, w: heatWeight(p) }] : [];
        });
        paintHeat(canvas, pts, radius);
      }
      onRemove() {
        canvas.remove();
      }
    }
    const layer = new Layer();
    layer.setMap(map);
    layerRef.current = layer;
    const idle = map.addListener("idle", () => layer.draw());
    return () => {
      idle.remove();
      layer.setMap(null);
      layerRef.current = null;
    };
  }, [map, maps]);

  return null;
}

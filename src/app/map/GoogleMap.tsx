"use client";

// Google Maps renderer, used when GOOGLE_MAPS_API_KEY is set.
//
// Heat is drawn with deck.gl, not google.maps.visualization.HeatmapLayer:
// Google deprecated that layer in May 2025 and removed it in May 2026, and its
// deprecation notice points to deck.gl's HeatmapLayer as the replacement.

import { useEffect, useMemo, useState } from "react";
import { APIProvider, AdvancedMarker, ControlPosition, InfoWindow, Map, useAdvancedMarkerRef, useMap } from "@vis.gl/react-google-maps";
import { GoogleMapsOverlay } from "@deck.gl/google-maps";
import { HeatmapLayer } from "@deck.gl/aggregation-layers";
import { HEAT_STOPS, PinPopup, heatWeight, initialView, pinMarkup, pinTitle, pinZIndex } from "./shared";
import type { MapPoint } from "./MapClient";

type RGBA = [number, number, number, number];

function hexToRgba(hex: string, alpha: number): RGBA {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, alpha];
}

// deck.gl spreads colorRange evenly across the weight range; the coolest stop
// is more transparent so light activity tints the map rather than covering it.
const HEAT_COLORS: RGBA[] = HEAT_STOPS.map((s, i) => hexToRgba(s.hex, i === 0 ? 110 : 190));

function Heat({ points }: { points: MapPoint[] }) {
  const map = useMap();

  // One overlay per (map, points): rebuilt when the filters change, and created
  // inside the effect so React's mount/unmount/remount in dev never reuses a
  // finalized overlay.
  //
  // The overlay is only created once the map knows its rendering type. Given a
  // map that is still initializing, GoogleMapsOverlay.setMap registers a
  // "renderingtype_changed" listener that it never removes, so an overlay
  // discarded in the meantime (dev double-mount, or a filter change during
  // load) later attaches itself to a null map and throws. Waiting here, with a
  // listener this effect owns and removes, avoids that.
  useEffect(() => {
    if (!map) return;
    let overlay: GoogleMapsOverlay | null = null;
    const attach = () => {
      overlay = new GoogleMapsOverlay({
        layers: [
          new HeatmapLayer<MapPoint>({
            id: "issue-heat",
            data: points,
            getPosition: (p) => [p.lng, p.lat],
            getWeight: heatWeight,
            radiusPixels: 60,
            intensity: 1,
            threshold: 0.05,
            colorRange: HEAT_COLORS,
          }),
        ],
      });
      overlay.setMap(map);
    };

    let pending: google.maps.MapsEventListener | null = null;
    if (map.getRenderingType() === google.maps.RenderingType.UNINITIALIZED) {
      pending = map.addListener("renderingtype_changed", () => {
        pending?.remove();
        pending = null;
        attach();
      });
    } else {
      attach();
    }

    return () => {
      pending?.remove();
      if (overlay) {
        overlay.setMap(null);
        overlay.finalize();
      }
    };
  }, [map, points]);

  return null;
}

function Pin({ p, open, onOpen, onClose, now, isStudent }: { p: MapPoint; open: boolean; onOpen: () => void; onClose: () => void; now: string; isStudent: boolean }) {
  const [ref, marker] = useAdvancedMarkerRef();
  const { html } = useMemo(() => pinMarkup(p), [p]);
  return (
    <>
      {/* A clickable AdvancedMarker is a focusable button; Enter opens the popup. */}
      <AdvancedMarker ref={ref} position={{ lat: p.lat, lng: p.lng }} title={pinTitle(p)} zIndex={pinZIndex(p)} onClick={onOpen} className="hm-pin">
        <span dangerouslySetInnerHTML={{ __html: html }} />
      </AdvancedMarker>
      {open && marker && (
        <InfoWindow anchor={marker} onClose={onClose} shouldFocus>
          <PinPopup p={p} now={now} isStudent={isStudent} />
        </InfoWindow>
      )}
    </>
  );
}

export default function GoogleMap({
  apiKey,
  mapId,
  points,
  showPins,
  showHeat,
  now,
  isStudent,
}: {
  apiKey: string;
  mapId: string;
  points: MapPoint[];
  showPins: boolean;
  showHeat: boolean;
  now: string;
  isStudent: boolean;
}) {
  const [view] = useState(initialView);
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <APIProvider apiKey={apiKey}>
      <Map
        className="h-full w-full"
        mapId={mapId}
        defaultCenter={view.center}
        defaultZoom={view.zoom}
        minZoom={14}
        maxZoom={19}
        gestureHandling="greedy"
        disableDefaultUI
        zoomControl
        zoomControlOptions={{ position: ControlPosition.RIGHT_BOTTOM }}
        clickableIcons={false}
        onClick={() => setOpenId(null)}
      >
        {showHeat && points.length > 0 && <Heat points={points} />}
        {showPins &&
          points.map((p) => (
            <Pin key={p.id} p={p} open={openId === p.id} onOpen={() => setOpenId(p.id)} onClose={() => setOpenId((id) => (id === p.id ? null : id))} now={now} isStudent={isStudent} />
          ))}
      </Map>
    </APIProvider>
  );
}

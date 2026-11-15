"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { HeatLayer } from "leaflet.heat";
import { useEffect, useMemo, useState } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MapContainer, Marker, Popup, TileLayer, ZoomControl, useMap } from "react-leaflet";
import type { MapPoint } from "./MapClient";
import { HEAT_GRADIENT, Pin, PinPopup, heatWeight, initialView, pinLabel } from "./mapShared";

function pinIcon(p: MapPoint): L.DivIcon {
  const size = Math.min(40, 32 + p.meTooCount);
  const h = size * 1.22;
  return L.divIcon({ html: renderToStaticMarkup(<Pin p={p} />), className: "fx-pin", iconSize: [size, h], iconAnchor: [size / 2, h], popupAnchor: [0, -h * 0.9] });
}

function Heat({ points }: { points: MapPoint[] }) {
  const map = useMap();
  useEffect(() => {
    const data = points.map((p) => [p.lat, p.lng, heatWeight(p)] as [number, number, number]);
    const layer = new HeatLayer(data, {
      radius: 40,
      blur: 32,
      maxZoom: 17,
      minOpacity: 0.2,
      gradient: HEAT_GRADIENT,
    });
    (layer as unknown as L.Layer).addTo(map);
    return () => {
      map.removeLayer(layer as unknown as L.Layer);
    };
  }, [map, points]);
  return null;
}

export default function LeafletMap({ points, showPins, showHeat, now, isStudent }: { points: MapPoint[]; showPins: boolean; showHeat: boolean; now: string; isStudent: boolean }) {
  const icons = useMemo(() => new Map(points.map((p) => [p.id, pinIcon(p)])), [points]);
  // Draw emergencies and popular issues on top.
  const ordered = useMemo(() => [...points].sort((a, b) => a.meTooCount - b.meTooCount), [points]);

  const [view] = useState(initialView);

  return (
    <MapContainer center={[view.center.lat, view.center.lng]} zoom={view.zoom} minZoom={14} maxZoom={19} scrollWheelZoom zoomControl={false} className="h-full w-full" keyboard>
      <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" maxZoom={19} />
      <ZoomControl position="bottomright" />
      {showHeat && points.length > 0 && <Heat points={points} />}
      {showPins &&
        ordered.map((p) => (
          <Marker
            key={p.id}
            position={[p.lat, p.lng]}
            icon={icons.get(p.id)!}
            title={pinLabel(p)}
            alt={p.summary}
            keyboard
            zIndexOffset={p.severity === "EMERGENCY" ? 1000 : p.meTooCount * 10}
          >
            <Popup>
              <PinPopup p={p} now={now} isStudent={isStudent} />
            </Popup>
          </Marker>
        ))}
    </MapContainer>
  );
}

"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { HeatLayer } from "leaflet.heat";
import { useEffect, useMemo, useRef, useState } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MapContainer, Marker, Popup, TileLayer, ZoomControl, useMap } from "react-leaflet";
import type { MapPoint } from "./MapClient";
import { ContractorPin, ContractorPopup, HEAT_GRADIENT, Pin, PinPopup, contractorLabel, heatWeight, initialView, pinLabel, type ContractorLayerProps } from "./mapShared";
import type { ContractorLocation } from "@/lib/contractor-locations";

function pinIcon(p: MapPoint, i = 0, faint = false): L.DivIcon {
  const size = Math.min(40, 32 + p.meTooCount);
  const h = size * 1.22;
  return L.divIcon({ html: renderToStaticMarkup(<Pin p={p} delay={Math.min(i * 30, 600)} faint={faint} />), className: "fx-pin", iconSize: [size, h], iconAnchor: [size / 2, h], popupAnchor: [0, -h * 0.9] });
}

function contractorIcon(c: ContractorLocation): L.DivIcon {
  return L.divIcon({ html: renderToStaticMarkup(<ContractorPin c={c} />), className: "fx-pin", iconSize: [36, 36], iconAnchor: [18, 18], popupAnchor: [0, -20] });
}

/** Contractor markers; a selection from the side list opens the popup and pans there. */
function Contractors({ contractors, now, selectedId, onSelect }: { contractors: ContractorLocation[]; now: string; selectedId: string | null; onSelect?: (id: string | null) => void }) {
  const map = useMap();
  const refs = useRef(new globalThis.Map<string, L.Marker>());
  useEffect(() => {
    if (!selectedId) return;
    const m = refs.current.get(selectedId);
    if (!m) return;
    map.panTo(m.getLatLng());
    if (!m.isPopupOpen()) m.openPopup();
  }, [selectedId, map]);
  return (
    <>
      {contractors.map((c) => (
        <Marker
          key={c.id}
          position={[c.lat!, c.lng!]}
          icon={contractorIcon(c)}
          title={contractorLabel(c)}
          alt={c.name}
          keyboard
          zIndexOffset={2000}
          ref={(m) => {
            if (m) refs.current.set(c.id, m);
            else refs.current.delete(c.id);
          }}
          eventHandlers={{ popupopen: () => onSelect?.(c.id), popupclose: () => selectedId === c.id && onSelect?.(null) }}
        >
          <Popup>
            <ContractorPopup c={c} now={now} />
          </Popup>
        </Marker>
      ))}
    </>
  );
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

export default function LeafletMap({ points, showPins, showHeat, now, isStudent, contractors = [], selectedContractorId = null, onSelectContractor, faintPins = false }: { points: MapPoint[]; showPins: boolean; showHeat: boolean; now: string; isStudent: boolean } & ContractorLayerProps) {
  const icons = useMemo(() => new Map(points.map((p, i) => [p.id, pinIcon(p, i, faintPins)])), [points, faintPins]);
  const placed = useMemo(() => contractors.filter((c) => c.lat !== null && c.lng !== null), [contractors]);
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
      {placed.length > 0 && <Contractors contractors={placed} now={now} selectedId={selectedContractorId} onSelect={onSelectContractor} />}
    </MapContainer>
  );
}

"use client";

import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import Link from "next/link";

// Leaflet's default marker icons resolve to local asset paths that break
// under bundlers unless patched — pull them from a CDN instead.
const markerIcon = L.icon({
  iconUrl: "https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

export interface MapAsset {
  id: string; // unique per marker — for a multi-location asset this is `${assetId}:${locationId}`
  assetId: string; // the real Asset id, always safe to link to
  assetName: string;
  locationName: string;
  supplierName: string;
  format: string | null;
  latitude: number;
  longitude: number;
  numberOfFaces: number | null;
  numberOfScreens: number | null;
  latestRate: string | null;
  primaryImageId: string | null;
}

export function AssetMap({ assets, center }: { assets: MapAsset[]; center: [number, number] }) {
  return (
    <MapContainer center={center} zoom={11} scrollWheelZoom style={{ height: "100%", width: "100%" }}>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {assets.map((a) => (
        <Marker key={a.id} position={[a.latitude, a.longitude]} icon={markerIcon}>
          <Popup>
            <div className="text-sm min-w-[180px]">
              {a.primaryImageId && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={`/api/asset-images/${a.primaryImageId}`}
                  alt=""
                  className="w-full h-20 object-cover rounded mb-1.5"
                />
              )}
              <div className="font-medium">{a.assetName}</div>
              <div className="text-xs text-gray-500">
                {a.supplierName} · {a.locationName}
              </div>
              <div className="text-xs text-gray-500">{a.format}</div>
              {(a.numberOfFaces || a.numberOfScreens) && (
                <div className="text-xs text-gray-500">
                  {a.numberOfFaces ? `${a.numberOfFaces} faces` : `${a.numberOfScreens} screens`}
                </div>
              )}
              <div className="text-xs font-medium mt-1">{a.latestRate ?? "No rate on file"}</div>
              <Link href={`/planning/inventory/${a.assetId}`} className="text-xs text-blue-600 underline mt-1 inline-block">
                View details →
              </Link>
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}

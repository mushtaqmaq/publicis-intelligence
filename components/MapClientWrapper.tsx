"use client";

import dynamic from "next/dynamic";
import type { MapAsset } from "./AssetMap";

// `ssr: false` is only allowed inside a Client Component — Leaflet
// touches window/DOM directly and must never render on the server.
const AssetMap = dynamic(() => import("./AssetMap").then((m) => m.AssetMap), {
  ssr: false,
  loading: () => (
    <div className="h-full w-full flex items-center justify-center text-sm text-muted">Loading map…</div>
  ),
});

export function MapClientWrapper({ assets, center }: { assets: MapAsset[]; center: [number, number] }) {
  return <AssetMap assets={assets} center={center} />;
}

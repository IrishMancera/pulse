"use client";

import { useEffect, useRef, useState } from "react";
import "mapbox-gl/dist/mapbox-gl.css";
import type { Map as MapboxMap, Marker } from "mapbox-gl";
import type { PeerDot } from "@/lib/types";

const rawToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN?.trim();
const hasRealToken = Boolean(
  rawToken &&
    rawToken.startsWith("pk.") &&
    !rawToken.includes("your_mapbox_token") &&
    !rawToken.includes("AAAAAAAAAAAAAAAAAAAAAA")
);
const TOKEN = hasRealToken
  ? rawToken!
  : "pk.eyJ1IjoicHVsc2UtbWFwIiwiYSI6ImNrMDBkZW1vMDAwMDAwMDAifQ.AAAAAAAAAAAAAAAAAAAAAA";

const FALLBACK_DARK_STYLE = {
  version: 8 as const,
  sources: {
    "carto-dark": {
      type: "raster" as const,
      tiles: [
        "https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png",
        "https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png",
        "https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png",
        "https://d.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png",
      ],
      tileSize: 256,
      attribution:
        "&copy; <a href='https://www.openstreetmap.org/copyright'>OpenStreetMap</a>, &copy; <a href='https://carto.com/attributions'>CARTO</a>",
    },
  },
  layers: [
    {
      id: "carto-dark-layer",
      type: "raster" as const,
      source: "carto-dark",
      minzoom: 0,
      maxzoom: 20,
    },
  ],
};

const TONE_COLORS: Record<string, string> = {
  green:  "#22c55e",
  violet: "#a855f7",
  cyan:   "#06b6d4",
  rose:   "#f43f5e",
  amber:  "#f59e0b",
};

const SIGNAL_EMOJI: Record<string, string> = {
  open:    "💬",
  curious: "✨",
  quiet:   "🌙",
};

function dotColor(peer: PeerDot): string {
  if (peer.tone && TONE_COLORS[peer.tone]) return TONE_COLORS[peer.tone];
  // fallback: hash from id
  let hash = 0;
  for (let i = 0; i < peer.id.length; i++) {
    hash = (hash * 31 + peer.id.charCodeAt(i)) | 0;
  }
  return `hsl(${Math.abs(hash) % 360}, 68%, 62%)`;
}

export default function WorldMap({
  peers,
  me,
  onPeerClick,
  canConnect,
}: {
  peers: PeerDot[];
  me: { lat: number; lng: number } | null;
  onPeerClick: (id: string) => void;
  canConnect: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapboxMap | null>(null);
  const markersRef = useRef<Map<string, Marker>>(new Map());
  const meMarkerRef = useRef<Marker | null>(null);
  const [ready, setReady] = useState(false);

  const onPeerClickRef = useRef(onPeerClick);
  const canConnectRef = useRef(canConnect);
  useEffect(() => {
    onPeerClickRef.current = onPeerClick;
    canConnectRef.current = canConnect;
  });

  // Initialise the map once.
  useEffect(() => {
    if (!containerRef.current) return;
    let cancelled = false;
    const markers = markersRef.current;

    (async () => {
      const mapboxgl = (await import("mapbox-gl")).default;
      if (cancelled || !containerRef.current) return;
      mapboxgl.accessToken = TOKEN;
      const map = new mapboxgl.Map({
        container: containerRef.current,
        style: hasRealToken
          ? "mapbox://styles/mapbox/dark-v11"
          : (FALLBACK_DARK_STYLE as unknown as string),
        center: me ? [me.lng, me.lat] : [0, 20],
        zoom: me ? 4 : 1.4,
        attributionControl: true,
      });
      map.on("load", () => {
        if (!cancelled) setReady(true);
      });
      map.on("error", () => {
        if (!cancelled) setReady(true);
      });
      mapRef.current = map;
    })();

    return () => {
      cancelled = true;
      markers.forEach((m) => m.remove());
      markers.clear();
      meMarkerRef.current?.remove();
      meMarkerRef.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
      setReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Show / move the user's own "you are here" pin.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !me) return;
    let cancelled = false;

    (async () => {
      const mapboxgl = (await import("mapbox-gl")).default;
      if (cancelled) return;
      if (!meMarkerRef.current) {
        const el = document.createElement("div");
        el.className = "pulse-me";
        el.title = "You are here";
        el.innerHTML = `<span class="pulse-me-label">Me</span>📍`;
        meMarkerRef.current = new mapboxgl.Marker({ element: el, anchor: "bottom" })
          .setLngLat([me.lng, me.lat])
          .addTo(map);
      } else {
        meMarkerRef.current.setLngLat([me.lng, me.lat]);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [me, ready]);

  // Reconcile markers whenever the peer list changes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    let cancelled = false;

    (async () => {
      const mapboxgl = (await import("mapbox-gl")).default;
      if (cancelled) return;
      const markers = markersRef.current;
      const seen = new Set<string>();

      for (const peer of peers) {
        seen.add(peer.id);
        let marker = markers.get(peer.id);
        if (!marker) {
          const el = document.createElement("button");
          el.className = "pulse-dot";
          const color = dotColor(peer);
          el.style.background = color;
          el.style.color = color; // used by ::after ripple
          el.title = canConnectRef.current ? "Tap to connect" : "";

          // Tooltip popup
          const popup = new mapboxgl.Popup({
            closeButton: false,
            closeOnClick: false,
            offset: 16,
            className: "pulse-popup",
          }).setHTML(buildPopupHtml(peer));

          el.addEventListener("mouseenter", () => {
            if (!canConnectRef.current) return;
            marker!.setPopup(popup);
            popup.addTo(map);
          });
          el.addEventListener("mouseleave", () => {
            popup.remove();
          });
          el.addEventListener("click", (e) => {
            e.stopPropagation();
            popup.remove();
            if (canConnectRef.current) onPeerClickRef.current(peer.id);
          });

          marker = new mapboxgl.Marker({ element: el })
            .setLngLat([peer.lng, peer.lat])
            .addTo(map);
          markers.set(peer.id, marker);
        } else {
          // Update position in case it drifted
          marker.setLngLat([peer.lng, peer.lat]);
        }
        marker.getElement().style.opacity = peer.busy ? "0.3" : "1";
      }

      // Drop markers for peers that went offline.
      for (const [id, marker] of markers) {
        if (!seen.has(id)) {
          marker.remove();
          markers.delete(id);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [peers, ready]);

  return (
    <div className="absolute inset-0">
      <div ref={containerRef} className="h-full w-full" style={{ background: "#050508" }} />

      {/* Mapbox popup styles — injected globally once */}
      <style>{`
        .mapboxgl-popup-content {
          background: rgba(12, 11, 20, 0.92) !important;
          border: 1px solid rgba(255,255,255,0.09) !important;
          border-radius: 14px !important;
          padding: 10px 13px !important;
          backdrop-filter: blur(14px) !important;
          box-shadow: 0 8px 32px rgba(0,0,0,0.6) !important;
          color: #f0f0f5 !important;
          font-family: 'Inter', Arial, sans-serif !important;
          min-width: 160px;
        }
        .mapboxgl-popup-tip { display: none !important; }
        .pulse-popup-signal { font-size: 12px; color: #a0a0b0; margin-top: 2px; }
        .pulse-popup-name { font-size: 13px; font-weight: 600; color: #fff; }
        .pulse-popup-dist { font-size: 11px; color: #6b6b85; margin-top: 3px; }
        .pulse-popup-hint { font-size: 10px; color: #4b4b65; margin-top: 5px; }
      `}</style>

      {/* Online count pill */}
      <div
        className="absolute bottom-5 left-4 flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs text-zinc-300"
        style={{
          background: "rgba(10, 10, 18, 0.82)",
          border: "1px solid rgba(255,255,255,0.07)",
          backdropFilter: "blur(12px)",
        }}
      >
        <span
          className="h-1.5 w-1.5 rounded-full"
          style={{ background: "#22c55e", boxShadow: "0 0 6px #22c55e" }}
        />
        {peers.length} {peers.length === 1 ? "person" : "people"} online
      </div>
    </div>
  );
}

function buildPopupHtml(peer: PeerDot): string {
  const name = peer.nickname ? peer.nickname : "Anonymous";
  const emoji = SIGNAL_EMOJI[peer.signal ?? "curious"] ?? "✨";
  const signalLabel = peer.signal
    ? peer.signal.charAt(0).toUpperCase() + peer.signal.slice(1)
    : "Curious";
  const dist = peer.distance ?? "";
  const hint = peer.busy ? "Busy" : "Click to connect";

  return `
    <div class="pulse-popup-name">${emoji} ${name}</div>
    <div class="pulse-popup-signal">${signalLabel}${peer.city ? ` · ${peer.city}` : ""}</div>
    ${dist ? `<div class="pulse-popup-dist">${dist}</div>` : ""}
    <div class="pulse-popup-hint">${hint}</div>
  `;
}

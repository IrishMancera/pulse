"use client";

import { useEffect, useRef, useState } from "react";
import "maplibre-gl/dist/maplibre-gl.css";
import type { FilterSpecification, Map as MapLibreMap, Marker } from "maplibre-gl";
import type { IdentityProfile, PeerDot } from "@/lib/types";

const avatarColors = {
  green: "#08cb00",
  violet: "#8b5cf6",
  cyan: "#22d3ee",
  rose: "#ff3b5c",
  amber: "#f5b942",
} as const;

function peerName(peer: PeerDot) {
  const suffix = peer.id.replace(/-/g, "").slice(-4).toUpperCase();
  if (peer.identityMode === "nickname" && peer.nickname?.trim()) {
    return peer.nickname.trim();
  }
  return peer.identityMode === "color"
    ? `${peer.avatarTone} alien ${suffix}`
    : `Anonymous ${suffix}`;
}

function alienFaceMarkup() {
  return '<svg class="pulse-alien-face" viewBox="0 0 48 48" aria-hidden="true"><path class="pulse-alien-head" d="M24 3.5c10.2 0 17.2 7.6 16 18.2C38.6 34 29 43.4 24 45c-5-1.6-14.6-11-16-23.3C6.8 11.1 13.8 3.5 24 3.5Z"/><path class="pulse-alien-eye" d="M11.8 19.2c4.5-.8 8.1.2 10.2 3.1-2.7 3-6.1 3.8-9.8 2.1-1.2-1.8-1.3-3.5-.4-5.2Z"/><path class="pulse-alien-eye" d="M36.2 19.2c-4.5-.8-8.1.2-10.2 3.1 2.7 3 6.1 3.8 9.8 2.1 1.2-1.8 1.3-3.5.4-5.2Z"/><path class="pulse-alien-mouth" d="M20.5 34.2c2.3 1.2 4.7 1.2 7 0"/></svg>';
}

  function applyPulseMapStyle(map: MapLibreMap) {
    const set = (layer: string, property: string, value: string | number | number[]) => {
      if (map.getLayer(layer)) {
        map.setPaintProperty(layer, property as never, value as never);
      }
    };

    set("background", "background-color", "#07121b");
    set("water", "fill-color", "#0c3b53");
    set("waterway", "line-color", "#35b9f2");
    set("waterway", "line-dasharray", [2, 2]);
    set("landcover_wood", "fill-color", "#10392f");
    set("landuse_park", "fill-color", "#15523d");
    set("landuse_residential", "fill-color", "#101923");
    set("building", "fill-color", "#334957");
    set("building", "fill-outline-color", "#526b79");
    set("building", "fill-opacity", 0.72);
    set("highway_path", "line-color", "#48d58b");
    set("highway_path", "line-dasharray", [1.5, 2]);
    set("highway_minor", "line-color", "#dd5664");
    set("highway_minor", "line-dasharray", [3, 1.5]);
    set("highway_major_casing", "line-color", "#762f43");
    set("highway_major_casing", "line-dasharray", [4, 1.5]);
    set("highway_major_inner", "line-color", "#ff6473");
    set("highway_major_subtle", "line-color", "#cf5265");
    set("highway_motorway_casing", "line-color", "#702a40");
    set("highway_motorway_casing", "line-dasharray", [5, 1.5]);
    set("highway_motorway_inner", "line-color", "#ff7780");
    set("railway", "line-color", "#a98bff");
    set("railway", "line-dasharray", [2, 2]);
    set("railway_minor", "line-color", "#856cce");
    set("railway_minor_dashline", "line-color", "#c0aaff");
    set("boundary_state", "line-color", "#3d9dd1");
    set("boundary_state", "line-dasharray", [2, 2]);
    set("boundary_country_z0-4", "line-color", "#71c6ef");
    set("boundary_country_z0-4", "line-dasharray", [3, 2]);
    set("boundary_country_z5-", "line-color", "#71c6ef");
    set("boundary_country_z5-", "line-dasharray", [3, 2]);

    if (map.getSource("openmaptiles") && !map.getLayer("pulse-landmark-dots")) {
      const landmarkFilter: FilterSpecification = [
        "any",
        ["==", ["get", "class"], "park"],
        ["==", ["get", "class"], "museum"],
        ["==", ["get", "class"], "monument"],
        ["==", ["get", "class"], "attraction"],
        ["==", ["get", "class"], "viewpoint"],
        ["==", ["get", "class"], "university"],
        ["==", ["get", "class"], "historic"],
      ];

      map.addLayer({
        id: "pulse-landmark-dots",
        type: "circle",
        source: "openmaptiles",
        "source-layer": "poi",
        minzoom: 9,
        filter: landmarkFilter,
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 9, 2, 14, 4],
          "circle-color": "#f0c978",
          "circle-stroke-color": "#17212a",
          "circle-stroke-width": 1,
          "circle-opacity": 0.95,
        },
      });

      map.addLayer({
        id: "pulse-landmark-labels",
        type: "symbol",
        source: "openmaptiles",
        "source-layer": "poi",
        minzoom: 11,
        filter: landmarkFilter,
        layout: {
          "text-field": ["coalesce", ["get", "name:en"], ["get", "name"]],
          "text-font": ["Noto Sans Regular"],
          "text-size": ["interpolate", ["linear"], ["zoom"], 11, 9, 15, 11],
          "text-anchor": "top",
          "text-offset": [0, 0.7],
          "text-max-width": 10,
          "text-allow-overlap": false,
        },
        paint: {
          "text-color": "#f0d798",
          "text-halo-color": "#09141c",
          "text-halo-width": 1.5,
        },
      });
    }
  }

export default function WorldMap({
  peers,
  me,
  profile,
  onPeerClick,
  canConnect,
  focusNearby,
  isRoaming = false,
}: {
  peers: PeerDot[];
  me: { lat: number; lng: number } | null;
  profile: IdentityProfile;
  onPeerClick: (id: string) => void;
  canConnect: boolean;
  focusNearby: boolean;
  isRoaming?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef<Map<string, Marker>>(new Map());
  const meMarkerRef = useRef<Marker | null>(null);
  const [ready, setReady] = useState(false);
  const [autoRoamPaused, setAutoRoamPaused] = useState(false);
  const userInteractingRef = useRef(false);
  const pauseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const peerIndexRef = useRef(0);
  const onPeerClickRef = useRef(onPeerClick);
  const canConnectRef = useRef(canConnect);

  useEffect(() => {
    onPeerClickRef.current = onPeerClick;
    canConnectRef.current = canConnect;
  });

  useEffect(() => {
    if (!containerRef.current) return;
    let cancelled = false;
    const markers = markersRef.current;

    void import("maplibre-gl").then((maplibre) => {
      if (cancelled || !containerRef.current) return;
      maplibre.setWorkerUrl("/maplibre-gl-worker.mjs");

      const map = new maplibre.Map({
        container: containerRef.current,
        style: "https://tiles.openfreemap.org/styles/dark",
        center: me ? [me.lng, me.lat] : [0, 20],
        zoom: me ? 4 : 1.5,
        cooperativeGestures: true,
      });

      map.addControl(
        new maplibre.NavigationControl({ showCompass: false }),
        "bottom-right",
      );
      const markReady = () => {
        if (!cancelled) setReady(true);
      };
      map.once("render", markReady);
        map.once("load", () => {
          applyPulseMapStyle(map);
          markReady();
        });
      map.on("styleimagemissing", (e) => {
        const id = e.id;
        if (!map.hasImage(id)) {
          map.addImage(id, {
            width: 1,
            height: 1,
            data: new Uint8Array(4),
          });
        }
      });
      map.on("error", (event) => {
        console.error("Map tiles failed to load:", event.error);
      });
      mapRef.current = map;
    });

    return () => {
      cancelled = true;
      markers.forEach((marker) => marker.remove());
      markers.clear();
      meMarkerRef.current?.remove();
      meMarkerRef.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
      setReady(false);
    };
    // The initial center is used only when the map is created.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !me) return;
    let cancelled = false;

    void import("maplibre-gl").then((maplibre) => {
      if (cancelled) return;
      if (!meMarkerRef.current) {
        const element = document.createElement("div");
        element.className = "pulse-user-marker";
        element.setAttribute("aria-label", "Your approximate location");
        element.innerHTML = `<span class="pulse-me-ping"></span>${alienFaceMarkup()}<span class="pulse-me-label"></span>`;
        meMarkerRef.current = new maplibre.Marker({ element, anchor: "bottom" })
          .setLngLat([me.lng, me.lat])
          .addTo(map);
      } else {
        meMarkerRef.current.setLngLat([me.lng, me.lat]);
      }
      const element = meMarkerRef.current.getElement();
      element.style.setProperty("--peer-color", avatarColors[profile.avatarTone]);
      const label = element.querySelector(".pulse-me-label");
      if (label) {
        label.textContent =
          profile.identityMode === "nickname" && profile.nickname.trim()
            ? profile.nickname.trim()
            : "YOU";
      }
    });

    return () => {
      cancelled = true;
    };
  }, [me, profile, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    map.flyTo({
      center: focusNearby && me ? [me.lng, me.lat] : [0, 20],
      zoom: focusNearby && me ? 9 : 1.5,
      duration: 1000,
    });
  }, [focusNearby, me, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;

    void import("maplibre-gl").then((maplibre) => {
      const markers = markersRef.current;
      const activeIds = new Set(peers.map((peer) => peer.id));

      for (const peer of peers) {
        let marker = markers.get(peer.id);
        if (!marker) {
          const element = document.createElement("button");
          element.type = "button";
          element.className = "pulse-peer-marker";
          element.style.setProperty("--peer-color", avatarColors[peer.avatarTone]);
          element.setAttribute(
            "aria-label",
            peer.busy
              ? "Nearby pulse is in a conversation"
              : "Send a connection request to nearby pulse",
          );
          element.title = peer.busy
            ? "Already in a conversation"
            : `Connect to ${peerName(peer)}`;
          element.innerHTML = `<span class="pulse-peer-ring"></span>${alienFaceMarkup()}<span class="pulse-peer-anchor"></span><span class="pulse-peer-label"></span>`;
          element.addEventListener("click", (event) => {
            event.stopPropagation();
            if (!element.disabled && canConnectRef.current) {
              onPeerClickRef.current(peer.id);
            }
          });
          marker = new maplibre.Marker({ element, anchor: "bottom" })
            .setLngLat([peer.lng, peer.lat])
            .addTo(map);
          markers.set(peer.id, marker);
        } else {
          marker.setLngLat([peer.lng, peer.lat]);
        }
        const markerElement = marker.getElement() as HTMLButtonElement;
        markerElement.style.setProperty("--peer-color", avatarColors[peer.avatarTone]);
        markerElement.querySelector(".pulse-peer-label")!.textContent = peerName(peer);
        markerElement.title = peer.busy ? "Already in a conversation" : `Connect to ${peerName(peer)}`;
        markerElement.disabled = Boolean(peer.busy);
        markerElement.setAttribute("aria-disabled", String(Boolean(peer.busy)));
        markerElement.classList.toggle("is-busy", Boolean(peer.busy));
      }

      for (const [id, marker] of markers) {
        if (!activeIds.has(id)) {
          marker.remove();
          markers.delete(id);
        }
      }
    });
  }, [peers, ready]);

  // Pause auto-roaming whenever user manually touches, drags, or zooms the map
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const handleUserInteraction = () => {
      userInteractingRef.current = true;
      if (pauseTimeoutRef.current) clearTimeout(pauseTimeoutRef.current);
      // Resume roaming 6 seconds after user stops dragging / interacting
      pauseTimeoutRef.current = setTimeout(() => {
        userInteractingRef.current = false;
      }, 6000);
    };

    map.on("dragstart", handleUserInteraction);
    map.on("zoomstart", handleUserInteraction);
    map.on("rotatestart", handleUserInteraction);
    map.on("pitchstart", handleUserInteraction);

    return () => {
      map.off("dragstart", handleUserInteraction);
      map.off("zoomstart", handleUserInteraction);
      map.off("rotatestart", handleUserInteraction);
      map.off("pitchstart", handleUserInteraction);
      if (pauseTimeoutRef.current) clearTimeout(pauseTimeoutRef.current);
    };
  }, [ready]);

  // Automatic roaming engine when available
  useEffect(() => {
    if (!ready || !isRoaming || autoRoamPaused || focusNearby) return;
    const map = mapRef.current;
    if (!map) return;

    let timer: ReturnType<typeof setInterval>;

    const stepRoam = () => {
      if (userInteractingRef.current || document.hidden) return;

      const availablePeers = peers.filter((p) => !p.busy);
      if (availablePeers.length > 0) {
        // Smoothly visit the next available online peer
        peerIndexRef.current = (peerIndexRef.current + 1) % availablePeers.length;
        const target = availablePeers[peerIndexRef.current];
        if (target) {
          map.flyTo({
            center: [target.lng, target.lat],
            zoom: 4.5,
            speed: 0.5,
            curve: 1.4,
            essential: true,
          });
        }
      } else {
        // Slow gentle drift across world longitudes
        const center = map.getCenter();
        const nextLng = ((center.lng + 18 + 180) % 360) - 180;
        map.easeTo({
          center: [nextLng, Math.max(-35, Math.min(45, center.lat))],
          zoom: 1.8,
          duration: 3500,
          easing: (t) => t,
        });
      }
    };

    const initialDelay = setTimeout(stepRoam, 2500);
    timer = setInterval(stepRoam, 9000);

    return () => {
      clearTimeout(initialDelay);
      clearInterval(timer);
    };
  }, [ready, isRoaming, autoRoamPaused, focusNearby, peers]);

  return (
    <div className="absolute inset-0">
      <div ref={containerRef} className="pulse-live-map" aria-label="Interactive world map" />
      {isRoaming && ready && !focusNearby && (
        <div className="pulse-roam-indicator" role="status">
          <span className={`pulse-roam-dot ${autoRoamPaused ? "paused" : "active"}`} />
          <span className="pulse-roam-label">
            {autoRoamPaused ? "Auto-roam paused" : "Auto-roaming online pulses"}
          </span>
          <button
            type="button"
            className="pulse-roam-toggle"
            onClick={() => setAutoRoamPaused((prev) => !prev)}
            title={autoRoamPaused ? "Resume auto-roaming" : "Pause auto-roaming"}
          >
            {autoRoamPaused ? "Resume" : "Pause"}
          </button>
        </div>
      )}
      {!ready && <div className="map-loading-state">Loading live map…</div>}
    </div>
  );
}
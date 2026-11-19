import React, { useCallback, useEffect, useState } from "react";
import { TileLayer, useMap } from "react-leaflet";
import GoogleMutant from "leaflet.gridlayer.googlemutant/src/Leaflet.GoogleMutant.mjs";

const DARK_MAP_STYLES = [
  { elementType: "geometry", stylers: [{ color: "#1a1d23" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#94a3b8" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#1a1d23" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#2d323c" }] },
  { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#3a3f4b" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#0f172a" }] },
  { featureType: "poi", stylers: [{ visibility: "off" }] }
];

const GREY_SCALE_MAP_STYLES = [{ stylers: [{ saturation: -100 }] }];

let googleMapsLoadPromise = null;

function loadGoogleMaps(apiKey) {
  if (window.google?.maps) {
    return Promise.resolve(window.google.maps);
  }
  if (googleMapsLoadPromise) {
    return googleMapsLoadPromise;
  }
  googleMapsLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&loading=async`;
    script.async = true;
    script.defer = true;
    script.onload = () => {
      const waitForMaps = (attemptsLeft = 40) => {
        if (window.google?.maps?.Map) {
          resolve(window.google.maps);
          return;
        }
        if (attemptsLeft <= 0) {
          reject(new Error("Google Maps failed to load"));
          return;
        }
        setTimeout(() => waitForMaps(attemptsLeft - 1), 100);
      };
      waitForMaps();
    };
    script.onerror = () => reject(new Error("Google Maps script failed to load"));
    document.head.appendChild(script);
  });
  return googleMapsLoadPromise;
}

function fallbackTileUrl(showAerial, darkMode, greyScale) {
  if (showAerial) {
    return "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
  }
  if (greyScale) {
    return "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}";
  }
  if (darkMode) {
    return "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";
  }
  return "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
}

function fallbackAttribution(showAerial, greyScale) {
  if (showAerial) {
    return "Tiles © Esri — Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community";
  }
  if (greyScale) {
    return "Tiles © Esri — Source: Esri, DeLorme, NAVTEQ";
  }
  return undefined;
}

function useGoogleMapsApiKey() {
  const envKey = process.env.REACT_APP_GOOGLE_MAPS_API_KEY || "";
  const [apiKey, setApiKey] = useState(envKey);
  const [loaded, setLoaded] = useState(Boolean(envKey));

  useEffect(() => {
    if (envKey) {
      setApiKey(envKey);
      setLoaded(true);
      return;
    }

    let cancelled = false;
    fetch("/api/config")
      .then(res => (res.ok ? res.json() : null))
      .then(data => {
        if (cancelled) return;
        const key = data?.googleMapsApiKey || "";
        setApiKey(key);
        setLoaded(true);
      })
      .catch(() => {
        if (!cancelled) setLoaded(true);
      });

    return () => {
      cancelled = true;
    };
  }, [envKey]);

  return { apiKey, loaded };
}

function FallbackTileLayer({ showAerial, darkMode, greyScale }) {
  return (
    <TileLayer
      url={fallbackTileUrl(showAerial, darkMode, greyScale)}
      attribution={fallbackAttribution(showAerial, greyScale)}
    />
  );
}

function GoogleMapLayer({ apiKey, showAerial, darkMode, greyScale, onReady, onError }) {
  const map = useMap();

  useEffect(() => {
    if (!apiKey) {
      onError?.("Google Maps API key is not configured.");
      return undefined;
    }

    let layer = null;
    let cancelled = false;

    loadGoogleMaps(apiKey)
      .then(() => {
        if (cancelled) return;

        if (typeof GoogleMutant !== "function") {
          throw new Error("Leaflet Google Mutant plugin is not available");
        }

        const options = {
          type: showAerial ? "hybrid" : "roadmap",
          maxZoom: 21
        };
        if (!showAerial) {
          if (greyScale) {
            options.styles = GREY_SCALE_MAP_STYLES;
          } else if (darkMode) {
            options.styles = DARK_MAP_STYLES;
          }
        }

        layer = new GoogleMutant(options);
        layer.addTo(map);
        onReady?.();
      })
      .catch(err => {
        console.error("Google Maps layer failed:", err);
        onError?.(err.message || "Google Maps failed to load");
      });

    return () => {
      cancelled = true;
      if (layer) {
        map.removeLayer(layer);
      }
    };
  }, [apiKey, map, showAerial, darkMode, greyScale, onReady, onError]);

  return null;
}

/** Google Maps base layer when an API key is available; otherwise OSM/Esri fallback. */
export default function MapBaseLayer({ showAerial = false, darkMode = false, greyScale = false }) {
  const { apiKey, loaded } = useGoogleMapsApiKey();
  const [googleReady, setGoogleReady] = useState(false);
  const [googleFailed, setGoogleFailed] = useState(false);

  const handleReady = useCallback(() => {
    setGoogleReady(true);
    setGoogleFailed(false);
  }, []);

  const handleError = useCallback(() => {
    setGoogleReady(false);
    setGoogleFailed(true);
  }, []);

  useEffect(() => {
    setGoogleReady(false);
    setGoogleFailed(false);
  }, [apiKey, showAerial, darkMode, greyScale]);

  const useGoogle = Boolean(apiKey) && !googleFailed;
  const showFallback = !loaded || !useGoogle || !googleReady;

  return (
    <>
      {showFallback && <FallbackTileLayer showAerial={showAerial} darkMode={darkMode} greyScale={greyScale} />}
      {loaded && useGoogle && (
        <GoogleMapLayer
          apiKey={apiKey}
          showAerial={showAerial}
          darkMode={darkMode}
          greyScale={greyScale}
          onReady={handleReady}
          onError={handleError}
        />
      )}
    </>
  );
}

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import Papa from "papaparse";
import proj4 from "proj4";
import JSZip from "jszip";
import { kml } from "@tmcw/togeojson";

proj4.defs("EPSG:28356", "+proj=utm +zone=56 +south +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs");

const AadtMapContext = createContext(null);

export function AadtMapProvider({
  children,
  darkMode,
  onToggleDarkMode,
  onSelectSite,
  showAerial,
  onShowAerialChange,
  greyScale,
  onGreyScaleChange,
  showMarkers: showMarkersProp,
  onShowMarkersChange
}) {
  const [sites, setSites] = useState([]);
  const [sitesLoading, setSitesLoading] = useState(true);
  const [goldCoastLoading, setGoldCoastLoading] = useState(false);
  const [oversizeLoading, setOversizeLoading] = useState(false);
  const [showMarkersInternal, setShowMarkersInternal] = useState(false);
  const showMarkers = showMarkersProp ?? showMarkersInternal;
  const setShowMarkers = onShowMarkersChange ?? setShowMarkersInternal;
  const [showGoldCoastCounts, setShowGoldCoastCounts] = useState(false);
  const [goldCoastCounts, setGoldCoastCounts] = useState([]);
  const [goldCoastGrowth, setGoldCoastGrowth] = useState(3);
  const [searchAddress, setSearchAddress] = useState("");
  const [searchError, setSearchError] = useState("");
  const [searchLoading, setSearchLoading] = useState(false);
  const [locationLoading, setLocationLoading] = useState(false);
  const [center, setCenter] = useState([-27.96, 153.41]);
  const [bounds, setBounds] = useState(null);
  const [zoom, setZoom] = useState(12);
  const viewportSetByUserRef = useRef(false);

  const setMapViewport = useCallback((nextCenter, nextZoom) => {
    setCenter(nextCenter);
    setZoom(nextZoom);
  }, []);

  const clearBounds = useCallback(() => setBounds(null), []);
  const [showOversizeRoutes, setShowOversizeRoutes] = useState(false);
  const [oversizeRoutes, setOversizeRoutes] = useState([]);

  useEffect(() => {
    setSitesLoading(true);
    fetch("/api/sites")
      .then(res => {
        if (!res.ok) {
          throw new Error(`Failed to load sites (${res.status}). Is the backend running on port 1357?`);
        }
        return res.json();
      })
      .then(setSites)
      .catch(err => console.error(err))
      .finally(() => setSitesLoading(false));
  }, []);

  useEffect(() => {
    if (showGoldCoastCounts && goldCoastCounts.length === 0) {
      setGoldCoastLoading(true);
      fetch("/api/goldcoast-traffic-counts-csv")
        .then(res => res.text())
        .then(text => {
          const parsed = Papa.parse(text, { header: true, skipEmptyLines: true });
          const features = parsed.data
            .map(obj => {
              const x = parseFloat(obj.x);
              const y = parseFloat(obj.y);
              if (!isFinite(x) || !isFinite(y)) return null;
              const [lon, lat] = proj4("EPSG:28356", "WGS84", [x, y]);
              if (!isFinite(lat) || !isFinite(lon)) return null;
              return { ...obj, lat, lon };
            })
            .filter(Boolean);
          setGoldCoastCounts(features);
        })
        .catch(err => console.error("Failed to load Gold Coast counts:", err))
        .finally(() => setGoldCoastLoading(false));
    }
  }, [showGoldCoastCounts, goldCoastCounts.length]);

  useEffect(() => {
    if (showOversizeRoutes && oversizeRoutes.length === 0) {
      setOversizeLoading(true);
      fetch("/api/oversize-routes.kmz")
        .then(res => res.arrayBuffer())
        .then(JSZip.loadAsync)
        .then(zip => {
          const kmlFile = Object.keys(zip.files).find(name => name.endsWith(".kml"));
          if (!kmlFile) throw new Error("No KML file found in KMZ");
          return zip.files[kmlFile].async("string");
        })
        .then(kmlText => {
          const dom = new window.DOMParser().parseFromString(kmlText, "text/xml");
          const geojson = kml(dom);
          setOversizeRoutes(geojson.features || []);
        })
        .catch(err => console.error("Failed to load oversize routes:", err))
        .finally(() => setOversizeLoading(false));
    }
  }, [showOversizeRoutes, oversizeRoutes.length]);

  const applyMapLocation = useCallback((lat, lon, nextZoom = 13) => {
    viewportSetByUserRef.current = true;
    setCenter([lat, lon]);
    setZoom(nextZoom);
    setBounds(null);
  }, []);

  const goToUserLocation = useCallback(
    (silent = false) => {
      if (!navigator.geolocation) {
        if (!silent) setSearchError("Location is not available in this browser.");
        return;
      }
      if (!silent) {
        setSearchError("");
        setLocationLoading(true);
      }
      navigator.geolocation.getCurrentPosition(
        pos => {
          if (silent && viewportSetByUserRef.current) return;
          if (silent) {
            setCenter([pos.coords.latitude, pos.coords.longitude]);
            setZoom(13);
            setBounds(null);
          } else {
            applyMapLocation(pos.coords.latitude, pos.coords.longitude);
          }
          if (!silent) {
            setSearchError("");
            setLocationLoading(false);
          }
        },
        err => {
          if (!silent) {
            setSearchError(
              err.code === 1
                ? "Location permission denied."
                : "Could not get your location. Try searching by address."
            );
            setLocationLoading(false);
          }
        },
        { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 }
      );
    },
    [applyMapLocation]
  );

  useEffect(() => {
    goToUserLocation(true);
  }, [goToUserLocation]);

  const handleSearch = async e => {
    e.preventDefault();
    setSearchError("");
    if (!searchAddress.trim()) return;
    viewportSetByUserRef.current = true;
    setSearchLoading(true);
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchAddress)}`;
    try {
      const res = await fetch(url);
      const data = await res.json();
      if (data?.length > 0) {
        const { lat, lon, boundingbox } = data[0];
        if (boundingbox) {
          setBounds([
            [parseFloat(boundingbox[0]), parseFloat(boundingbox[2])],
            [parseFloat(boundingbox[1]), parseFloat(boundingbox[3])]
          ]);
        } else {
          applyMapLocation(parseFloat(lat), parseFloat(lon), 15);
        }
        setSearchError("");
      } else {
        setSearchError("Address not found. Please try a different search.");
      }
    } catch {
      setSearchError("Error searching for address. Please try again later.");
    } finally {
      setSearchLoading(false);
    }
  };

  const value = {
    darkMode,
    onToggleDarkMode,
    onSelectSite,
    sites,
    sitesLoading,
    goldCoastLoading,
    oversizeLoading,
    showMarkers,
    setShowMarkers,
    showGoldCoastCounts,
    setShowGoldCoastCounts,
    goldCoastCounts,
    goldCoastGrowth,
    setGoldCoastGrowth,
    searchAddress,
    setSearchAddress,
    searchError,
    searchLoading,
    locationLoading,
    handleSearch,
    goToUserLocation: () => goToUserLocation(false),
    center,
    bounds,
    zoom,
    setMapViewport,
    clearBounds,
    setBounds,
    showOversizeRoutes,
    setShowOversizeRoutes,
    oversizeRoutes,
    showAerial,
    setShowAerial: onShowAerialChange,
    greyScale,
    setGreyScale: onGreyScaleChange
  };

  return <AadtMapContext.Provider value={value}>{children}</AadtMapContext.Provider>;
}

export function useAadtMap() {
  const ctx = useContext(AadtMapContext);
  if (!ctx) throw new Error("useAadtMap must be used within AadtMapProvider");
  return ctx;
}

import { useEffect, useRef, useState } from "react";
import { bboxContains, expandBbox } from "./viewportBuffer";

/**
 * Load the visible viewport first, then prefetch a padded area so small pans
 * reuse data instead of refetching. The blocking overlay is only shown on the
 * first load or when the cache key (filters / zoom bucket) changes.
 */
export function useBufferedViewportFetch({
  viewport,
  enabled = true,
  cacheKey = "",
  fetchPoints,
  padRatio = 0.75,
  debounceMs = 220,
  edgeRatio = 0.22
}) {
  const [points, setPoints] = useState([]);
  const [loading, setLoading] = useState(false);
  const [extra, setExtra] = useState(null);

  const [debouncedViewport, setDebouncedViewport] = useState(viewport);
  const loadedRef = useRef(null);
  const controllerRef = useRef(null);
  const fetchPointsRef = useRef(fetchPoints);
  const viewportRef = useRef(viewport);
  const cacheKeyRef = useRef(cacheKey);
  const preloadTimerRef = useRef(null);

  fetchPointsRef.current = fetchPoints;
  viewportRef.current = viewport;
  cacheKeyRef.current = cacheKey;

  useEffect(() => {
    if (!viewport) {
      setDebouncedViewport(null);
      return undefined;
    }
    const timer = setTimeout(() => setDebouncedViewport(viewport), debounceMs);
    return () => clearTimeout(timer);
  }, [viewport, debounceMs]);

  useEffect(() => {
    return () => {
      controllerRef.current?.abort();
      if (preloadTimerRef.current) clearTimeout(preloadTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!enabled || !debouncedViewport) {
      controllerRef.current?.abort();
      controllerRef.current = null;
      loadedRef.current = null;
      if (preloadTimerRef.current) {
        clearTimeout(preloadTimerRef.current);
        preloadTimerRef.current = null;
      }
      setPoints([]);
      setExtra(null);
      setLoading(false);
      return undefined;
    }

    const loaded = loadedRef.current;
    const keyChanged = !loaded || loaded.cacheKey !== cacheKey;
    const inside = !keyChanged && bboxContains(loaded.bbox, debouncedViewport);
    const comfortablyInside =
      inside && bboxContains(loaded.bbox, debouncedViewport, edgeRatio);

    if (comfortablyInside) {
      setLoading(false);
      return undefined;
    }

    const blocking = keyChanged || !loaded;
    const fetchBbox = blocking ? debouncedViewport : expandBbox(debouncedViewport, padRatio);

    controllerRef.current?.abort();
    if (preloadTimerRef.current) {
      clearTimeout(preloadTimerRef.current);
      preloadTimerRef.current = null;
    }
    const controller = new AbortController();
    controllerRef.current = controller;
    let active = true;

    if (blocking) setLoading(true);
    else setLoading(false);

    fetchPointsRef
      .current(fetchBbox, { signal: controller.signal })
      .then(result => {
        if (!active || controller.signal.aborted) return;
        const nextPoints = result?.points || [];
        const reservedBbox = blocking
          ? expandBbox(viewportRef.current || debouncedViewport, padRatio)
          : fetchBbox;
        loadedRef.current = {
          bbox: reservedBbox,
          cacheKey: cacheKeyRef.current
        };
        setPoints(nextPoints);
        setExtra(result || null);

        if (blocking) {
          const padded = expandBbox(viewportRef.current || debouncedViewport, padRatio);
          preloadTimerRef.current = setTimeout(() => {
            if (!active || controllerRef.current !== controller) return;
            const preloadController = new AbortController();
            controllerRef.current = preloadController;
            fetchPointsRef
              .current(padded, { signal: preloadController.signal })
              .then(preloaded => {
                if (!active || preloadController.signal.aborted) return;
                loadedRef.current = {
                  bbox: padded,
                  cacheKey: cacheKeyRef.current
                };
                setPoints(preloaded?.points || []);
                setExtra(preloaded || null);
              })
              .catch(err => {
                if (!active || preloadController.signal.aborted || err?.name === "AbortError") return;
                console.error(err);
              });
          }, 40);
        }
      })
      .catch(err => {
        if (!active || controller.signal.aborted || err?.name === "AbortError") return;
        console.error(err);
        if (blocking) {
          setPoints([]);
          setExtra({ error: true, message: err?.message || "Failed to load map data." });
          loadedRef.current = null;
        }
      })
      .finally(() => {
        if (active && blocking) setLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
      if (preloadTimerRef.current) {
        clearTimeout(preloadTimerRef.current);
        preloadTimerRef.current = null;
      }
    };
  }, [cacheKey, debouncedViewport, edgeRatio, enabled, padRatio]);

  return { points, loading, extra, viewport: debouncedViewport };
}

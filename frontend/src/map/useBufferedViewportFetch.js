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
      loadedRef.current = null;
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

    if (comfortablyInside) return undefined;

    const blocking = keyChanged || !loaded;
    const fetchBbox = blocking ? debouncedViewport : expandBbox(debouncedViewport, padRatio);

    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;

    if (blocking) setLoading(true);

    fetchPointsRef
      .current(fetchBbox, { signal: controller.signal })
      .then(result => {
        if (controller.signal.aborted) return;
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
        if (blocking) setLoading(false);

        if (blocking) {
          const padded = expandBbox(viewportRef.current || debouncedViewport, padRatio);
          if (preloadTimerRef.current) clearTimeout(preloadTimerRef.current);
          preloadTimerRef.current = setTimeout(() => {
            if (controllerRef.current !== controller) return;
            const preloadController = new AbortController();
            controllerRef.current = preloadController;
            fetchPointsRef
              .current(padded, { signal: preloadController.signal })
              .then(preloaded => {
                if (preloadController.signal.aborted) return;
                loadedRef.current = {
                  bbox: padded,
                  cacheKey: cacheKeyRef.current
                };
                setPoints(preloaded?.points || []);
                setExtra(preloaded || null);
              })
              .catch(err => {
                if (err?.name !== "AbortError") console.error(err);
              });
          }, 40);
        }
      })
      .catch(err => {
        if (err?.name === "AbortError" || controller.signal.aborted) return;
        if (blocking) {
          setPoints([]);
          setExtra({ error: true, message: err?.message || "Failed to load map data." });
          setLoading(false);
          loadedRef.current = null;
        }
      });

    return () => {
      controller.abort();
    };
  }, [cacheKey, debouncedViewport, edgeRatio, enabled, padRatio]);

  return { points, loading, extra, viewport: debouncedViewport };
}

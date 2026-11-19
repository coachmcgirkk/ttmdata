import React from "react";
import { useAadtMap } from "../context/AadtMapContext";

function MapSearchBar() {
  const {
    searchAddress,
    setSearchAddress,
    searchError,
    searchLoading,
    handleSearch,
    goToUserLocation,
    locationLoading
  } = useAadtMap();

  return (
    <form className="map-search-bar" onSubmit={handleSearch}>
      <label className="map-search-label" htmlFor="map-search-input">
        Reposition map
      </label>
      <div className="map-search-controls">
        <input
          id="map-search-input"
          type="text"
          className="map-search-input"
          placeholder="Address or place name"
          value={searchAddress}
          onChange={e => setSearchAddress(e.target.value)}
          disabled={searchLoading || locationLoading}
        />
        <button
          type="button"
          className="map-search-btn map-search-btn-icon"
          onClick={goToUserLocation}
          disabled={searchLoading || locationLoading}
          title="Go to my location"
          aria-label="Go to my location"
        >
          {locationLoading ? "…" : "◎"}
        </button>
        <button
          type="submit"
          className="map-search-btn map-search-btn-primary"
          disabled={searchLoading || locationLoading}
        >
          {searchLoading ? "Searching…" : "Go"}
        </button>
      </div>
      {searchError && (
        <div className="map-search-error" role="alert">
          {searchError}
        </div>
      )}
    </form>
  );
}

export default MapSearchBar;

import React from "react";

const DATA_SOURCES = [
  {
    label: "AADT",
    href: "https://www.data.qld.gov.au/dataset/traffic-census-for-the-queensland-state-declared-road-network/resource/dd96f1cd-f7ee-4c00-b5bc-2eb4f0b16952"
  },
  {
    label: "Hourly volumes",
    href: "https://www.data.qld.gov.au/dataset/queensland-traffic-data-averaged-by-hour-of-day-and-day-of-week/resource/e10dd7b1-b521-4267-b946-66c2c1b98fd3"
  },
  {
    label: "Crash data",
    href: "https://www.data.qld.gov.au/dataset/crash-data-from-queensland-roads/resource/e88943c0-5968-4972-a15f-38e120d72ec0"
  },
  {
    label: "Chainage",
    href: "https://www.data.qld.gov.au/dataset/road-location-and-traffic-data/resource/daab3617-077f-450a-a1c0-57c26d8ba47c"
  }
];

function MapOptionsPanel({ darkMode, onDarkModeChange, showAerial, onShowAerialChange }) {
  return (
    <div className="map-options">
      <div className="map-options-appearance" role="group" aria-label="Light or dark">
        <button
          type="button"
          className={`map-options-choice${!darkMode ? " is-on" : ""}`}
          aria-pressed={!darkMode}
          onClick={() => onDarkModeChange(false)}
        >
          Light
        </button>
        <button
          type="button"
          className={`map-options-choice${darkMode ? " is-on" : ""}`}
          aria-pressed={darkMode}
          onClick={() => onDarkModeChange(true)}
        >
          Dark
        </button>
      </div>
      <label className="map-options-aerial">
        <input
          type="checkbox"
          checked={showAerial}
          onChange={e => onShowAerialChange(e.target.checked)}
        />
        Aerial
      </label>
    </div>
  );
}

export function DisclaimerPanel() {
  return (
    <div className="nav-disclaimer-panel">
      <p>
        These layers are scraped from Queensland Government open data. Confirm a figure against the source before using it.
      </p>
      <ul>
        {DATA_SOURCES.map(source => (
          <li key={source.label}>
            <a href={source.href} target="_blank" rel="noopener noreferrer">
              {source.label}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default MapOptionsPanel;

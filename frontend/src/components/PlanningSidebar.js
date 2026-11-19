import React, { useEffect, useRef, useState } from "react";
import {
  applyImportedPlanningPlan,
  createWorkArea,
  downloadPlanningPlan,
  parseImportedPlanningPlan,
  workAreaDisplayName
} from "../planningUtils";

function PlanningSidebar({ state, onStateChange, loading, resultInfo }) {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [importMessage, setImportMessage] = useState("");
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (searchQuery.trim().length < 2) {
      setSearchResults([]);
      return undefined;
    }
    const timer = setTimeout(() => {
      setSearchLoading(true);
      fetch(`/api/chainage/sections/search?q=${encodeURIComponent(searchQuery.trim())}&limit=12`)
        .then(res => res.json())
        .then(data => setSearchResults(data.sections || []))
        .catch(() => setSearchResults([]))
        .finally(() => setSearchLoading(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const updateWorkArea = (id, field, value) => {
    onStateChange({
      ...state,
      workAreas: state.workAreas.map(wa => (wa.id === id ? { ...wa, [field]: value } : wa))
    });
  };

  const startPick = (workAreaId, field) => {
    onStateChange({
      ...state,
      pickMode: { workAreaId, field }
    });
  };

  const cancelPick = () => {
    onStateChange({ ...state, pickMode: null });
  };

  const addWorkArea = () => {
    const newArea = createWorkArea({ name: `Area ${state.workAreas.length + 1}` });
    onStateChange({
      ...state,
      workAreas: [...state.workAreas, newArea],
      pickMode: { workAreaId: newArea.id, field: "chainageFrom" }
    });
  };

  const removeWorkArea = id => {
    if (state.workAreas.length <= 1) return;
    const clearingPick = state.pickMode?.workAreaId === id;
    onStateChange({
      ...state,
      workAreas: state.workAreas.filter(wa => wa.id !== id),
      pickMode: clearingPick ? null : state.pickMode
    });
  };

  const selectSection = section => {
    onStateChange({
      ...state,
      roadSectionId: section.roadSectionId,
      carriageway: section.carriageway,
      roadDescription: section.description || section.roadName,
      sectionChainageMin: section.chainageMin ?? null,
      sectionChainageMax: section.chainageMax ?? null
    });
    setSearchQuery("");
    setSearchResults([]);
  };

  const isPicking = (workAreaId, field) =>
    state.pickMode?.workAreaId === workAreaId && state.pickMode?.field === field;

  const handleExport = () => {
    setImportMessage("");
    downloadPlanningPlan(state);
  };

  const handleImportClick = () => {
    setImportMessage("");
    fileInputRef.current?.click();
  };

  const handleImportFile = event => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const imported = parseImportedPlanningPlan(String(reader.result ?? ""));
        onStateChange(applyImportedPlanningPlan(state, imported));
        setImportMessage(`Imported ${imported.workAreas.length} work area(s) from ${file.name}.`);
      } catch (err) {
        setImportMessage(err.message || "Failed to import planning file.");
      }
    };
    reader.onerror = () => setImportMessage("Could not read the selected file.");
    reader.readAsText(file);
  };

  return (
    <div className="nav-section-body">
      <div className="nav-block">
        <label className="nav-check">
          <input
            type="checkbox"
            checked={state.showOnMap}
            onChange={e => onStateChange({ ...state, showOnMap: e.target.checked })}
          />
          Show work areas on map
        </label>
        <label className="nav-check">
          <input
            type="checkbox"
            checked={state.showChainage}
            onChange={e => onStateChange({ ...state, showChainage: e.target.checked })}
          />
          Show chainage points
        </label>
        <label className="nav-check">
          <input
            type="checkbox"
            checked={state.showWorkAreaTooltips}
            onChange={e => onStateChange({ ...state, showWorkAreaTooltips: e.target.checked })}
          />
          Work area tooltips
        </label>
        <div className="nav-muted">
          Define work areas using TMR chainage markers. Chainage dots appear when picking start/finish
          or when the chainage toggle is on. Approach signage extends from both ends of each work area.
        </div>
      </div>

      <div className="nav-block">
        <div className="nav-block-title">Import / export</div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json,application/json"
          className="planning-file-input"
          onChange={handleImportFile}
        />
        <div className="planning-io-buttons">
          <button type="button" className="nav-btn nav-btn-small" onClick={handleImportClick}>
            Import JSON
          </button>
          <button type="button" className="nav-btn nav-btn-small nav-btn-primary" onClick={handleExport}>
            Export JSON
          </button>
        </div>
        {importMessage && (
          <div
            className={`planning-import-message${
              importMessage.startsWith("Imported") ? " planning-import-ok" : " planning-import-error"
            }`}
          >
            {importMessage}
          </div>
        )}
        <div className="nav-muted">
          Save or load road section details and work areas as a JSON file.
        </div>
      </div>

      <div className="nav-block">
        <div className="nav-block-title">Road section</div>
        <input
          className="nav-input"
          type="text"
          placeholder="Search road name or section ID"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
        />
        {searchLoading && <div className="nav-muted">Searching roads…</div>}
        {searchResults.length > 0 && (
          <div className="planning-search-results">
            {searchResults.map(section => (
              <button
                key={`${section.roadSectionId}-${section.carriageway}`}
                type="button"
                className="planning-search-item"
                onClick={() => selectSection(section)}
              >
                <strong>{section.roadName || section.description}</strong>
                <span>
                  Section {section.roadSectionId} · CW {section.carriageway} ·{" "}
                  {section.chainageMin?.toFixed?.(1)}–{section.chainageMax?.toFixed?.(1)} km
                </span>
              </button>
            ))}
          </div>
        )}
        <label className="nav-check nav-check-small">
          Road section ID
          <input
            className="nav-input nav-input-small planning-input-wide"
            type="text"
            value={state.roadSectionId}
            onChange={e => onStateChange({ ...state, roadSectionId: e.target.value })}
          />
        </label>
        <label className="nav-check nav-check-small">
          Carriageway
          <input
            className="nav-input nav-input-small"
            type="text"
            value={state.carriageway}
            onChange={e => onStateChange({ ...state, carriageway: e.target.value })}
          />
        </label>
        {state.roadDescription && (
          <div className="nav-muted planning-road-desc">{state.roadDescription}</div>
        )}
        <button
          type="button"
          className="nav-btn nav-btn-small nav-btn-primary planning-zoom-btn"
          disabled={!state.roadSectionId?.trim() || !state.carriageway?.trim()}
          onClick={() =>
            onStateChange({
              ...state,
              mapFitToken: (state.mapFitToken || 0) + 1
            })
          }
        >
          Zoom to
        </button>
      </div>

      <div className="nav-block">
        <div className="nav-block-title">Work areas</div>
        {state.pickMode && (
          <div className="planning-pick-hint">
            <span>
              {state.pickMode.field === "chainageFrom"
                ? "Chainage markers are shown on the map — click one for the work area start."
                : "Click a chainage marker on the map for the work area finish."}
            </span>
            <button type="button" className="nav-btn nav-btn-small" onClick={cancelPick}>
              Cancel
            </button>
          </div>
        )}
        <div className="planning-work-areas">
          {state.workAreas.map((wa, idx) => (
            <div
              key={wa.id}
              className={`planning-work-area-row${
                state.pickMode?.workAreaId === wa.id ? " planning-work-area-row-active" : ""
              }`}
            >
              <div className="planning-work-area-header">
                <strong>{workAreaDisplayName(wa, idx)}</strong>
                {state.workAreas.length > 1 && (
                  <button
                    type="button"
                    className="nav-btn nav-btn-small"
                    onClick={() => removeWorkArea(wa.id)}
                  >
                    Remove
                  </button>
                )}
              </div>
              <label className="planning-field">
                Name
                <input
                  className="nav-input"
                  type="text"
                  placeholder={`Area ${idx + 1}`}
                  value={wa.name ?? ""}
                  onChange={e => updateWorkArea(wa.id, "name", e.target.value)}
                />
              </label>
              <label className="planning-field">
                Chainage from (km)
                <div className="planning-field-row">
                  <input
                    className="nav-input"
                    type="number"
                    step="0.001"
                    min="0"
                    value={wa.chainageFrom}
                    onChange={e => updateWorkArea(wa.id, "chainageFrom", e.target.value)}
                  />
                  <button
                    type="button"
                    className={`nav-btn nav-btn-small planning-pick-btn${
                      isPicking(wa.id, "chainageFrom") ? " planning-pick-btn-active" : ""
                    }`}
                    onClick={() => startPick(wa.id, "chainageFrom")}
                  >
                    Pick
                  </button>
                </div>
              </label>
              <label className="planning-field">
                Chainage to (km)
                <div className="planning-field-row">
                  <input
                    className="nav-input"
                    type="number"
                    step="0.001"
                    min="0"
                    value={wa.chainageTo}
                    onChange={e => updateWorkArea(wa.id, "chainageTo", e.target.value)}
                  />
                  <button
                    type="button"
                    className={`nav-btn nav-btn-small planning-pick-btn${
                      isPicking(wa.id, "chainageTo") ? " planning-pick-btn-active" : ""
                    }`}
                    onClick={() => startPick(wa.id, "chainageTo")}
                  >
                    Pick
                  </button>
                </div>
              </label>
              <label className="planning-field">
                Approach signage (km)
                <input
                  className="nav-input"
                  type="number"
                  step="0.05"
                  min="0"
                  value={wa.approachSignageLength}
                  onChange={e => updateWorkArea(wa.id, "approachSignageLength", e.target.value)}
                />
              </label>
            </div>
          ))}
        </div>
        <button type="button" className="nav-btn nav-btn-primary" onClick={addWorkArea}>
          Add work area
        </button>
      </div>

      <div className="nav-block">
        {loading ? (
          <div className="nav-muted">Loading TMR chainage for road…</div>
        ) : (
          <div className="nav-result-info">
            {resultInfo?.message ||
              (resultInfo?.returned
                ? `${resultInfo.returned.toLocaleString()} chainage points loaded — click markers to set start/finish`
                : "Select a road section, then pick chainage markers on the map")}
          </div>
        )}
      </div>
    </div>
  );
}

export default PlanningSidebar;

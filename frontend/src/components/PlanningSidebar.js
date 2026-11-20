import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  beginChainagePick,
  createProject,
  createSite,
  exportPlanning,
  findOverlaps,
  formatChainage,
  formatDate,
  formatLength,
  importPlanning,
  isPicking,
  planningModalVisible,
  projectLabel,
  selectPlanningProject,
  setPlanningEditor,
  siteLabel,
  timelineExtent,
  updateProject,
  updateSite
} from "../planningModel";

function PlanningEditorModal({ state, onStateChange, darkMode }) {
  const [queries, setQueries] = useState({});
  const [results, setResults] = useState({});
  const visible = planningModalVisible(state);
  const active = state.projects.find(project => project.id === state.activeProjectId) || state.projects[0];

  useEffect(() => {
    if (!visible) return undefined;
    const controller = new AbortController();
    let activeSearch = true;
    const timers = Object.entries(queries).map(([siteId, query]) => {
      const text = (query || "").trim();
      if (text.length < 2) return null;
      return setTimeout(() => {
        const params = new URLSearchParams({ q: text, limit: "8" });
        fetch(`/api/chainage/sections/search?${params.toString()}`, { signal: controller.signal })
          .then(res => res.json())
          .then(data => {
            if (!activeSearch) return;
            setResults(prev => ({ ...prev, [siteId]: data.sections || [] }));
          })
          .catch(err => {
            if (!activeSearch || err.name === "AbortError") return;
            setResults(prev => ({ ...prev, [siteId]: [] }));
          });
      }, 250);
    }).filter(Boolean);
    return () => {
      activeSearch = false;
      timers.forEach(timer => clearTimeout(timer));
      controller.abort();
    };
  }, [queries, visible]);

  function setQuery(siteId, value) {
    setQueries(prev => ({ ...prev, [siteId]: value }));
    if (value.trim().length < 2) setResults(prev => ({ ...prev, [siteId]: [] }));
  }

  function requestPick(site, field) {
    if (!active) return;
    onStateChange(beginChainagePick(state, {
      projectId: active.id,
      siteId: site.id,
      field
    }));
  }

  function chooseRoad(site, section) {
    if (!active) return;
    onStateChange(updateSite(state, active.id, site.id, {
      roadSectionId: section.roadSectionId,
      carriageway: section.carriageway,
      roadDescription: section.description || section.roadName || ""
    }));
    setQuery(site.id, "");
  }

  function addSite() {
    if (!active || isPicking(state)) return;
    onStateChange(updateProject(state, active.id, { sites: [...active.sites, createSite()] }));
  }

  function removeSite(site) {
    if (!active || isPicking(state)) return;
    onStateChange({
      ...updateProject(state, active.id, {
        sites: active.sites.filter(item => item.id !== site.id)
      }),
      pick: null
    });
  }

  if (!visible || !active) return null;

  return createPortal(
    <div className={darkMode ? "app-shell-dark" : undefined}>
      <div className="planning-modal-backdrop" role="presentation">
        <div
          className="planning-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="planning-editor-title"
        >
          <div className="planning-modal-head">
            <h2 id="planning-editor-title">Edit project</h2>
            <button
              type="button"
              className="nav-btn nav-btn-small"
              onClick={() => onStateChange(setPlanningEditor(state, false))}
            >
              Close
            </button>
          </div>
          <label className="planning-label">
            Project name
            <input
              className="nav-input"
              value={active.name}
              aria-label="Project name"
              onChange={event => onStateChange(updateProject(state, active.id, { name: event.target.value }))}
            />
          </label>
          {active.sites.map(site => {
            const matches = results[site.id] || [];
            return (
              <div key={site.id} className="planning-site">
                <div className="planning-site-head">
                  <input
                    className="nav-input"
                    value={site.name}
                    placeholder="Site name"
                    aria-label="Site name"
                    onChange={event => onStateChange(updateSite(state, active.id, site.id, { name: event.target.value }))}
                  />
                  <button type="button" className="nav-btn nav-btn-small" onClick={() => removeSite(site)}>Remove</button>
                </div>
                <label className="planning-label">
                  Typical details
                  <textarea
                    className="nav-input planning-textarea"
                    value={site.details}
                    placeholder="Signs, speeds, or other typical details"
                    onChange={event => onStateChange(updateSite(state, active.id, site.id, { details: event.target.value }))}
                  />
                </label>
                <label className="planning-label">
                  TMR road
                  <input
                    className="nav-input"
                    value={queries[site.id] || ""}
                    placeholder="Search road name or section"
                    autoComplete="off"
                    onChange={event => setQuery(site.id, event.target.value)}
                  />
                </label>
                {matches.length ? (
                  <ul className="planning-results">
                    {matches.map(section => (
                      <li key={`${section.roadSectionId}-${section.carriageway}`}>
                        <button type="button" onClick={() => chooseRoad(site, section)}>
                          {section.roadName || section.description} · {section.roadSectionId} / {section.carriageway}
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
                <div className="nav-muted" title={site.roadDescription || ""}>
                  {site.roadSectionId
                    ? `${site.roadDescription || "Selected road"} · ${site.roadSectionId} / ${site.carriageway}`
                    : "Search for a road, or pick a chainage on the map."}
                </div>
                <div className="planning-split">
                  <label className="planning-label">
                    Section
                    <input
                      className="nav-input"
                      value={site.roadSectionId}
                      onChange={event => onStateChange(updateSite(state, active.id, site.id, { roadSectionId: event.target.value }))}
                    />
                  </label>
                  <label className="planning-label">
                    Carriageway
                    <input
                      className="nav-input"
                      value={site.carriageway}
                      onChange={event => onStateChange(updateSite(state, active.id, site.id, { carriageway: event.target.value }))}
                    />
                  </label>
                </div>
                <label className="planning-label">
                  Start chainage (km)
                  <span className="planning-field-row">
                    <input
                      className="nav-input"
                      inputMode="decimal"
                      value={site.chainageFrom}
                      onChange={event => onStateChange(updateSite(state, active.id, site.id, { chainageFrom: event.target.value }))}
                    />
                    <button
                      type="button"
                      className="nav-btn nav-btn-small planning-pick-btn"
                      onClick={() => requestPick(site, "chainageFrom")}
                    >
                      Pick
                    </button>
                  </span>
                </label>
                <label className="planning-label">
                  Finish chainage (km)
                  <span className="planning-field-row">
                    <input
                      className="nav-input"
                      inputMode="decimal"
                      value={site.chainageTo}
                      onChange={event => onStateChange(updateSite(state, active.id, site.id, { chainageTo: event.target.value }))}
                    />
                    <button
                      type="button"
                      className="nav-btn nav-btn-small planning-pick-btn"
                      onClick={() => requestPick(site, "chainageTo")}
                    >
                      Pick
                    </button>
                  </span>
                </label>
                <div className="planning-split">
                  <label className="planning-label">
                    Approach km
                    <input
                      className="nav-input"
                      inputMode="decimal"
                      value={site.approachKm}
                      onChange={event => onStateChange(updateSite(state, active.id, site.id, { approachKm: event.target.value }))}
                    />
                  </label>
                  <label className="planning-label">
                    Departure km
                    <input
                      className="nav-input"
                      inputMode="decimal"
                      value={site.departureKm}
                      onChange={event => onStateChange(updateSite(state, active.id, site.id, { departureKm: event.target.value }))}
                    />
                  </label>
                </div>
                <div className="planning-split">
                  <label className="planning-label">
                    Starts
                    <input
                      className="nav-input"
                      type="date"
                      value={site.startDate}
                      onChange={event => onStateChange(updateSite(state, active.id, site.id, { startDate: event.target.value }))}
                    />
                  </label>
                  <label className="planning-label">
                    Finishes
                    <input
                      className="nav-input"
                      type="date"
                      value={site.endDate}
                      onChange={event => onStateChange(updateSite(state, active.id, site.id, { endDate: event.target.value }))}
                    />
                  </label>
                </div>
                {site.chainageFrom !== "" && site.chainageTo !== "" ? (
                  <div className="nav-muted">
                    Work {formatChainage(site.chainageFrom)}–{formatChainage(site.chainageTo)} km
                  </div>
                ) : null}
              </div>
            );
          })}
          <button type="button" className="nav-btn nav-btn-small" onClick={addSite}>Add site</button>
        </div>
      </div>
    </div>,
    document.body
  );
}

function PlanningSidebar({ state, onStateChange, darkMode }) {
  const [importMessage, setImportMessage] = useState(null);
  const fileRef = useRef(null);
  const active = state.projects.find(project => project.id === state.activeProjectId) || state.projects[0];
  const overlaps = findOverlaps(state.projects, state.timelineDate);
  const conflicts = overlaps.filter(hit => hit.sameTime);
  const separated = overlaps.filter(hit => !hit.sameTime);
  const extent = timelineExtent(state.projects);
  const picking = isPicking(state);

  function centerOnProject() {
    if (!active || picking) return;
    const ready = active.sites.some(site => (
      String(site.roadSectionId).trim()
      && String(site.carriageway).trim()
      && String(site.chainageFrom).trim()
      && String(site.chainageTo).trim()
    ));
    if (!ready) {
      setImportMessage({
        ok: false,
        text: "Add a road and both chainages before centering on this project."
      });
      return;
    }
    onStateChange({
      ...state,
      showOnMap: true,
      centerToken: (state.centerToken || 0) + 1
    });
  }

  function download() {
    const blob = new Blob([JSON.stringify(exportPlanning(state), null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "planning.json";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function onImportFile(event) {
    const file = event.target.files && event.target.files[0];
    event.target.value = "";
    if (!file || picking) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const next = importPlanning(String(reader.result || ""), state);
        const count = next.projects.reduce((sum, project) => sum + project.sites.length, 0);
        onStateChange(next);
        setImportMessage({
          ok: true,
          text: `Imported ${next.projects.length} project${next.projects.length === 1 ? "" : "s"} and ${count} site${count === 1 ? "" : "s"}.`
        });
      } catch (err) {
        setImportMessage({ ok: false, text: err.message || "Could not read that file." });
      }
    };
    reader.readAsText(file);
  }

  function addProject() {
    if (picking) return;
    const project = createProject({ name: `Project ${state.projects.length + 1}` });
    onStateChange({
      ...state,
      projects: [...state.projects, project],
      activeProjectId: project.id,
      editorOpen: true,
      pick: null
    });
  }

  function removeProject() {
    if (!active || picking) return;
    const remaining = state.projects.filter(project => project.id !== active.id);
    if (!remaining.length) {
      const fresh = createProject({ name: "Project 1" });
      onStateChange({
        ...state,
        projects: [fresh],
        activeProjectId: fresh.id,
        pick: null,
        editorOpen: true
      });
      return;
    }
    onStateChange({
      ...state,
      projects: remaining,
      activeProjectId: state.activeProjectId === active.id ? remaining[0].id : state.activeProjectId,
      pick: null
    });
  }

  return (
    <div className="nav-section-body planning-panel">
      <div className="nav-block">
        <label className="nav-check">
          <input
            type="checkbox"
            checked={state.showOnMap}
            onChange={event => {
              const show = event.target.checked;
              onStateChange({
                ...state,
                showOnMap: show,
                pick: show ? state.pick : null,
                editorOpen: !show && state.pick ? true : state.editorOpen
              });
            }}
          />
          Show work areas
        </label>
        <div className="nav-muted">
          {picking
            ? "Click a chainage marker on the map. The project editor returns when that point is chosen."
            : "Edit the project to enter a road, chainage, signage lengths, details, and dates."}
        </div>
      </div>

      <div className="nav-block">
        <div className="planning-io-buttons">
          <button type="button" className="nav-btn nav-btn-small" onClick={download}>Export JSON</button>
          <button
            type="button"
            className="nav-btn nav-btn-small"
            onClick={() => fileRef.current && fileRef.current.click()}
            disabled={picking}
          >
            Import JSON
          </button>
        </div>
        <button type="button" className="nav-btn planning-center-btn" onClick={centerOnProject} disabled={picking}>
          Center over project
        </button>
        <input
          ref={fileRef}
          className="planning-file-input"
          type="file"
          accept=".json,application/json"
          onChange={onImportFile}
        />
        {importMessage ? (
          <div className={`planning-import-message ${importMessage.ok ? "planning-import-ok" : "planning-import-error"}`}>
            {importMessage.text}
          </div>
        ) : null}
      </div>

      <div className="nav-block">
        <div className="nav-block-title">Project</div>
        <select
          className="nav-input"
          value={active ? active.id : ""}
          disabled={picking}
          onChange={event => onStateChange(selectPlanningProject(state, event.target.value))}
        >
          {state.projects.map(project => (
            <option key={project.id} value={project.id}>
              {projectLabel(project)} ({project.sites.length})
            </option>
          ))}
        </select>
        <div className="planning-io-buttons">
          <button type="button" className="nav-btn nav-btn-small" onClick={addProject} disabled={picking}>Add project</button>
          <button type="button" className="nav-btn nav-btn-small" onClick={removeProject} disabled={picking}>Remove</button>
        </div>
        <button
          type="button"
          className="nav-btn planning-center-btn"
          onClick={() => onStateChange(setPlanningEditor(state, true))}
          disabled={picking}
        >
          Edit project
        </button>
        {active ? (
          <ul className="planning-site-summary">
            {active.sites.map(site => (
              <li key={site.id}>{siteLabel(site)}</li>
            ))}
          </ul>
        ) : null}
      </div>

      <PlanningEditorModal state={state} onStateChange={onStateChange} darkMode={darkMode} />

      <div className="nav-block">
        <div className="nav-block-title">Overlapping signage ({conflicts.length})</div>
        <div className="nav-muted">
          {state.timelineDate ? `Sites on ${formatDate(state.timelineDate)}` : "All dates"}
          {extent ? ". Use the slider on the map to turn sites on and off." : ". Add a start or finish date to use the timeline."}
        </div>
        {conflicts.length ? conflicts.map(hit => (
          <p key={`${hit.left.site.id}-${hit.right.site.id}`} className="planning-overlap">
            {siteLabel(hit.left.site)} ({projectLabel(hit.left.project)}) overlaps {siteLabel(hit.right.site)} ({projectLabel(hit.right.project)}) by {formatLength(hit.km)}.
          </p>
        )) : (
          <div className="nav-muted">No overlapping signage for the sites currently shown.</div>
        )}
        {separated.length ? (
          <div className="nav-muted">
            {separated.length} other pair{separated.length === 1 ? "" : "s"} share a road, and their dates do not overlap.
          </div>
        ) : null}
      </div>

      <div className="planning-legend" aria-hidden="true">
        <span><i className="planning-swatch planning-swatch-work" /> Work</span>
        <span><i className="planning-swatch planning-swatch-approach" /> Approach</span>
        <span><i className="planning-swatch planning-swatch-departure" /> Departure</span>
        <span><i className="planning-swatch planning-swatch-overlap" /> Overlap</span>
      </div>
    </div>
  );
}

export default PlanningSidebar;

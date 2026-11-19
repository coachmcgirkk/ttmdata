import React, { useState } from "react";
import Modal from "react-modal";

function MapOptionsPanel({ darkMode, onDarkModeChange, showAerial, onShowAerialChange, greyScale, onGreyScaleChange }) {
  const [modalOpen, setModalOpen] = useState(false);
  const [datasourceText, setDatasourceText] = useState("");
  const [recommendationLink, setRecommendationLink] = useState("");
  const [recommendationStatus, setRecommendationStatus] = useState("");

  const openDatasourceModal = async () => {
    setModalOpen(true);
    if (!datasourceText) {
      try {
        const res = await fetch("/api/datasources");
        setDatasourceText(await res.text());
      } catch {
        setDatasourceText("Failed to load data sources.");
      }
    }
  };

  const submitRecommendation = async e => {
    e.preventDefault();
    if (!recommendationLink.trim()) return;
    setRecommendationStatus("");
    try {
      const res = await fetch("/api/recommendation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ link: recommendationLink })
      });
      const data = await res.json();
      if (data.success) {
        setRecommendationStatus("Thank you! Link submitted.");
        setRecommendationLink("");
      } else {
        setRecommendationStatus(data.error || "Failed to submit.");
      }
    } catch {
      setRecommendationStatus("Failed to submit.");
    }
  };

  return (
    <>
      <div className="nav-block">
        <label className="nav-check">
          <input
            type="checkbox"
            checked={showAerial}
            onChange={e => onShowAerialChange(e.target.checked)}
          />
          Aerial imagery
        </label>
        <label className="nav-check">
          <input
            type="checkbox"
            checked={greyScale}
            onChange={e => onGreyScaleChange(e.target.checked)}
          />
          Grey Scale
        </label>
        <label className="nav-check">
          <input
            type="checkbox"
            checked={darkMode}
            onChange={e => onDarkModeChange(e.target.checked)}
          />
          Dark mode
        </label>
      </div>

      <button type="button" className="nav-btn nav-btn-primary" onClick={openDatasourceModal}>
        Data sources
      </button>

      <div className="nav-recommend">
        <div className="nav-block-title">Have more data?</div>
        <form onSubmit={submitRecommendation}>
          <input
            type="url"
            className="nav-input"
            placeholder="Paste link"
            value={recommendationLink}
            onChange={e => setRecommendationLink(e.target.value)}
            required
          />
          <button type="submit" className="nav-btn nav-btn-accent">
            Send
          </button>
          {recommendationStatus && (
            <div
              className={
                recommendationStatus.startsWith("Thank") ? "nav-success" : "nav-error"
              }
            >
              {recommendationStatus}
            </div>
          )}
        </form>
      </div>

      <Modal
        isOpen={modalOpen}
        onRequestClose={() => setModalOpen(false)}
        contentLabel="Data Sources"
        style={{
          overlay: { backgroundColor: "rgba(0,0,0,0.4)", zIndex: 2000 },
          content: { maxWidth: 500, margin: "auto", borderRadius: 8, padding: 24, zIndex: 2100 }
        }}
      >
        <h2>Data Sources</h2>
        <pre className="nav-modal-pre">{datasourceText}</pre>
        <button
          type="button"
          className="nav-btn nav-btn-primary"
          onClick={() => setModalOpen(false)}
        >
          Close
        </button>
      </Modal>
    </>
  );
}

export default MapOptionsPanel;

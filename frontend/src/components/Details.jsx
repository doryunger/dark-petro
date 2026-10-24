import { useState } from "react";
import { formatDate, formatTime } from "../lib/dates.js";
import { hotSpotLabel, sourceName } from "../lib/entries.js";

function Vessel({ number, vessel }) {
  return (
    <div className="detail-row">
      <span className="detail-label">Vessel {number}</span>
      <span className="detail-value">
        {vessel.name ?? "Unknown vessel"}
        {vessel.flag && <span className="detail-flag">{vessel.flag}</span>}
        {vessel.sanctioned && <span className="detail-badge">Sanctioned</span>}
        {vessel.imo && <span className="detail-imo">IMO {vessel.imo}</span>}
      </span>
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="detail-row">
      <span className="detail-label">{label}</span>
      <span className="detail-value">{value}</span>
    </div>
  );
}

function Capture({ image }) {
  const [failed, setFailed] = useState(false);
  if (!image || failed) return <div className="details-image">Image not available</div>;
  return (
    <div className="details-image">
      <img src={`/${image}`} alt="Capture of the pair" onError={() => setFailed(true)} />
    </div>
  );
}

export default function Details({ entry, onClose }) {
  if (!entry) return <section className="details" />;
  return (
    <section className="details">
      <header className="details-header">
        <span className={`details-icon${entry.sanctioned ? "" : " details-icon-clear"}`} />
        <h2 className="details-id">{entry.shortId}</h2>
        <button className="details-close" type="button" aria-label="Close" onClick={onClose}>
          <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
            <path className="close-outline" d="M3 3L13 13M13 3L3 13" />
            <path className="close-cross" d="M3 3L13 13M13 3L3 13" />
          </svg>
        </button>
      </header>
      <div className="details-content">
        <Capture key={entry.id} image={entry.image} />
        <div className="details-source">Source: {sourceName(entry.source)}</div>
        <div className="details-body">
          <Vessel number={1} vessel={entry.vessels[0]} />
          <Vessel number={2} vessel={entry.vessels[1]} />
          <Row label="Date" value={formatDate(entry.date)} />
          <Row label="Time" value={formatTime(entry.t)} />
          <Row label="Area" value={hotSpotLabel(entry.hotSpot)} />
          <Row label="Position" value={`${entry.lat.toFixed(4)}, ${entry.lon.toFixed(4)}`} />
        </div>
      </div>
    </section>
  );
}

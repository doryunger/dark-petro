import { useState } from "react";
import { formatDate, formatTime } from "../lib/dates";
import { entryTitle, hotSpotLabel, sourceName } from "../lib/entries";
import type { Entry, Vessel as VesselData } from "../lib/types";

function Vessel({ number, vessel }: { number: number; vessel: VesselData }) {
  return (
    <div className="detail-row">
      <span className="detail-label">
        <span className={`vessel-marker ${vessel.known ? "vessel-marker-known" : "vessel-marker-unknown"}`}>{number}</span>
      </span>
      <span className="detail-value">
        {vessel.known ? vessel.name : <span className="detail-flag">N/A</span>}
        {vessel.flag && <span className="detail-flag">({vessel.flag})</span>}
        {vessel.sanctioned && <span className="detail-badge">Sanctioned</span>}
        {vessel.imo && <span className="detail-imo">IMO {vessel.imo}</span>}
      </span>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="detail-row">
      <span className="detail-label">{label}</span>
      <span className="detail-value">{value}</span>
    </div>
  );
}

function Capture({ image, alt }: { image: string | null; alt: string }) {
  const [failed, setFailed] = useState(false);
  if (!image || failed) return <div className="details-image">Image not available</div>;
  return (
    <div className="details-image">
      <img src={`/${image}`} alt={alt} onError={() => setFailed(true)} />
    </div>
  );
}

export default function Details({ entry, onClose }: { entry: Entry | null; onClose: () => void }) {
  if (!entry) return <section className="details" />;
  return (
    <section className="details">
      <header className="details-header">
        <span className={`details-icon${entry.tab === "sanctioned" ? " details-icon-vessel" : ""}${entry.sanctioned ? "" : " details-icon-clear"}`} />
        <h2 className="details-id">{entryTitle(entry)}</h2>
        <button className="details-close" type="button" aria-label="Close" onClick={onClose}>
          <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
            <path className="close-outline" d="M3 3L13 13M13 3L3 13" />
            <path className="close-cross" d="M3 3L13 13M13 3L3 13" />
          </svg>
        </button>
      </header>
      <div className="details-content">
        <Capture key={entry.id} image={entry.image} alt={entry.tab === "sanctioned" ? "Capture of the vessel" : "Capture of the pair"} />
        <div className="details-source">Source: {sourceName(entry.source)}</div>
        <div className="details-body">
          {entry.tab === "sanctioned" ? (
            <>
              <Row label="Detection ID" value={entry.shortId} />
              {entry.vessels[0]?.flag && <Row label="Flag" value={entry.vessels[0].flag} />}
              {entry.vessels[0]?.imo && <Row label="IMO" value={entry.vessels[0].imo} />}
            </>
          ) : (
            entry.vessels.map((vessel, i) => <Vessel key={i} number={i + 1} vessel={vessel} />)
          )}
          <Row label="Date" value={formatDate(entry.date)} />
          <Row label="Time" value={formatTime(entry.t)} />
          <Row label="Area" value={hotSpotLabel(entry.hotSpot)} />
          <Row label="Position" value={`${entry.lat.toFixed(4)}, ${entry.lon.toFixed(4)}`} />
        </div>
      </div>
    </section>
  );
}

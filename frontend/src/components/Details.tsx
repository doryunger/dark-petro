import { useState } from "react";
import { formatDate, formatTime } from "../lib/dates";
import { entryTitle, hotSpotLabel, sourceName } from "../lib/entries";
import type { ReactNode } from "react";
import type { ActivityMatch, Entry, Vessel as VesselData } from "../lib/types";

function RegistrationValue({ vessel }: { vessel: VesselData }) {
  return <>{vessel.imo}{vessel.imo && vessel.flag ? " " : ""}{vessel.flag && <span className="registration-flag">({vessel.flag})</span>}</>;
}

function Vessel({ number, vessel }: { number: number; vessel: VesselData }) {
  return (
    <div className="detail-row detail-row-vessel">
      <span className="detail-label">
        <span className={`vessel-marker ${vessel.known ? "vessel-marker-known" : "vessel-marker-unknown"}`}>{number}</span>
      </span>
      <span className="detail-value">
        {vessel.known ? vessel.name : <span className="detail-flag">N/A</span>}
        {vessel.sanctioned && <span className="detail-badge">Sanctioned</span>}
        {vessel.imo && <span className="detail-registration-inline"><span className="detail-label">Registration:</span> <RegistrationValue vessel={vessel} /></span>}
        {!vessel.imo && vessel.flag && <span className="detail-registration-inline"><span className="detail-label">Flag:</span> <span className="registration-flag">{vessel.flag}</span></span>}
      </span>
    </div>
  );
}

function Row({ label, value }: { label: string; value: ReactNode }) {
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

interface Props {
  entry: Entry | null;
  onClose: () => void;
  activityMatches: ActivityMatch[];
  activityReturn: Entry | null;
  onOpenActivity: (match: ActivityMatch) => void;
  onReturnVessel: () => void;
}

export default function Details({ entry, onClose, activityMatches, activityReturn, onOpenActivity, onReturnVessel }: Props) {
  if (!entry) return <section className="details" />;
  const title = activityReturn ? `${activityReturn.vessels[0]?.name || "Vessel"}/${entry.shortId}` : entryTitle(entry);
  const primaryVessel = entry.vessels[0];
  return (
    <section className="details">
      <header className="details-header">
        <span className={`details-icon${entry.tab === "sanctioned" ? " details-icon-vessel" : ""}${entry.sanctioned ? "" : " details-icon-clear"}`} />
        <h2 className="details-id">
          {activityReturn ? <><button className="details-vessel-link" type="button" onClick={onReturnVessel}>{activityReturn.vessels[0]?.name || "Vessel"}</button>/{entry.shortId}</> : title}
        </h2>
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
              <Row label="ID" value={entry.shortId} />
              {primaryVessel?.imo ? <Row label="Registration" value={<RegistrationValue vessel={primaryVessel} />} /> : primaryVessel?.flag && <Row label="Flag" value={<span className="registration-flag">{primaryVessel.flag}</span>} />}
            </>
          ) : (
            entry.vessels.map((vessel, i) => <Vessel key={i} number={i + 1} vessel={vessel} />)
          )}
          <Row label="Capture time" value={`${formatDate(entry.date)} ${formatTime(entry.t)}`} />
          <Row label="Position" value={`${entry.lat.toFixed(4)}, ${entry.lon.toFixed(4)}`} />
          {entry.tab === "sanctioned" && activityMatches.length > 0 && <section className="details-activities" aria-label="Related suspicious activities">
            <h3 className="details-activities-title">Related suspicious activities</h3>
            <div className="details-activities-list" aria-label="Matching activity entries">
              {activityMatches.map((match) => {
                return <button className="details-activity" key={match.entry.id} type="button" onClick={() => onOpenActivity(match)}>
                  <span className="details-activity-icon" aria-hidden="true" />
                  <span className="details-activity-id">ID {match.entry.shortId}</span>
                  <span className="details-activity-meta">{hotSpotLabel(match.entry.hotSpot)} · {formatDate(match.entry.date)} {formatTime(match.entry.t)}</span>
                </button>;
              })}
            </div>
          </section>}
        </div>
      </div>
    </section>
  );
}

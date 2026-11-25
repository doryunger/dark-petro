import { createSignal, For, Show } from "solid-js";
import type { JSX } from "@solidjs/web";
import { formatDate, formatTime } from "../lib/dates";
import { entryTitle, hotSpotLabel, sourceName } from "../lib/entries";
import type { ActivityMatch, Entry, Vessel as VesselData } from "../lib/types";

function RegistrationValue(props: { vessel: VesselData }) {
  return (
    <>
      {props.vessel.imo}
      {props.vessel.imo && props.vessel.flag ? " " : ""}
      {props.vessel.flag && <span class="registration-flag">({props.vessel.flag})</span>}
    </>
  );
}

function Vessel(props: { number: number; vessel: VesselData; onOpenVessel: (imo: string) => void }) {
  return (
    <div class="detail-row detail-row-vessel">
      <span class="detail-label">
        <span class={["vessel-marker", props.vessel.known ? "vessel-marker-known" : "vessel-marker-unknown"]}>{props.number}</span>
      </span>
      <span class="detail-value">
        {props.vessel.sanctioned && props.vessel.imo ? (
          <button
            class="details-vessel-link"
            type="button"
            onClick={() => {
              if (props.vessel.imo) props.onOpenVessel(props.vessel.imo);
            }}
          >
            {props.vessel.known ? props.vessel.name : "N/A"}
          </button>
        ) : props.vessel.known ? (
          props.vessel.name
        ) : (
          <span class="detail-flag">N/A</span>
        )}
        {props.vessel.sanctioned && <span class="detail-badge">Sanctioned</span>}
        {props.vessel.imo && (
          <span class="detail-registration-inline">
            <span class="detail-label">Registration:</span> <RegistrationValue vessel={props.vessel} />
          </span>
        )}
        {!props.vessel.imo && props.vessel.flag && (
          <span class="detail-registration-inline">
            <span class="detail-label">Flag:</span> <span class="registration-flag">{props.vessel.flag}</span>
          </span>
        )}
      </span>
    </div>
  );
}

function Row(props: { label: string; value: JSX.Element }) {
  return (
    <div class="detail-row">
      <span class="detail-label">{props.label}</span>
      <span class="detail-value">{props.value}</span>
    </div>
  );
}

function Capture(props: { image: string | null; alt: string }) {
  const [failed, setFailed] = createSignal(false);
  return (
    <div class="details-image">
      <Show when={props.image && !failed()} fallback="Image not available">
        <img src={`/${props.image}`} alt={props.alt} onError={() => setFailed(true)} />
      </Show>
    </div>
  );
}

function DetailsHeading() {
  return (
    <div class="details-heading">
      <h2 class="details-title">Capture details</h2>
    </div>
  );
}

interface Props {
  entry: Entry | null;
  onClose: () => void;
  activityMatches: ActivityMatch[];
  headerBackLabel: string | null;
  onOpenActivity: (match: ActivityMatch) => void;
  onOpenSanctionedVessel: (imo: string) => void;
  onBack: () => void;
}

export default function Details(props: Props) {
  return (
    <section class="details" data-tour="details">
      <DetailsHeading />
      <Show when={props.entry} keyed>
        {(entry) => (
          <>
            <header class="details-entry">
              <span class={["details-icon", { "details-icon-vessel": entry.tab === "sanctioned", "details-icon-clear": !entry.sanctioned }]} />
              <h3 class="details-id">
                <Show when={props.headerBackLabel} fallback={entryTitle(entry)}>
                  <button class="details-vessel-link" type="button" onClick={props.onBack}>
                    {props.headerBackLabel}
                  </button>
                  /{entry.tab === "pairs" ? entry.shortId : entryTitle(entry)}
                </Show>
              </h3>
              <button class="details-close" type="button" aria-label="Close" onClick={props.onClose}>
                <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
                  <path class="close-outline" d="M3 3L13 13M13 3L3 13" />
                  <path class="close-cross" d="M3 3L13 13M13 3L3 13" />
                </svg>
              </button>
            </header>
            <div class="details-content">
              <Capture image={entry.image} alt={entry.tab === "sanctioned" ? "Capture of the vessel" : "Capture of the pair"} />
              <div class="details-source">Source: {sourceName(entry.source)}</div>
              <div class="details-body">
                <Show
                  when={entry.tab === "sanctioned"}
                  fallback={
                    <For each={entry.vessels}>
                      {(vessel, index) => <Vessel number={index() + 1} vessel={vessel} onOpenVessel={props.onOpenSanctionedVessel} />}
                    </For>
                  }
                >
                  <Row label="ID" value={entry.shortId} />
                  {entry.vessels[0]?.imo ? (
                    <Row label="Registration" value={<RegistrationValue vessel={entry.vessels[0]} />} />
                  ) : (
                    entry.vessels[0]?.flag && <Row label="Flag" value={<span class="registration-flag">{entry.vessels[0].flag}</span>} />
                  )}
                </Show>
                <Row label="Capture time" value={`${formatDate(entry.date)} ${formatTime(entry.t)}`} />
                <Row label="Position" value={`${entry.lat.toFixed(4)}, ${entry.lon.toFixed(4)}`} />
                <Show when={entry.tab === "sanctioned" && props.activityMatches.length > 0}>
                  <section class="details-activities" aria-label="Related suspicious activities">
                    <h3 class="details-activities-title">Related suspicious activities</h3>
                    <div class="details-activities-list">
                      <For each={props.activityMatches} keyed={(match) => match.entry.id}>
                        {(match) => (
                          <button class="details-activity" type="button" onClick={() => props.onOpenActivity(match())}>
                            <span class="details-activity-icon" aria-hidden="true" />
                            <span class="details-activity-id">ID {match().entry.shortId}</span>
                            <span class="details-activity-meta">
                              {hotSpotLabel(match().entry.hotSpot)} · {formatDate(match().entry.date)} {formatTime(match().entry.t)}
                            </span>
                          </button>
                        )}
                      </For>
                    </div>
                  </section>
                </Show>
              </div>
            </div>
          </>
        )}
      </Show>
    </section>
  );
}

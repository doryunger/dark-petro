import { createEffect, Show } from "solid-js";
import { TOAST_MS } from "../lib/constants";

interface Props {
  message: string | null;
  onClose: () => void;
}

export default function Toast(props: Props) {
  createEffect(
    () => props.message,
    (message) => {
      if (!message) return undefined;
      const timer = setTimeout(props.onClose, TOAST_MS);
      return () => clearTimeout(timer);
    },
  );

  return (
    <Show when={props.message}>
      <div class="toast" role="alert">
        <span class="toast-text">{props.message}</span>
        <button class="toast-close" type="button" aria-label="Dismiss" onClick={props.onClose}>
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
            <path d="M3 3L13 13M13 3L3 13" />
          </svg>
        </button>
      </div>
    </Show>
  );
}

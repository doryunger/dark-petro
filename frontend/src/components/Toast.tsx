import { useEffect } from "react";
import { TOAST_MS } from "../lib/constants";

interface Props {
  message: string | null;
  onClose: () => void;
}

export default function Toast({ message, onClose }: Props) {
  useEffect(() => {
    if (!message) return undefined;
    const timer = setTimeout(onClose, TOAST_MS);
    return () => clearTimeout(timer);
  }, [message, onClose]);

  if (!message) return null;
  return (
    <div className="toast" role="alert">
      <span className="toast-text">{message}</span>
      <button className="toast-close" type="button" aria-label="Dismiss" onClick={onClose}>
        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
          <path d="M3 3L13 13M13 3L3 13" />
        </svg>
      </button>
    </div>
  );
}

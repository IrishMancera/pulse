"use client";

// Reusable centered prompt for "someone wants to connect" and
// "someone wants to start video".
export default function ConnectionPrompt({
  title,
  subtitle,
  acceptLabel,
  declineLabel,
  onAccept,
  onDecline,
}: {
  title: string;
  subtitle?: string;
  acceptLabel: string;
  declineLabel: string;
  onAccept: () => void;
  onDecline: () => void;
}) {
  return (
    <div className="connection-prompt-backdrop">
      <div className="connection-prompt" role="dialog" aria-modal="true" aria-labelledby="connection-prompt-title">
        <span className="prompt-signal-mark" aria-hidden="true"><i /></span>
        <span className="prompt-eyebrow">INCOMING FREQUENCY</span>
        <h2 id="connection-prompt-title">{title}</h2>
        {subtitle && <p className="prompt-subtitle">{subtitle}</p>}
        <div className="prompt-actions">
          <button
            onClick={onDecline}
            className="prompt-decline"
          >
            {declineLabel}
          </button>
          <button
            onClick={onAccept}
            className="prompt-accept"
          >
            {acceptLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

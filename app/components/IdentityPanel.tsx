"use client";

import type React from "react";
import type { AvatarTone, IdentityMode, IdentityProfile } from "@/lib/types";

const tones: AvatarTone[] = ["green", "violet", "cyan", "rose", "amber"];

function Alien({ tone }: { tone: AvatarTone }) {
  return (
    <svg className={`identity-alien tone-${tone}`} viewBox="0 0 48 48" aria-hidden="true">
      <path d="M24 3.5c10.2 0 17.2 7.6 16 18.2C38.6 34 29 43.4 24 45c-5-1.6-14.6-11-16-23.3C6.8 11.1 13.8 3.5 24 3.5Z" />
      <path d="M11.8 19.2c4.5-.8 8.1.2 10.2 3.1-2.7 3-6.1 3.8-9.8 2.1-1.2-1.8-1.3-3.5-.4-5.2Z" />
      <path d="M36.2 19.2c-4.5-.8-8.1.2-10.2 3.1 2.7 3 6.1 3.8 9.8 2.1 1.2-1.8 1.3-3.5.4-5.2Z" />
      <path d="M20.5 34.2c2.3 1.2 4.7 1.2 7 0" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg className="identity-mode-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

function ChatIcon() {
  return (
    <svg className="identity-mode-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

export default function IdentityPanel({
  profile,
  onChange,
  onClose,
}: {
  profile: IdentityProfile;
  onChange: (profile: IdentityProfile) => void;
  onClose: () => void;
}) {
  const label =
    profile.identityMode === "nickname" && profile.nickname.trim()
      ? profile.nickname.trim()
      : profile.identityMode === "color"
        ? `${profile.avatarTone} alien`
        : "Anonymous alien";

  function update<K extends keyof IdentityProfile>(key: K, value: IdentityProfile[K]) {
    onChange({ ...profile, [key]: value });
  }

  const modes: {
    value: IdentityMode;
    title: string;
    detail: string;
    icon: React.ReactNode;
  }[] = [
    {
      value: "anonymous",
      title: "Stay anonymous",
      detail: "Only your alien face is visible",
      icon: <LockIcon />,
    },
    {
      value: "color",
      title: "Color avatar",
      detail: "Be known by a color, not a name",
      icon: <Alien tone={profile.avatarTone} />,
    },
    {
      value: "nickname",
      title: "Use a nickname",
      detail: "A temporary name for this session",
      icon: <ChatIcon />,
    },
  ];

  return (
    <div className="identity-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="identity-panel" role="dialog" aria-modal="true" aria-labelledby="identity-title">
        <button className="identity-close" onClick={onClose} aria-label="Close identity settings">×</button>
        
        <div className="identity-preview">
          <span className="identity-preview-avatar">
            <Alien tone={profile.avatarTone} />
          </span>
          <small id="identity-title">YOUR TEMPORARY APPEARANCE</small>
          <strong>{label}</strong>
          <p>Change it anytime. It disappears when you leave.</p>
        </div>

        <div className="identity-mode-list" role="group" aria-label="Identity mode">
          {modes.map((mode) => (
            <div key={mode.value} className="identity-mode-row">
              <button
                type="button"
                className={`identity-mode-btn ${profile.identityMode === mode.value ? "selected" : ""}`}
                onClick={() => update("identityMode", mode.value)}
                aria-pressed={profile.identityMode === mode.value}
              >
                <span className={`identity-mode-icon-box ${mode.value}`}>
                  {mode.icon}
                </span>
                <span className="identity-mode-copy">
                  <strong>{mode.title}</strong>
                  <small>{mode.detail}</small>
                </span>
                {profile.identityMode === mode.value && (
                  <span className="identity-mode-check" aria-hidden="true">✓</span>
                )}
              </button>
              {mode.value === "nickname" && profile.identityMode === "nickname" && (
                <div className="identity-nickname-field">
                  <input
                    value={profile.nickname}
                    maxLength={18}
                    placeholder="Enter nickname (e.g. MoonMoth)"
                    onChange={(event) => update("nickname", event.target.value)}
                    autoFocus
                  />
                  <small>{profile.nickname.length}/18 · disappears on leave</small>
                </div>
              )}
            </div>
          ))}
        </div>

        <fieldset className="identity-tone-picker">
          <legend>ALIEN COLOR</legend>
          <div className="identity-tones-bar">
            {tones.map((tone) => (
              <button
                type="button"
                key={tone}
                className={`identity-tone tone-${tone} ${profile.avatarTone === tone ? "selected" : ""}`}
                onClick={() => update("avatarTone", tone)}
                aria-label={`${tone} alien`}
                aria-pressed={profile.avatarTone === tone}
              >
                <Alien tone={tone} />
              </button>
            ))}
          </div>
        </fieldset>

        <button className="identity-save" onClick={onClose}>
          Appear as {label} <span aria-hidden="true">→</span>
        </button>
      </section>
    </div>
  );
}
"use client";

import { useState } from "react";

function HoveringAlienMascot({
  isBtnHovered = false,
}: {
  isBtnHovered?: boolean;
}) {
  const [isSelfHovered, setIsSelfHovered] = useState(false);
  const active = isBtnHovered || isSelfHovered;

  return (
    <div
      className={`hovering-alien-container ${active ? "is-active" : ""}`}
      onMouseEnter={() => setIsSelfHovered(true)}
      onMouseLeave={() => setIsSelfHovered(false)}
      aria-hidden="true"
    >
      {/* Interactive Speech Bubble */}
      <div className="alien-speech-bubble">
        {active ? (
          <span>Hop on in, human!</span>
        ) : (
          <span>Beam me in!</span>
        )}
        <div className="alien-bubble-arrow" />
      </div>

      {/* Bigger and Longer Cartoon Alien Character */}
      <div className="alien-character-wrapper">
        <svg
          className="alien-mascot-svg"
          viewBox="0 0 150 205"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            {/* Skin Gradient */}
            <linearGradient id="alienSkin" x1="75" y1="20" x2="75" y2="180" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#3bfd78" />
              <stop offset="45%" stopColor="#08cb00" />
              <stop offset="100%" stopColor="#045a12" />
            </linearGradient>

            {/* Glossy Eye Gradient */}
            <radialGradient id="alienEye" cx="50%" cy="38%" r="62%">
              <stop offset="0%" stopColor="#1a0b36" />
              <stop offset="65%" stopColor="#080312" />
              <stop offset="100%" stopColor="#000000" />
            </radialGradient>

            {/* Antenna Orb Glow */}
            <radialGradient id="antennaGlow" cx="35%" cy="30%" r="65%">
              <stop offset="0%" stopColor="#ffffff" />
              <stop offset="30%" stopColor="#67ff9b" />
              <stop offset="75%" stopColor="#08cb00" />
              <stop offset="100%" stopColor="#02420e" />
            </radialGradient>

            {/* Cheek Blush */}
            <radialGradient id="cheekGlow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="rgba(255, 110, 180, 0.5)" />
              <stop offset="100%" stopColor="rgba(255, 110, 180, 0)" />
            </radialGradient>

            {/* Chest Core Pulse */}
            <radialGradient id="pulseCore" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#ffffff" />
              <stop offset="35%" stopColor="#22d3ee" />
              <stop offset="100%" stopColor="#08cb00" />
            </radialGradient>

            {/* Soft Glow Filter */}
            <filter id="neonGlow" x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="3.5" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>

          {/* Antigravity Tractor Beam Rings Beneath Feet */}
          <g className="alien-tractor-beam">
            <ellipse cx="75" cy="198" rx="34" ry="5" className="beam-ring-1" />
            <ellipse cx="75" cy="190" rx="22" ry="3.5" className="beam-ring-2" />
          </g>

          {/* Dangling Legs in Zero-G */}
          <g className="alien-legs">
            {/* Left Leg */}
            <path
              d="M 62 152 C 57 166 54 180 50 192"
              stroke="url(#alienSkin)"
              strokeWidth="7.5"
              strokeLinecap="round"
              className="alien-leg-left"
            />
            {/* Left Boot */}
            <ellipse cx="48" cy="193" rx="7" ry="5" fill="#032b0a" stroke="#3bfd78" strokeWidth="1.5" />

            {/* Right Leg */}
            <path
              d="M 88 152 C 93 166 96 180 100 192"
              stroke="url(#alienSkin)"
              strokeWidth="7.5"
              strokeLinecap="round"
              className="alien-leg-right"
            />
            {/* Right Boot */}
            <ellipse cx="102" cy="193" rx="7" ry="5" fill="#032b0a" stroke="#3bfd78" strokeWidth="1.5" />
          </g>

          {/* Longer Slender Torso */}
          <g className="alien-torso-group">
            <path
              d="M 58 116 C 52 128 50 145 55 156 C 59 161 91 161 95 156 C 100 145 98 128 92 116 Z"
              fill="url(#alienSkin)"
              stroke="#033d0e"
              strokeWidth="2.5"
            />
            {/* Glowing Space Collar */}
            <path
              d="M 56 119 Q 75 130 94 119"
              stroke="#00ff87"
              strokeWidth="3"
              fill="none"
              strokeLinecap="round"
              filter="url(#neonGlow)"
            />
            {/* Pulse Reactor Core */}
            <circle cx="75" cy="138" r="7.5" fill="url(#pulseCore)" filter="url(#neonGlow)" className="alien-chest-pulse" />
            <circle cx="75" cy="138" r="3.2" fill="#ffffff" />
          </g>

          {/* Arms with Gestures */}
          <g className="alien-arms">
            {/* Left Arm: Playful Waving */}
            <g className="alien-arm-waving">
              <path
                d="M 55 124 C 37 115 25 100 22 84"
                stroke="url(#alienSkin)"
                strokeWidth="6.5"
                strokeLinecap="round"
                fill="none"
              />
              {/* Cute 3-fingered waving hand */}
              <circle cx="22" cy="82" r="5" fill="url(#alienSkin)" />
              <circle cx="17" cy="77" r="2.5" fill="#3bfd78" />
              <circle cx="23" cy="74" r="2.5" fill="#3bfd78" />
              <circle cx="28" cy="78" r="2.5" fill="#3bfd78" />
            </g>

            {/* Right Arm: Pointing Down at "Enter Pulse" */}
            <g className="alien-arm-pointing">
              <path
                d="M 95 124 C 113 134 122 148 124 162"
                stroke="url(#alienSkin)"
                strokeWidth="6.5"
                strokeLinecap="round"
                fill="none"
              />
              <circle cx="124" cy="164" r="5" fill="url(#alienSkin)" />
              <path d="M 124 164 L 125 174" stroke="#3bfd78" strokeWidth="3.5" strokeLinecap="round" />
            </g>
          </g>

          {/* Elongated Cartoon Alien Head */}
          <g className="alien-head-group">
            {/* Elongated Head Contour */}
            <path
              d="M 75 30 C 40 30 28 60 32 88 C 37 112 57 124 75 124 C 93 124 113 112 118 88 C 122 60 110 30 75 30 Z"
              fill="url(#alienSkin)"
              stroke="#044d14"
              strokeWidth="2.8"
            />

            {/* 3D Top Highlight */}
            <path
              d="M 46 45 C 56 36 65 33 75 33 C 85 33 94 36 104 45"
              stroke="rgba(255, 255, 255, 0.45)"
              strokeWidth="3.2"
              strokeLinecap="round"
              fill="none"
            />

            {/* Longer Curving Antennae */}
            <g className="alien-antenna-left">
              <path
                d="M 55 36 C 44 23 34 14 26 7"
                stroke="#08cb00"
                strokeWidth="3.8"
                strokeLinecap="round"
                fill="none"
              />
              <circle cx="24" cy="6" r="7.8" fill="url(#antennaGlow)" filter="url(#neonGlow)" />
              <circle cx="22" cy="4" r="2.8" fill="#ffffff" />
            </g>

            <g className="alien-antenna-right">
              <path
                d="M 95 36 C 106 23 116 14 124 7"
                stroke="#08cb00"
                strokeWidth="3.8"
                strokeLinecap="round"
                fill="none"
              />
              <circle cx="126" cy="6" r="7.8" fill="url(#antennaGlow)" filter="url(#neonGlow)" />
              <circle cx="124" cy="4" r="2.8" fill="#ffffff" />
            </g>

            {/* Rosy Cheeks */}
            <ellipse cx="45" cy="94" rx="8" ry="4.5" fill="url(#cheekGlow)" />
            <ellipse cx="105" cy="94" rx="8" ry="4.5" fill="url(#cheekGlow)" />

            {/* Big Glossy Cartoon Eyes */}
            {/* Left Eye */}
            <g className="alien-eye-left" transform="rotate(-10 54 74)">
              <ellipse cx="54" cy="74" rx="15" ry="23" fill="url(#alienEye)" stroke="#033d0e" strokeWidth="2.2" />
              <path d="M 44 85 C 49 92 59 92 64 85" stroke="#22d3ee" strokeWidth="2.2" strokeLinecap="round" fill="none" opacity="0.85" />
              <circle cx="50" cy="66" r="5.5" fill="#ffffff" />
              <circle cx="59" cy="79" r="2.6" fill="#ffffff" opacity="0.9" />
              <circle cx="56" cy="62" r="1.4" fill="#ffffff" />
            </g>

            {/* Right Eye */}
            <g className="alien-eye-right" transform="rotate(10 96 74)">
              <ellipse cx="96" cy="74" rx="15" ry="23" fill="url(#alienEye)" stroke="#033d0e" strokeWidth="2.2" />
              <path d="M 86 85 C 91 92 101 92 106 85" stroke="#22d3ee" strokeWidth="2.2" strokeLinecap="round" fill="none" opacity="0.85" />
              <circle cx="92" cy="66" r="5.5" fill="#ffffff" />
              <circle cx="101" cy="79" r="2.6" fill="#ffffff" opacity="0.9" />
              <circle cx="98" cy="62" r="1.4" fill="#ffffff" />
            </g>

            {/* Sweet Cartoon Smirk / Smile */}
            <path
              d="M 67 104 Q 75 112 83 104"
              stroke="#032b0a"
              strokeWidth="2.8"
              strokeLinecap="round"
              fill="none"
            />
          </g>
        </svg>
      </div>

      {/* Floating Antigravity Stardust */}
      <div className="alien-aura-particles">
        <span className="particle p1" />
        <span className="particle p2" />
        <span className="particle p3" />
      </div>
    </div>
  );
}

export default function EntryGate({
  onReady,
}: {
  onReady: (lat: number, lng: number) => void;
}) {
  const [btnHovered, setBtnHovered] = useState<boolean>(false);

  function enter() {
    let startLat = 40.7128;
    let startLng = -74.006;
    try {
      const cached = localStorage.getItem("pulse_cached_coords");
      if (cached) {
        const parsed = JSON.parse(cached);
        if (typeof parsed.lat === "number" && typeof parsed.lng === "number") {
          startLat = parsed.lat;
          startLng = parsed.lng;
        }
      }
    } catch {}

    onReady(startLat, startLng);

    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          try {
            localStorage.setItem("pulse_cached_coords", JSON.stringify({ lat, lng }));
          } catch {}
          onReady(lat, lng);
        },
        () => {/* keep start coords */},
        { enableHighAccuracy: false, timeout: 5_000, maximumAge: 60_000 },
      );
    }
  }

  return (
    <main className="welcome-screen">
      <div className="welcome-atmosphere" aria-hidden="true">
        <div className="welcome-grid" />
        <div className="welcome-orbit welcome-orbit-one"><i /><i /><i /></div>
        <div className="welcome-orbit welcome-orbit-two"><i /><i /></div>
        <div className="welcome-globe-mark"><span /><i /><i /></div>
      </div>
      <header className="welcome-header">
        <div className="pulse-brand"><span className="pulse-brand-mark"><i /></span>pulse</div>
        <span className="welcome-privacy">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
          NO ACCOUNT. NO TRACE.
        </span>
      </header>
      <section className="welcome-content">
        <span className="welcome-kicker"><i /> Live presence activates when connected</span>
        <h1>Meet the world<br /><em>between moments.</em></h1>
        <p>Find someone on your frequency. Talk for a minute or stay for hours. When you leave, it all disappears.</p>

        {/* Enter Pulse Button with Longer & Bigger Hovering Alien */}
        <div className="welcome-enter-container">
          <HoveringAlienMascot isBtnHovered={btnHovered} />
          <button
            className="welcome-enter"
            onClick={enter}
            onMouseEnter={() => setBtnHovered(true)}
            onMouseLeave={() => setBtnHovered(false)}
          >
            <span>Enter Pulse ✦</span>
            <i aria-hidden="true">→</i>
          </button>
        </div>


        <div className="welcome-trust">
          <span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            PEER-TO-PEER
          </span>
          <span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="10" />
              <circle cx="12" cy="12" r="3" />
            </svg>
            LOCATION BLURRED
          </span>
          <span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            NOTHING STORED
          </span>
        </div>
      </section>
      <div className="welcome-side-note"><span>One planet</span><i /><span>One fleeting connection</span></div>
      <footer className="welcome-footer">
        <span>Pulse / Anonymous social</span>
        <p>Be open. Be kind. Be here.</p>
        <span>Made for the quietly curious</span>
      </footer>
    </main>
  );
}


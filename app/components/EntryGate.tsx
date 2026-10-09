"use client";

import { useState } from "react";

type Signal = "open" | "curious" | "quiet";
type Tone = "green" | "violet" | "cyan" | "rose" | "amber";

const SIGNALS: { value: Signal; emoji: string; label: string; desc: string }[] = [
  { value: "open",    emoji: "💬", label: "Open",    desc: "Ready to talk with anyone right now" },
  { value: "curious", emoji: "✨", label: "Curious",  desc: "Tell me something unexpected" },
  { value: "quiet",   emoji: "🌙", label: "Quiet",    desc: "Sharing a slow ambient thought" },
];

const TONES: { value: Tone; color: string; label: string }[] = [
  { value: "green",  color: "#22c55e", label: "Sage" },
  { value: "violet", color: "#a855f7", label: "Violet" },
  { value: "cyan",   color: "#06b6d4", label: "Cyan" },
  { value: "rose",   color: "#f43f5e", label: "Rose" },
  { value: "amber",  color: "#f59e0b", label: "Amber" },
];

export default function EntryGate({
  onReady,
}: {
  onReady: (lat: number, lng: number, signal: Signal, tone: Tone, nickname: string) => void;
}) {
  const [step, setStep] = useState<"identity" | "signal" | "locating">("identity");
  const [nickname, setNickname] = useState("");
  const [tone, setTone] = useState<Tone>("violet");
  const [signal, setSignal] = useState<Signal>("curious");
  const [error, setError] = useState("");

  function goToSignal() {
    setStep("signal");
  }

  function enter() {
    if (!("geolocation" in navigator)) {
      setError("Your browser doesn't support location access.");
      return;
    }
    setStep("locating");
    setError("");
    navigator.geolocation.getCurrentPosition(
      (pos) => onReady(pos.coords.latitude, pos.coords.longitude, signal, tone, nickname.trim()),
      (err) => {
        setStep("signal");
        setError(
          err.code === err.PERMISSION_DENIED
            ? "Location permission is required to place you on the map."
            : "Couldn't get your location. Please try again.",
        );
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
    );
  }

  const chosenTone = TONES.find((t) => t.value === tone)!;

  return (
    <div
      className="flex min-h-full flex-1 flex-col items-center justify-center p-6"
      style={{ background: "linear-gradient(135deg, #050508 0%, #0d0b18 50%, #050508 100%)" }}
    >
      {/* Logo */}
      <div className="mb-10 text-center" style={{ animation: "float-in 0.6s ease both" }}>
        <div className="mb-3 flex items-center justify-center gap-2">
          <div
            className="h-3 w-3 rounded-full"
            style={{ background: chosenTone.color, boxShadow: `0 0 12px ${chosenTone.color}` }}
          />
          <h1 className="text-4xl font-bold tracking-tight text-white">Pulse</h1>
        </div>
        <p className="max-w-xs text-sm text-zinc-500">
          A living globe of anonymous strangers.
          <br />No sign-up · No history · No traces.
        </p>
      </div>

      {/* Card */}
      <div
        className="glass w-full max-w-sm rounded-2xl p-6 shadow-2xl"
        style={{ animation: "scale-in 0.5s ease 0.1s both" }}
      >
        {step === "identity" && (
          <>
            <h2 className="mb-5 text-center text-base font-semibold text-white">
              Choose your appearance
            </h2>

            {/* Nickname */}
            <div className="mb-4">
              <label className="mb-1.5 block text-xs font-medium text-zinc-400">
                Nickname <span className="text-zinc-600">(optional)</span>
              </label>
              <input
                type="text"
                maxLength={24}
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                placeholder="Anonymous"
                className="w-full rounded-xl border border-zinc-700/60 bg-zinc-900/80 px-4 py-2.5 text-sm text-white placeholder-zinc-600 outline-none focus:border-zinc-500 transition"
              />
            </div>

            {/* Tone / colour */}
            <div className="mb-6">
              <label className="mb-2 block text-xs font-medium text-zinc-400">
                Dot colour
              </label>
              <div className="flex gap-2.5">
                {TONES.map((t) => (
                  <button
                    key={t.value}
                    onClick={() => setTone(t.value)}
                    title={t.label}
                    className="h-8 w-8 rounded-full transition-transform duration-150"
                    style={{
                      background: t.color,
                      boxShadow: tone === t.value ? `0 0 0 3px rgba(255,255,255,0.15), 0 0 12px ${t.color}` : "none",
                      transform: tone === t.value ? "scale(1.22)" : "scale(1)",
                    }}
                  />
                ))}
              </div>
            </div>

            <button
              onClick={goToSignal}
              className="w-full rounded-full py-3 text-sm font-semibold text-white transition hover:brightness-110 active:scale-95"
              style={{ background: chosenTone.color }}
            >
              Next →
            </button>
          </>
        )}

        {(step === "signal" || step === "locating") && (
          <>
            <h2 className="mb-5 text-center text-base font-semibold text-white">
              What's your signal?
            </h2>

            <div className="mb-6 flex flex-col gap-2.5">
              {SIGNALS.map((s) => (
                <button
                  key={s.value}
                  onClick={() => setSignal(s.value)}
                  className="flex items-start gap-3 rounded-xl border p-3.5 text-left transition"
                  style={{
                    borderColor: signal === s.value ? chosenTone.color : "rgba(255,255,255,0.07)",
                    background: signal === s.value ? `${chosenTone.color}15` : "rgba(255,255,255,0.03)",
                  }}
                >
                  <span className="text-xl">{s.emoji}</span>
                  <span>
                    <span className="block text-sm font-semibold text-white">{s.label}</span>
                    <span className="text-xs text-zinc-500">{s.desc}</span>
                  </span>
                </button>
              ))}
            </div>

            {error && (
              <p className="mb-3 rounded-lg bg-red-500/10 px-3 py-2 text-center text-xs text-red-400">
                {error}
              </p>
            )}

            <button
              onClick={enter}
              disabled={step === "locating"}
              className="w-full rounded-full py-3 text-sm font-semibold text-white transition hover:brightness-110 active:scale-95 disabled:opacity-60"
              style={{ background: chosenTone.color }}
            >
              {step === "locating" ? "Locating…" : "Enter Pulse ✦"}
            </button>

            <button
              onClick={() => setStep("identity")}
              disabled={step === "locating"}
              className="mt-2 w-full rounded-full py-2 text-xs text-zinc-600 hover:text-zinc-400 transition disabled:opacity-40"
            >
              ← Back
            </button>
          </>
        )}
      </div>

      <p className="mt-5 max-w-xs text-center text-xs text-zinc-700">
        Your dot is placed ~1–3 km from your real location.
        Closing the tab removes you instantly.
      </p>
    </div>
  );
}

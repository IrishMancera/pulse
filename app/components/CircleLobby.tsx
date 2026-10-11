"use client";

import { useState, type FormEvent } from "react";
import type { CircleSummary } from "@/lib/types";

export default function CircleLobby({
  circles,
  loading,
  busy,
  onRefresh,
  onEnter,
}: {
  circles: CircleSummary[];
  loading: boolean;
  busy: boolean;
  onRefresh: () => void;
  onEnter: (mode: "create" | "join" | "random", keyword: string) => void;
}) {
  const [keyword, setKeyword] = useState("");

  function submit(event: FormEvent<HTMLFormElement>, mode: "create" | "join") {
    event.preventDefault();
    onEnter(mode, keyword.trim());
  }

  return (
    <section className="circle-lobby" aria-label="Live circles">
      <header className="circle-lobby-heading">
        <div>
          <span className="workspace-eyebrow"><i /> TEMPORARY GROUP CALLS</span>
          <h1>Find your circle.</h1>
          <p>Join a live keyword or open a new room. Video stays peer-to-peer; rooms disappear when everyone leaves.</p>
        </div>
        <button className="circle-refresh" type="button" onClick={onRefresh} disabled={loading} aria-label="Refresh circles">↻</button>
      </header>

      <div className="circle-entry-tools">
        <button className="circle-random-button" onClick={() => onEnter("random", "")} disabled={busy}>
          <span aria-hidden="true">✧</span>
          <span><strong>Drop me in</strong><small>Join a random open circle</small></span>
        </button>
        <form className="circle-keyword-form" onSubmit={(event) => submit(event, "join")}>
          <label htmlFor="circle-keyword">Circle keyword</label>
          <div>
            <input id="circle-keyword" value={keyword} maxLength={32} onChange={(event) => setKeyword(event.target.value)} placeholder="e.g. late-night music" />
            <button type="submit" disabled={busy || keyword.trim().length < 2}>Enter</button>
          </div>
        </form>
        <form className="circle-create-form" onSubmit={(event) => submit(event, "create")}>
          <button type="submit" disabled={busy || keyword.trim().length < 2}>＋ Create this circle</button>
        </form>
      </div>

      {(() => {
        const circleList = Array.isArray(circles) ? circles : [];
        return (
          <>
            <div className="circle-list-heading"><span>Open circles</span><small>{circleList.length} live</small></div>
            {loading && circleList.length === 0 ? (
              <div className="circle-empty-state">Finding open circles…</div>
            ) : circleList.length === 0 ? (
              <div className="circle-empty-state"><strong>No circles are open yet.</strong><span>Create one with a keyword, or try “Drop me in”.</span></div>
            ) : (
              <div className="circle-room-list">
                {circleList.map((circle) => (
                  <button className="circle-room-row" type="button" key={circle.circleId} onClick={() => onEnter("join", circle.keyword)} disabled={busy}>
                    <span className="circle-room-orb" aria-hidden="true"><i /></span>
                    <span className="circle-room-copy"><strong>{circle.keyword}</strong><small>{circle.memberCount} / 6 in the room</small></span>
                    <span className="circle-room-join">Join <b aria-hidden="true">↗</b></span>
                  </button>
                ))}
              </div>
            )}
          </>
        );
      })()}
    </section>
  );
}
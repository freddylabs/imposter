import { useState } from "react";
import type { RoleMode } from "../game/room";
import { Button, Notice } from "../components/ui";
import { leaderKey, socketUrl } from "../net/useRoom";

export function CreateScreen() {
  const [leaderName, setLeaderName] = useState("");
  const [word, setWord] = useState("");
  const [mode, setMode] = useState<RoleMode>("inclusive");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function openRoom() {
    setError(null);
    setBusy(true);
    const socket = new WebSocket(socketUrl());
    const timer = window.setTimeout(() => {
      socket.close();
      setBusy(false);
      setError("The room did not open. Check that the game server is running.");
    }, 8000);
    socket.onerror = () => {
      window.clearTimeout(timer);
      setBusy(false);
      setError("The room did not open. Check that the game server is running.");
    };
    socket.onmessage = (event) => {
      const message = JSON.parse(String(event.data)) as { type?: string; code?: string; token?: string; message?: string };
      window.clearTimeout(timer);
      if (message.type === "created" && message.code && message.token) {
        sessionStorage.setItem(leaderKey(message.code), message.token);
        socket.close();
        window.location.assign(`/host/${message.code}`);
        return;
      }
      setBusy(false);
      setError(message.message ?? "The room could not be created.");
      socket.close();
    };
    socket.onopen = () => {
      socket.send(JSON.stringify({ type: "create", leaderName, word, mode }));
    };
  }

  return (
    <div className="home-screen">
      <div>
        <p className="kicker">Create game</p>
        <h1>Set the table</h1>
        <p className="lede">Three rounds, one at a time. You can change the players and the word between rounds.</p>
      </div>
      <Notice>{error}</Notice>
      <label className="field">
        <span>Leader name</span>
        <input
          className="input"
          value={leaderName}
          maxLength={18}
          autoComplete="nickname"
          onChange={(event) => setLeaderName(event.target.value)}
        />
      </label>
      <label className="field">
        <span>Secret word for round 1</span>
        <input
          className="input"
          value={word}
          maxLength={40}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          onChange={(event) => setWord(event.target.value)}
        />
      </label>
      <div className="mode-grid">
        <button
          type="button"
          className="mode-card classic"
          aria-pressed={mode === "inclusive"}
          onClick={() => setMode("inclusive")}
        >
          <span className="kicker">Leader plays</span>
          <span className="mode-title">Inclusive</span>
          <span className="mode-copy">You take a seat. The system picks the imposter, and even you might be it.</span>
        </button>
        <button
          type="button"
          className="mode-card bible"
          aria-pressed={mode === "exclusive"}
          onClick={() => setMode("exclusive")}
        >
          <span className="kicker">Leader hosts</span>
          <span className="mode-title">Exclusive</span>
          <span className="mode-copy">You do not play. You choose who the imposter is, and that choice stays on your phone.</span>
        </button>
      </div>
      <Button shimmer disabled={busy || leaderName.trim().length === 0 || word.trim().length === 0} onClick={openRoom}>
        {busy ? "Opening…" : "Open the room"}
      </Button>
      <p className="note">5 to 8 players. One imposter. The word is never shown on the audience screen.</p>
    </div>
  );
}

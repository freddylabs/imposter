import { useEffect, useRef, useState, type ReactNode } from "react";
import type { PastRound, PrivateCard, PublicPlayer } from "../game/room";
import { Avatar, Button } from "./ui";

const CONFETTI = ["#e2a56a", "#f0c27a", "#8fc9aa", "#e07a5f", "#f6f1e8", "#aac4e0"];

export function Celebration({
  audienceWon,
  imposterName,
  word,
  pickName,
}: {
  audienceWon: boolean;
  imposterName: string;
  word: string;
  pickName: string;
}) {
  return (
    <section className={`celebrate ${audienceWon ? "audience-win" : "imposter-win"}`} aria-live="polite">
      <div className="confetti" aria-hidden="true">
        {CONFETTI.concat(CONFETTI, CONFETTI).map((color, index) => (
          <i
            key={`${color}-${index}`}
            style={{
              left: `${(index * 13) % 100}%`,
              background: color,
              animationDelay: `${(index % 7) * 0.07}s`,
            }}
          />
        ))}
      </div>
      <p className="kicker">{audienceWon ? "Audience wins" : "Imposter wins"}</p>
      <h1>{audienceWon ? "Congratulations, audience" : "Congratulations, imposter"}</h1>
      <p className="lede">
        {audienceWon
          ? `You found ${imposterName}.`
          : `${imposterName} got through. The audience chose ${pickName}.`}
      </p>
      <p className="secret-card public" style={{ marginTop: 8 }}>
        <span className="eyebrow">The word</span>
        <span className="headline">{word}</span>
      </p>
    </section>
  );
}

export function SecretHold({ card }: { card: PrivateCard }) {
  const [open, setOpen] = useState(false);
  const timer = useRef<number | null>(null);
  const cardRef = useRef<HTMLButtonElement | null>(null);
  const word = card.word ?? "";
  const size = word.length > 28 ? " xlong" : word.length > 16 ? " long" : "";

  useEffect(() => {
    if (open) cardRef.current?.scrollIntoView({ block: "center" });
  }, [open]);

  function press() {
    timer.current = window.setTimeout(() => setOpen(true), 240);
  }
  function release() {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
    setOpen(false);
  }

  return (
    <button
      type="button"
      ref={cardRef}
      className={`secret-card${open ? " showing" : ""}`}
      onPointerDown={press}
      onPointerUp={release}
      onPointerLeave={release}
      onPointerCancel={release}
      onKeyDown={(event) => {
        if (event.key === " " || event.key === "Enter") {
          event.preventDefault();
          setOpen(true);
        }
      }}
      onKeyUp={(event) => {
        if (event.key === " " || event.key === "Enter") setOpen(false);
      }}
      aria-label={open ? "Release to hide your card" : "Hold to see what you received"}
    >
      {open && card.isImposter ? (
        <>
          <p className="eyebrow">Imposter</p>
          <p className="headline quiet">Imposter</p>
          <p className="footnote">You did not receive the word. Give a clue that could pass.</p>
        </>
      ) : null}
      {open && !card.isImposter ? (
        <>
          <p className="eyebrow">Your word</p>
          <p className={`headline${size}`}>{card.word}</p>
          <p className="footnote">Only you can see this. Do not say the word.</p>
        </>
      ) : null}
      {!open ? (
        <>
          <p className="eyebrow">Private</p>
          <p className="headline quiet">Hold</p>
          <p className="footnote">Hold to see what you received. Let go and it hides again.</p>
        </>
      ) : null}
    </button>
  );
}

export function Roster({
  players,
  revealId,
  extra,
}: {
  players: PublicPlayer[];
  revealId?: string | null;
  extra?: (player: PublicPlayer) => ReactNode;
}) {
  if (players.length === 0) return <p className="empty">Waiting for players.</p>;
  return (
    <ul className="roster" aria-live="polite">
      {players.map((player) => (
        <li key={player.id} className={`person${revealId === player.id ? " picked" : ""}`}>
          <Avatar name={player.name} />
          <span className="who">
            <strong>{player.name}</strong>
            <span>
              {player.connected ? "Here" : "Away"}
              {player.isLeader ? " · Leader" : ""}
            </span>
          </span>
          {revealId === player.id ? <span className="role imposter">Imposter</span> : null}
          {extra ? extra(player) : null}
          <span className={player.connected ? "dot" : "dot off"} aria-hidden="true" />
        </li>
      ))}
    </ul>
  );
}

export function ClueBoard({ players, waiting }: { players: PublicPlayer[]; waiting: boolean }) {
  return (
    <div className="stage-clues">
      {players.map((player) => (
        <article key={player.id} className="clue-tile">
          <p className="kicker">{player.name}</p>
          {player.clue ? <h2>{player.clue}</h2> : <p className="writing">{waiting ? "Writing…" : "No clue yet"}</p>}
        </article>
      ))}
    </div>
  );
}

export function ScoreLine({ history }: { history: PastRound[] }) {
  if (history.length === 0) return null;
  const audience = history.filter((round) => round.audienceWon).length;
  return (
    <p className="scoreline">
      Audience {audience} · Imposter {history.length - audience}
    </p>
  );
}

export function ShareLinks({ code }: { code: string }) {
  const origin = window.location.origin;
  return (
    <div className="share-grid">
      <ShareCard label="Player link" href={`${origin}/join/${code}`} hint="Each player opens this, then enters a name." />
      <ShareCard label="Audience display" href={`${origin}/watch/${code}`} hint="Open this on the screen the room can see." />
    </div>
  );
}

function ShareCard({ label, href, hint }: { label: string; href: string; hint: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="share-card">
      <strong>{label}</strong>
      <a href={href}>{href.replace(/^https?:\/\//, "")}</a>
      <p className="quiet">{hint}</p>
      <Button
        shimmer
        onClick={() => {
          void navigator.clipboard.writeText(href).then(
            () => {
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1600);
            },
            () => setCopied(false),
          );
        }}
      >
        {copied ? "Copied" : "Copy link"}
      </Button>
    </div>
  );
}

export function roundTitle(round: number, maxRounds: number, phase: string): string {
  if (phase === "lobby") return round >= maxRounds ? "Game over" : "Lobby";
  return `Round ${round} of ${maxRounds}`;
}

export function ClueForm({
  value,
  onChange,
  onSubmit,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
}) {
  return (
    <form
      className="field"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <label className="field">
        <span>Your clue</span>
        <input
          className="input"
          value={value}
          maxLength={42}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="send"
          placeholder="One short clue"
          onChange={(event) => onChange(event.target.value)}
        />
      </label>
      <p className="note">What you type stays on this phone until you send it. The audience only sees a sent clue.</p>
      <Button shimmer type="submit" disabled={value.trim().length === 0}>
        Send clue
      </Button>
    </form>
  );
}

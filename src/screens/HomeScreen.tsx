import { useState } from "react";
import { Button } from "../components/ui";

const STEPS = [
  ["Create the game", "Set the secret word and whether the leader plays."],
  ["Share the code", "Players join on their own phones. The audience opens the display."],
  ["Play one round", "Each player sees a private card, then types a clue on their own screen."],
  ["Poll the room", "Vote outside the app. The leader enters the result and the imposter is revealed."],
];

function savedCode(): string | null {
  for (let index = 0; index < sessionStorage.length; index += 1) {
    const key = sessionStorage.key(index);
    if (key?.startsWith("imposter.leader.")) return key.slice("imposter.leader.".length);
  }
  return null;
}

export function HomeScreen() {
  const [code, setCode] = useState("");
  const host = savedCode();
  const ready = /^[A-Z0-9]{4}$/.test(code);

  return (
    <div className="home-screen">
      <div className="home-intro">
        <p className="kicker">Party game</p>
        <h1 className="display">Imposter</h1>
        <p className="lede">
          One secret word. One imposter. Three rounds, played one at a time, with the audience voting from the room.
        </p>
        <div className="home-actions">
          <a className="btn primary shimmer" href="/create">
            Create game
          </a>
          {host ? (
            <a className="btn ghost" href={`/host/${host}`}>
              Return to {host}
            </a>
          ) : null}
        </div>
      </div>
      <form
        className="panel"
        onSubmit={(event) => {
          event.preventDefault();
          if (ready) window.location.assign(`/join/${code}`);
        }}
      >
        <label className="field">
          <span>Room code</span>
          <input
            className="input"
            value={code}
            maxLength={4}
            autoCapitalize="characters"
            autoComplete="off"
            placeholder="Type the room code"
            aria-label="Room code"
            onChange={(event) => setCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4))}
          />
        </label>
        <Button type="submit" disabled={!ready}>
          Join with code
        </Button>
      </form>
      <div className="home-extra">
        <ol className="steps">
          {STEPS.map(([title, copy], index) => (
            <li key={title} className="step">
              <span className="step-num">{index + 1}</span>
              <span className="step-copy">
                <strong>{title}</strong>
                <span>{copy}</span>
              </span>
            </li>
          ))}
        </ol>
        <p className="note">A table is 5 to 8 players. Names are public. Who the imposter is stays private until the reveal.</p>
      </div>
    </div>
  );
}

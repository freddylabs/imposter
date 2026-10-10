import { useEffect, useState } from "react";
import { ClueBoard, ClueForm, Celebration, Roster, RoomCode, ScoreLine, SecretHold, roundTitle } from "../components/play";
import { Button, Notice, Screen } from "../components/ui";
import { playerKey, useRoom } from "../net/useRoom";

export function PlayerScreen({ code }: { code?: string }) {
  const [sessionCode, setSessionCode] = useState(code ?? "");
  const [typedCode, setTypedCode] = useState(code ?? "");
  const [name, setName] = useState("");
  const [pendingName, setPendingName] = useState<string | null>(null);
  const [dropped, setDropped] = useState(false);
  const [clue, setClue] = useState("");
  const token = !dropped && sessionCode ? sessionStorage.getItem(playerKey(sessionCode)) : null;
  const hello = token
    ? ({ kind: "player", token } as const)
    : pendingName
      ? ({ kind: "player", name: pendingName } as const)
      : null;
  const { view, error, status, send } = useRoom(sessionCode || "none", sessionCode ? hello : null);

  useEffect(() => {
    if (error === "This phone is not in that game." && sessionCode) {
      sessionStorage.removeItem(playerKey(sessionCode));
      setDropped(true);
      setPendingName(null);
    }
  }, [error, sessionCode]);

  useEffect(() => {
    if (!view || !sessionCode) return;
    const next = `/join/${sessionCode}`;
    if (window.location.pathname.toLowerCase() !== next.toLowerCase()) {
      window.history.replaceState(null, "", next);
    }
    document.title = `${view.players.find((player) => player.id === view.selfId)?.name ?? "Player"} · Imposter`;
  }, [view, sessionCode]);

  if (!view && token && !dropped && status !== "closed") {
    return (
      <Screen>
        <RoomCode code={sessionCode} compact detail="Rejoining this game." />
        <h1>Rejoining the table</h1>
        <Notice>{error}</Notice>
      </Screen>
    );
  }

  if (!view) {
    const readyName = name.trim().length > 0;
    const readyCode = /^[A-Z0-9]{4}$/.test(typedCode);
    return (
      <Screen>
        <p className="kicker">Join</p>
        <h1>{sessionCode ? "Enter your name" : "Enter the room code"}</h1>
        {sessionCode ? <RoomCode code={sessionCode} detail="This is the code for the game you are joining." /> : null}
        <p className="lede">Your name shows in the lobby. Your card does not.</p>
        <Notice>{error}</Notice>
        {status === "connecting" && hello ? <p className="note">Joining the table…</p> : null}
        <form
          className="stack"
          onSubmit={(event) => {
            event.preventDefault();
            if (!readyName || !readyCode) return;
            setDropped(false);
            setSessionCode(typedCode);
            setPendingName(name.trim());
          }}
        >
          {code ? null : (
            <label className="field">
              <span>Room code</span>
              <input
                className="input"
                value={typedCode}
                maxLength={4}
                autoCapitalize="characters"
                autoComplete="off"
                onChange={(event) => setTypedCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4))}
              />
            </label>
          )}
          <label className="field">
            <span>Your name</span>
            <input
              className="input"
              value={name}
              maxLength={18}
              autoComplete="nickname"
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <Button type="submit" shimmer disabled={!readyName || !readyCode || status === "connecting"}>
            Join the table
          </Button>
        </form>
      </Screen>
    );
  }

  const mine = view.players.find((player) => player.id === view.selfId);

  return (
    <Screen>
      <p className="kicker">{roundTitle(view.round, view.maxRounds, view.phase)}</p>
      <h1>{mine?.name ?? "You"}</h1>
      <RoomCode code={view.code} compact detail="You are in this game." />
      <Notice>{error}</Notice>
      {view.phase === "lobby" ? (
        <div className="stack">
          <p className="lede">You are in. The leader starts the round when the table is full. Roles stay hidden.</p>
          <Roster players={view.players} />
        </div>
      ) : null}
      {view.phase === "roles" || view.phase === "clues" ? (
        <div className="stack">
          {view.privateCard ? <SecretHold card={view.privateCard} /> : null}
          {view.phase === "clues" && mine && !mine.clue ? (
            <ClueForm
              value={clue}
              onChange={setClue}
              onSubmit={() => {
                send({ type: "clue", clue });
                setClue("");
              }}
            />
          ) : null}
          {view.phase === "clues" && mine?.clue ? <p className="note">Your clue is in. The audience can see it now.</p> : null}
          {view.phase === "clues" ? <ClueBoard players={view.players} waiting /> : <Roster players={view.players} />}
        </div>
      ) : null}
      {view.phase === "poll" ? (
        <div className="stack">
          <p className="lede">The audience is voting outside the game.</p>
          <ClueBoard players={view.players} waiting={false} />
        </div>
      ) : null}
      {view.phase === "reveal" && view.reveal ? (
        <div className="stack">
          <Celebration
            audienceWon={view.reveal.audienceWon}
            imposterName={view.reveal.imposterName}
            word={view.reveal.word}
            pickName={view.reveal.pollPickName}
          />
          <ScoreLine history={view.history} />
          {view.round < view.maxRounds ? <p className="note">Stay on this page. The next round opens when the leader is ready.</p> : null}
        </div>
      ) : null}
    </Screen>
  );
}
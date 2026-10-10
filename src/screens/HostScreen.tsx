import { useEffect, useState } from "react";
import type { ClientView } from "../game/room";
import {
  Celebration,
  ClueBoard,
  ClueForm,
  Roster,
  RoomCode,
  ScoreLine,
  SecretHold,
  ShareLinks,
  roundTitle,
} from "../components/play";
import { Button, Notice, Screen } from "../components/ui";
import { leaderKey, useRoom } from "../net/useRoom";

type Send = (payload: Record<string, unknown>) => void;

export function HostScreen({ code }: { code: string }) {
  const token = sessionStorage.getItem(leaderKey(code));
  const { view, error, status, send } = useRoom(code, token ? { kind: "leader", token } : null);
  const [word, setWord] = useState("");
  const [dirty, setDirty] = useState(false);
  const [clue, setClue] = useState("");
  const [pick, setPick] = useState<string | null>(null);

  useEffect(() => {
    if (!view || view.phase !== "lobby") {
      setWord("");
      setDirty(false);
      return;
    }
    if (!view.hostWord) return;
    if (!dirty) setWord(view.hostWord);
    if (word.trim() === view.hostWord) setDirty(false);
  }, [dirty, view, word]);

  useEffect(() => {
    document.title = `Room code ${code} · Imposter`;
  }, [code]);

  if (!token) {
    return (
      <Screen>
        <p className="kicker">Leader</p>
        <h1>Use the phone that created the game</h1>
        <p className="lede">Players join with the code. The audience display is a separate link.</p>
      </Screen>
    );
  }

  if (!view) {
    return (
      <Screen>
        <RoomCode code={code} compact />
        <h1>{status === "closed" ? "The room is offline" : "Opening the room"}</h1>
        <Notice>{error}</Notice>
      </Screen>
    );
  }

  const wordChanged = dirty && word.trim() !== (view.hostWord ?? "");

  return (
    <Screen>
      <p className="kicker">{roundTitle(view.round, view.maxRounds, view.phase)}</p>
      <RoomCode
        code={view.code}
        compact={view.phase !== "lobby"}
        detail={view.phase === "lobby" ? "This is the code. Players type it to join the game." : undefined}
      />
      <p className="lede">
        {view.mode === "inclusive"
          ? "You are in the game. You will not be told whether you are the imposter."
          : "You are hosting this round. You choose the imposter, and you do not take a card."}
      </p>
      <Notice>{error}</Notice>
      {view.phase === "lobby" ? <ShareLinks code={view.code} /> : null}
      {view.phase === "lobby" ? (
        <Lobby view={view} word={word} wordChanged={wordChanged} setWord={setWord} setDirty={setDirty} send={send} />
      ) : null}
      {view.phase === "roles" ? <Roles view={view} send={send} /> : null}
      {view.phase === "clues" ? <Clues view={view} clue={clue} setClue={setClue} send={send} /> : null}
      {view.phase === "poll" ? <Poll view={view} pick={pick} setPick={setPick} send={send} /> : null}
      {view.phase === "reveal" && view.reveal ? (
        <div className="stack">
          <Celebration
            audienceWon={view.reveal.audienceWon}
            imposterName={view.reveal.imposterName}
            word={view.reveal.word}
            pickName={view.reveal.pollPickName}
          />
          <ScoreLine history={view.history} />
          <Roster players={view.players} revealId={view.reveal.imposterId} />
          {view.round < view.maxRounds ? (
            <>
              <Button shimmer onClick={() => send({ type: "next" })}>
                Next round
              </Button>
              <p className="note">Players can leave or join, and you can change the word, before the next round starts.</p>
            </>
          ) : (
            <p className="lede">That was the last round.</p>
          )}
        </div>
      ) : null}
    </Screen>
  );
}

function Lobby({
  view,
  word,
  wordChanged,
  setWord,
  setDirty,
  send,
}: {
  view: ClientView;
  word: string;
  wordChanged: boolean;
  setWord: (value: string) => void;
  setDirty: (value: boolean) => void;
  send: Send;
}) {
  return (
    <div className="stack">
      <label className="field">
        <span>Secret word</span>
        <input
          className="input"
          value={word}
          maxLength={40}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          onChange={(event) => {
            setDirty(true);
            setWord(event.target.value);
          }}
        />
      </label>
      {wordChanged ? (
        <Button
          onClick={() => send({ type: "set-word", word })}
          disabled={word.trim().length === 0}
        >
          Save word
        </Button>
      ) : null}
      <div className="panel">
        <p className="kicker">
          {view.players.length} joined · {view.minPlayers} to {view.maxPlayers}
        </p>
        <p className="note">Everyone can see who joined. Nobody can see who the imposter is.</p>
        <Roster
          players={view.players}
          extra={(player) => (
            <>
              {view.mode === "exclusive" ? (
                <Button
                  variant={view.chosenImposterId === player.id ? "primary" : "ghost"}
                  onClick={() => send({ type: "choose-imposter", playerId: player.id })}
                >
                  {view.chosenImposterId === player.id ? "Selected" : "Choose"}
                </Button>
              ) : null}
              {!player.isLeader ? (
                <Button variant="text" onClick={() => send({ type: "remove-player", playerId: player.id })}>
                  Remove
                </Button>
              ) : null}
            </>
          )}
        />
      </div>
      {view.mode === "exclusive" ? (
        <p className="note">Your choice stays on this phone. The audience screen never shows it.</p>
      ) : null}
      <Button shimmer disabled={Boolean(view.startBlocker) || wordChanged} onClick={() => send({ type: "start" })}>
        Start round {Math.min(view.maxRounds, view.round + 1)}
      </Button>
      <p className="note">{wordChanged ? "Save the word before you start." : view.startBlocker ?? "One imposter. The system keeps the choice secret."}</p>
    </div>
  );
}

function Roles({ view, send }: { view: ClientView; send: Send }) {
  return (
    <div className="stack">
      <p className="lede">Cards are on each phone. The audience only sees the names.</p>
      {view.privateCard ? <SecretHold card={view.privateCard} /> : null}
      <Roster players={view.players} />
      <Button shimmer onClick={() => send({ type: "open-clues" })}>
        Collect clues
      </Button>
    </div>
  );
}

function Clues({
  view,
  clue,
  setClue,
  send,
}: {
  view: ClientView;
  clue: string;
  setClue: (value: string) => void;
  send: Send;
}) {
  const mine = view.players.find((player) => player.id === view.selfId);
  return (
    <div className="stack">
      <p className="lede">Clues are typed on each player’s phone. The audience sees a clue only after it is sent.</p>
      {view.privateCard ? <SecretHold card={view.privateCard} /> : null}
      {mine && !mine.clue ? (
        <ClueForm
          value={clue}
          onChange={setClue}
          onSubmit={() => {
            send({ type: "clue", clue });
            setClue("");
          }}
        />
      ) : null}
      {mine?.clue ? <p className="note">Your clue is in.</p> : null}
      <ClueBoard players={view.players} waiting />
      {view.players
        .filter((player) => !player.connected && !player.clue)
        .map((player) => (
          <Button key={player.id} variant="ghost" onClick={() => send({ type: "skip-clue", playerId: player.id })}>
            Skip {player.name}
          </Button>
        ))}
    </div>
  );
}

function Poll({
  view,
  pick,
  setPick,
  send,
}: {
  view: ClientView;
  pick: string | null;
  setPick: (value: string) => void;
  send: Send;
}) {
  return (
    <div className="stack">
      <p className="lede">Have the audience vote outside the game. Then enter who they chose.</p>
      <ClueBoard players={view.players} waiting={false} />
      <fieldset className="choice-list">
        <legend>Audience pick</legend>
        {view.players.map((player) => (
          <label key={player.id} className={`person${pick === player.id ? " picked" : ""}`}>
            <input
              type="radio"
              name="poll"
              checked={pick === player.id}
              onChange={() => setPick(player.id)}
            />
            <span className="who">
              <strong>{player.name}</strong>
            </span>
          </label>
        ))}
      </fieldset>
      <Button shimmer disabled={!pick} onClick={() => pick && send({ type: "poll", playerId: pick })}>
        Reveal the imposter
      </Button>
    </div>
  );
}

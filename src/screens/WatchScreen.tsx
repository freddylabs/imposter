import { useEffect } from "react";
import { Celebration, ClueBoard, Roster, ScoreLine, roundTitle } from "../components/play";
import { Notice, Screen } from "../components/ui";
import { useRoom } from "../net/useRoom";

export function WatchScreen({ code }: { code: string }) {
  const { view, error, status } = useRoom(code, { kind: "audience" });

  useEffect(() => {
    document.title = `Audience ${code} · Imposter`;
  }, [code]);

  if (!view) {
    return (
      <Screen className="stage">
        <p className="kicker">Audience</p>
        <h1 className="code-chip">{code}</h1>
        <p className="lede">{status === "closed" ? "This display is offline." : "Connecting the display…"}</p>
        <Notice>{error}</Notice>
      </Screen>
    );
  }

  return (
    <Screen className="stage">
      <p className="kicker">{roundTitle(view.round, view.maxRounds, view.phase)} · Audience</p>
      <h1 className="code-chip">{view.code}</h1>
      <Notice>{error}</Notice>
      {view.phase === "lobby" ? (
        <div className="stack">
          <p className="lede">
            {view.players.length} at the table. Join on your phone with this code. Roles are not shown here.
          </p>
          <Roster players={view.players} />
        </div>
      ) : null}
      {view.phase === "roles" ? (
        <div className="stack">
          <p className="lede">Cards are out. Each player looks at their own phone.</p>
          <Roster players={view.players} />
        </div>
      ) : null}
      {view.phase === "clues" ? (
        <div className="stack">
          <p className="lede">Sent clues land here. A clue still being typed stays on that player’s phone.</p>
          <ClueBoard players={view.players} waiting />
        </div>
      ) : null}
      {view.phase === "poll" ? (
        <div className="stack">
          <p className="lede">Vote now, outside the game. The leader will enter the result.</p>
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
          <Roster players={view.players} revealId={view.reveal.imposterId} />
        </div>
      ) : null}
    </Screen>
  );
}
import { describe, expect, it } from "vitest";
import {
  MAX_PLAYERS,
  MIN_PLAYERS,
  backToLobby,
  chooseImposter,
  createRoom,
  enterPoll,
  joinPlayer,
  openClues,
  removePlayer,
  startRound,
  submitClue,
  viewFor,
  type Room,
} from "./room";

const WORD = "Lighthouse";

function room(mode: "inclusive" | "exclusive", extra = 0): Room {
  const created = createRoom({
    code: "ABCD",
    leaderToken: "leader-token",
    leaderId: "leader",
    leaderName: "Ava",
    mode,
    word: WORD,
  });
  if (!created.ok) throw new Error(created.error);
  let next = created.room;
  const start = mode === "inclusive" ? 1 : 0;
  for (let index = start; index < start + extra; index += 1) {
    const joined = joinPlayer(next, { id: `p${index}`, token: `t${index}`, name: `Player ${index}` });
    if (!joined.ok) throw new Error(joined.error);
    next = joined.room;
  }
  return next;
}

function fill(mode: "inclusive" | "exclusive"): Room {
  return room(mode, MIN_PLAYERS - (mode === "inclusive" ? 1 : 0));
}

describe("table size", () => {
  it("refuses to start below five or above eight", () => {
    const short = startRound(room("inclusive", 3), () => 0);
    expect(short.ok).toBe(false);
    let full = room("inclusive", MAX_PLAYERS - 1);
    const ninth = joinPlayer(full, { id: "late", token: "late", name: "Late" });
    expect(ninth.ok).toBe(false);
    if (!ninth.ok) expect(ninth.error).toMatch(/eight/i);
  });

  it("lets players change between rounds and locks the roster during one", () => {
    let table = fill("inclusive");
    const started = startRound(table, () => 0);
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    const removed = removePlayer(started.room, "p1");
    expect(removed.ok).toBe(false);
  });
});

describe("who the imposter is", () => {
  it("can pick the leader in an inclusive game and does not tell them in the shared view", () => {
    const started = startRound(fill("inclusive"), () => 0);
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    expect(started.room.imposterId).toBe("leader");
    const leader = viewFor(started.room, { kind: "leader" });
    expect(leader.privateCard).toEqual({ isImposter: true, word: null });
    expect(JSON.stringify(leader)).not.toContain(WORD);
    expect(JSON.stringify(leader.players)).not.toContain("imposter");
    const audience = viewFor(started.room, { kind: "audience" });
    expect(audience.privateCard).toBeNull();
    expect(JSON.stringify(audience)).not.toContain(WORD);
    expect(JSON.stringify(audience)).not.toContain("imposterId");
  });

  it("uses the host's choice in an exclusive game and hides it once the round starts", () => {
    let table = fill("exclusive");
    const unchosen = startRound(table, () => 0);
    expect(unchosen.ok).toBe(false);
    const picked = chooseImposter(table, "p1");
    expect(picked.ok).toBe(true);
    if (!picked.ok) return;
    const started = startRound(picked.room, () => 0.99);
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    expect(started.room.imposterId).toBe("p1");
    const leader = viewFor(started.room, { kind: "leader" });
    expect(leader.chosenImposterId).toBeNull();
    expect(leader.privateCard).toBeNull();
    expect(JSON.stringify(leader)).not.toContain(WORD);
    expect(JSON.stringify(leader).includes(`"imposterId"`)).toBe(false);
  });

  it("gives the word only to the crew member who holds that phone", () => {
    const started = startRound(fill("inclusive"), () => 0.99);
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    const crew = viewFor(started.room, { kind: "player", playerId: "p1" });
    const imposterId = started.room.imposterId;
    expect(imposterId).not.toBe("p1");
    expect(crew.privateCard?.word).toBe(WORD);
    expect(crew.privateCard?.isImposter).toBe(false);
    const imposter = viewFor(started.room, { kind: "player", playerId: imposterId ?? "" });
    expect(imposter.privateCard).toEqual({ isImposter: true, word: null });
    expect(JSON.stringify(imposter)).not.toContain(WORD);
  });
});

describe("clues and the outside poll", () => {
  function toClues(mode: "inclusive" | "exclusive" = "inclusive"): Room {
    let table = fill(mode);
    if (mode === "exclusive") {
      const picked = chooseImposter(table, "p0");
      if (!picked.ok) throw new Error(picked.error);
      table = picked.room;
    }
    const started = startRound(table, () => 0.5);
    if (!started.ok) throw new Error(started.error);
    const opened = openClues(started.room);
    if (!opened.ok) throw new Error(opened.error);
    return opened.room;
  }

  it("keeps a clue off the audience view until it is submitted", () => {
    const table = toClues();
    const audience = viewFor(table, { kind: "audience" });
    expect(audience.players.every((player) => player.clue === null)).toBe(true);
    const sent = submitClue(table, "p1", "beam");
    expect(sent.ok).toBe(true);
    if (!sent.ok) return;
    const after = viewFor(sent.room, { kind: "audience" });
    expect(after.players.find((player) => player.id === "p1")?.clue).toBe("beam");
    expect(after.players.find((player) => player.id === "p2")?.clue).toBeNull();
    expect(JSON.stringify(after)).not.toContain(WORD);
  });

  it("says the audience won only when their pick is the imposter", () => {
    let table = toClues();
    for (const player of table.players) {
      const sent = submitClue(table, player.id, `clue ${player.name}`);
      if (!sent.ok) throw new Error(sent.error);
      table = sent.room;
    }
    expect(table.phase).toBe("poll");
    const miss = enterPoll(table, table.players.find((player) => player.id !== table.imposterId)!.id);
    expect(miss.ok).toBe(true);
    if (!miss.ok) return;
    expect(viewFor(miss.room, { kind: "audience" }).reveal?.audienceWon).toBe(false);
    expect(viewFor(miss.room, { kind: "audience" }).reveal?.word).toBe(WORD);

    let again = toClues();
    for (const player of again.players) {
      const sent = submitClue(again, player.id, `clue ${player.name}`);
      if (!sent.ok) throw new Error(sent.error);
      again = sent.room;
    }
    const hit = enterPoll(again, again.imposterId!);
    expect(hit.ok).toBe(true);
    if (!hit.ok) return;
    expect(viewFor(hit.room, { kind: "audience" }).reveal?.audienceWon).toBe(true);
  });

  it("plays three rounds one at a time and then stops", () => {
    let table = fill("inclusive");
    for (let round = 1; round <= 3; round += 1) {
      const started = startRound(table, () => 0.2);
      expect(started.ok).toBe(true);
      if (!started.ok) return;
      let live = started.room;
      const opened = openClues(live);
      if (!opened.ok) throw new Error(opened.error);
      live = opened.room;
      for (const player of live.players) {
        const sent = submitClue(live, player.id, `r${round}`);
        if (!sent.ok) throw new Error(sent.error);
        live = sent.room;
      }
      const revealed = enterPoll(live, live.players[0]!.id);
      if (!revealed.ok) throw new Error(revealed.error);
      expect(revealed.room.round).toBe(round);
      if (round < 3) {
        const lobby = backToLobby(revealed.room);
        expect(lobby.ok).toBe(true);
        if (!lobby.ok) return;
        const leaving = lobby.room.players.find((player) => !player.isLeader);
        const dropped = removePlayer(lobby.room, leaving?.id ?? "");
        expect(dropped.ok).toBe(true);
        if (!dropped.ok) return;
        const joined = joinPlayer(dropped.room, { id: `n${round}`, token: `n${round}`, name: `New ${round}` });
        expect(joined.ok).toBe(true);
        if (!joined.ok) return;
        table = joined.room;
        expect(table.phase).toBe("lobby");
        expect(table.imposterId).toBeNull();
      } else {
        expect(backToLobby(revealed.room).ok).toBe(false);
        expect(startRound(revealed.room, () => 0).ok).toBe(false);
      }
    }
  });
});

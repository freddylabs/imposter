export const MIN_PLAYERS = 5;
export const MAX_PLAYERS = 8;
export const MAX_ROUNDS = 3;
export const MAX_NAME = 18;
export const MAX_WORD = 40;
export const MAX_CLUE = 42;

export type RoleMode = "inclusive" | "exclusive";
export type Phase = "lobby" | "roles" | "clues" | "poll" | "reveal";

export type Player = {
  id: string;
  token: string;
  name: string;
  connected: boolean;
  clue: string | null;
  seen: boolean;
  isLeader: boolean;
};

export type PastRound = {
  round: number;
  word: string;
  imposterId: string;
  imposterName: string;
  pollPickId: string;
  pollPickName: string;
  audienceWon: boolean;
};

export type Room = {
  code: string;
  leaderToken: string;
  leaderName: string;
  mode: RoleMode;
  word: string;
  round: number;
  phase: Phase;
  imposterId: string | null;
  chosenImposterId: string | null;
  pollPickId: string | null;
  players: Player[];
  history: PastRound[];
};

export type PublicPlayer = {
  id: string;
  name: string;
  connected: boolean;
  clue: string | null;
  isLeader: boolean;
};

export type PrivateCard = {
  isImposter: boolean;
  word: string | null;
};

export type Reveal = {
  imposterId: string;
  imposterName: string;
  word: string;
  pollPickId: string;
  pollPickName: string;
  audienceWon: boolean;
};

export type ClientKind = "audience" | "player" | "leader";

export type ClientView = {
  kind: ClientKind;
  code: string;
  phase: Phase;
  round: number;
  maxRounds: number;
  mode: RoleMode;
  leaderName: string;
  players: PublicPlayer[];
  history: PastRound[];
  reveal: Reveal | null;
  privateCard: PrivateCard | null;
  hostWord: string | null;
  chosenImposterId: string | null;
  selfId: string | null;
  startBlocker: string | null;
  minPlayers: number;
  maxPlayers: number;
};

export type Result = { ok: true; room: Room } | { ok: false; error: string };

const NAME = /^[\p{L}\p{N}][\p{L}\p{N} '’-]*$/u;

export function cleanName(raw: string): string | null {
  const name = raw.trim().replace(/\s+/g, " ");
  if (name.length < 1 || name.length > MAX_NAME) return null;
  if (!NAME.test(name)) return null;
  return name;
}

export function cleanWord(raw: string): string | null {
  const word = raw.trim().replace(/\s+/g, " ");
  if (word.length < 1 || word.length > MAX_WORD) return null;
  return word;
}

export function cleanClue(raw: string): string | null {
  const clue = raw.trim().replace(/\s+/g, " ");
  if (clue.length < 1 || clue.length > MAX_CLUE) return null;
  return clue;
}

function taken(room: Room, name: string, exceptId?: string): boolean {
  const key = name.toLocaleLowerCase();
  if (room.mode === "exclusive" && room.leaderName.toLocaleLowerCase() === key) return true;
  return room.players.some((player) => player.id !== exceptId && player.name.toLocaleLowerCase() === key);
}

export function createRoom(input: {
  code: string;
  leaderToken: string;
  leaderId: string;
  leaderName: string;
  mode: RoleMode;
  word: string;
}): Result {
  const leaderName = cleanName(input.leaderName);
  if (!leaderName) return { ok: false, error: "Enter a leader name of 1 to 18 characters." };
  const word = cleanWord(input.word);
  if (!word) return { ok: false, error: "Enter the secret word before you open the room." };
  if (input.mode !== "inclusive" && input.mode !== "exclusive") {
    return { ok: false, error: "Choose how the leader plays." };
  }
  const players: Player[] =
    input.mode === "inclusive"
      ? [
          {
            id: input.leaderId,
            token: input.leaderToken,
            name: leaderName,
            connected: true,
            clue: null,
            seen: false,
            isLeader: true,
          },
        ]
      : [];
  return {
    ok: true,
    room: {
      code: input.code,
      leaderToken: input.leaderToken,
      leaderName,
      mode: input.mode,
      word,
      round: 0,
      phase: "lobby",
      imposterId: null,
      chosenImposterId: null,
      pollPickId: null,
      players,
      history: [],
    },
  };
}

export function joinPlayer(room: Room, input: { id: string; token: string; name: string }): Result {
  if (room.phase !== "lobby") return { ok: false, error: "This round has already started. Join before the next round." };
  if (room.players.length >= MAX_PLAYERS) return { ok: false, error: "This table is full. Eight is the maximum." };
  const name = cleanName(input.name);
  if (!name) return { ok: false, error: "Use a name of 1 to 18 letters or numbers." };
  if (taken(room, name)) return { ok: false, error: "That name is already at the table." };
  return {
    ok: true,
    room: {
      ...room,
      players: [
        ...room.players,
        { id: input.id, token: input.token, name, connected: true, clue: null, seen: false, isLeader: false },
      ],
    },
  };
}

export function setConnected(room: Room, playerId: string, connected: boolean): Room {
  return {
    ...room,
    players: room.players.map((player) => (player.id === playerId ? { ...player, connected } : player)),
  };
}

export function removePlayer(room: Room, playerId: string): Result {
  if (room.phase !== "lobby") return { ok: false, error: "Players can change between rounds, not during one." };
  const player = room.players.find((entry) => entry.id === playerId);
  if (!player) return { ok: false, error: "That player is not in the room." };
  if (player.isLeader) return { ok: false, error: "The leader stays for the whole game." };
  return {
    ok: true,
    room: {
      ...room,
      chosenImposterId: room.chosenImposterId === playerId ? null : room.chosenImposterId,
      players: room.players.filter((entry) => entry.id !== playerId),
    },
  };
}

export function setWord(room: Room, raw: string): Result {
  if (room.phase !== "lobby") return { ok: false, error: "The word can change before a round starts." };
  const word = cleanWord(raw);
  if (!word) return { ok: false, error: "Enter a secret word." };
  return { ok: true, room: { ...room, word } };
}

export function chooseImposter(room: Room, playerId: string): Result {
  if (room.mode !== "exclusive") return { ok: false, error: "In an inclusive game the system chooses the imposter." };
  if (room.phase !== "lobby") return { ok: false, error: "Choose the imposter before the round starts." };
  if (!room.players.some((player) => player.id === playerId)) return { ok: false, error: "Choose someone who has joined." };
  return { ok: true, room: { ...room, chosenImposterId: playerId } };
}

export function startBlocker(room: Room): string | null {
  if (room.phase !== "lobby") return "A round is already in progress.";
  if (room.round >= MAX_ROUNDS) return "All three rounds are finished.";
  if (!cleanWord(room.word)) return "Enter the secret word.";
  if (room.players.length < MIN_PLAYERS) {
    const count = room.players.length;
    return `Need ${MIN_PLAYERS} players. ${count} ${count === 1 ? "has" : "have"} joined.`;
  }
  if (room.players.length > MAX_PLAYERS) return `A table holds ${MAX_PLAYERS} players at most.`;
  if (room.mode === "exclusive" && !room.players.some((player) => player.id === room.chosenImposterId)) {
    return "Choose who the imposter is.";
  }
  return null;
}

export function startRound(room: Room, rng: () => number): Result {
  const blocker = startBlocker(room);
  if (blocker) return { ok: false, error: blocker };
  let imposterId: string;
  if (room.mode === "exclusive") {
    imposterId = room.chosenImposterId as string;
  } else {
    const index = Math.min(room.players.length - 1, Math.max(0, Math.floor(rng() * room.players.length)));
    const picked = room.players[index];
    if (!picked) return { ok: false, error: "Need players before the round can start." };
    imposterId = picked.id;
  }
  return {
    ok: true,
    room: {
      ...room,
      round: room.round + 1,
      phase: "roles",
      imposterId,
      pollPickId: null,
      players: room.players.map((player) => ({ ...player, clue: null, seen: false })),
    },
  };
}

export function markSeen(room: Room, playerId: string): Result {
  if (room.phase !== "roles" && room.phase !== "clues") return { ok: false, error: "Cards are not open." };
  if (!room.players.some((player) => player.id === playerId)) return { ok: false, error: "You are not in this round." };
  return {
    ok: true,
    room: {
      ...room,
      players: room.players.map((player) => (player.id === playerId ? { ...player, seen: true } : player)),
    },
  };
}

export function openClues(room: Room): Result {
  if (room.phase !== "roles") return { ok: false, error: "Look at the cards before clues." };
  return { ok: true, room: { ...room, phase: "clues" } };
}

export function submitClue(room: Room, playerId: string, raw: string): Result {
  if (room.phase !== "clues") return { ok: false, error: "Clues are not open." };
  const player = room.players.find((entry) => entry.id === playerId);
  if (!player) return { ok: false, error: "You are not in this round." };
  if (player.clue) return { ok: false, error: "Your clue is already in." };
  const clue = cleanClue(raw);
  if (!clue) return { ok: false, error: "Enter a clue of up to 42 characters." };
  const players = room.players.map((entry) => (entry.id === playerId ? { ...entry, clue } : entry));
  const done = players.every((entry) => entry.clue);
  return { ok: true, room: { ...room, players, phase: done ? "poll" : "clues" } };
}

export function skipClue(room: Room, playerId: string): Result {
  if (room.phase !== "clues") return { ok: false, error: "Clues are not open." };
  const player = room.players.find((entry) => entry.id === playerId);
  if (!player) return { ok: false, error: "That player is not in this round." };
  if (player.connected && !player.clue) return { ok: false, error: "They are still here. Let them type their own clue." };
  if (player.clue) return { ok: true, room };
  const players = room.players.map((entry) => (entry.id === playerId ? { ...entry, clue: "—" } : entry));
  const done = players.every((entry) => entry.clue);
  return { ok: true, room: { ...room, players, phase: done ? "poll" : "clues" } };
}

export function enterPoll(room: Room, pickId: string): Result {
  if (room.phase !== "poll") return { ok: false, error: "The audience poll is not open yet." };
  const pick = room.players.find((player) => player.id === pickId);
  if (!pick) return { ok: false, error: "Choose one of the players at the table." };
  const imposter = room.players.find((player) => player.id === room.imposterId);
  if (!imposter || !room.imposterId) return { ok: false, error: "This round has no imposter." };
  const past: PastRound = {
    round: room.round,
    word: room.word,
    imposterId: room.imposterId,
    imposterName: imposter.name,
    pollPickId: pick.id,
    pollPickName: pick.name,
    audienceWon: pick.id === room.imposterId,
  };
  return {
    ok: true,
    room: {
      ...room,
      phase: "reveal",
      pollPickId: pick.id,
      history: [...room.history, past],
    },
  };
}

export function backToLobby(room: Room): Result {
  if (room.phase !== "reveal") return { ok: false, error: "Finish the reveal first." };
  if (room.round >= MAX_ROUNDS) return { ok: false, error: "All three rounds are finished." };
  return {
    ok: true,
    room: {
      ...room,
      phase: "lobby",
      imposterId: null,
      chosenImposterId: null,
      pollPickId: null,
      players: room.players.map((player) => ({ ...player, clue: null, seen: false })),
    },
  };
}

function publicPlayer(player: Player, showClue: boolean): PublicPlayer {
  return {
    id: player.id,
    name: player.name,
    connected: player.connected,
    clue: showClue ? player.clue : null,
    isLeader: player.isLeader,
  };
}

function revealOf(room: Room): Reveal | null {
  if (room.phase !== "reveal") return null;
  const past = room.history[room.history.length - 1];
  if (!past || past.round !== room.round) return null;
  return {
    imposterId: past.imposterId,
    imposterName: past.imposterName,
    word: past.word,
    pollPickId: past.pollPickId,
    pollPickName: past.pollPickName,
    audienceWon: past.audienceWon,
  };
}

function privateCard(room: Room, playerId: string): PrivateCard | null {
  if (room.phase === "lobby") return null;
  if (!room.imposterId) return null;
  const player = room.players.find((entry) => entry.id === playerId);
  if (!player) return null;
  const isImposter = player.id === room.imposterId;
  return { isImposter, word: isImposter ? null : room.word };
}

export function viewFor(room: Room, client: { kind: ClientKind; playerId?: string | null }): ClientView {
  const showClue = room.phase === "clues" || room.phase === "poll" || room.phase === "reveal";
  const base: ClientView = {
    kind: client.kind,
    code: room.code,
    phase: room.phase,
    round: room.round,
    maxRounds: MAX_ROUNDS,
    mode: room.mode,
    leaderName: room.leaderName,
    players: room.players.map((player) => publicPlayer(player, showClue)),
    history: room.history,
    reveal: revealOf(room),
    privateCard: null,
    hostWord: null,
    chosenImposterId: null,
    selfId: client.playerId ?? null,
    startBlocker: null,
    minPlayers: MIN_PLAYERS,
    maxPlayers: MAX_PLAYERS,
  };
  if (client.kind === "player" && client.playerId) {
    return { ...base, privateCard: privateCard(room, client.playerId) };
  }
  if (client.kind === "leader") {
    const self = room.mode === "inclusive" ? room.players.find((player) => player.isLeader) : undefined;
    return {
      ...base,
      selfId: self?.id ?? null,
      privateCard: self ? privateCard(room, self.id) : null,
      hostWord: room.phase === "lobby" ? room.word : null,
      chosenImposterId: room.phase === "lobby" ? room.chosenImposterId : null,
      startBlocker: startBlocker(room),
    };
  }
  return base;
}

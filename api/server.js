// server/index.ts
import { randomBytes, randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { WebSocketServer } from "ws";

// src/game/room.ts
var MIN_PLAYERS = 5;
var MAX_PLAYERS = 8;
var MAX_ROUNDS = 3;
var MAX_NAME = 18;
var MAX_WORD = 40;
var MAX_CLUE = 42;
var NAME = /^[\p{L}\p{N}][\p{L}\p{N} '’-]*$/u;
function cleanName(raw) {
  const name = raw.trim().replace(/\s+/g, " ");
  if (name.length < 1 || name.length > MAX_NAME) return null;
  if (!NAME.test(name)) return null;
  return name;
}
function cleanWord(raw) {
  const word = raw.trim().replace(/\s+/g, " ");
  if (word.length < 1 || word.length > MAX_WORD) return null;
  return word;
}
function cleanClue(raw) {
  const clue = raw.trim().replace(/\s+/g, " ");
  if (clue.length < 1 || clue.length > MAX_CLUE) return null;
  return clue;
}
function taken(room, name, exceptId) {
  const key = name.toLocaleLowerCase();
  if (room.mode === "exclusive" && room.leaderName.toLocaleLowerCase() === key) return true;
  return room.players.some((player) => player.id !== exceptId && player.name.toLocaleLowerCase() === key);
}
function createRoom(input) {
  const leaderName = cleanName(input.leaderName);
  if (!leaderName) return { ok: false, error: "Enter a leader name of 1 to 18 characters." };
  const word = cleanWord(input.word);
  if (!word) return { ok: false, error: "Enter the secret word before you open the room." };
  if (input.mode !== "inclusive" && input.mode !== "exclusive") {
    return { ok: false, error: "Choose how the leader plays." };
  }
  const players = input.mode === "inclusive" ? [
    {
      id: input.leaderId,
      token: input.leaderToken,
      name: leaderName,
      connected: true,
      clue: null,
      seen: false,
      isLeader: true
    }
  ] : [];
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
      history: []
    }
  };
}
function joinPlayer(room, input) {
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
        { id: input.id, token: input.token, name, connected: true, clue: null, seen: false, isLeader: false }
      ]
    }
  };
}
function setConnected(room, playerId, connected) {
  return {
    ...room,
    players: room.players.map((player) => player.id === playerId ? { ...player, connected } : player)
  };
}
function removePlayer(room, playerId) {
  if (room.phase !== "lobby") return { ok: false, error: "Players can change between rounds, not during one." };
  const player = room.players.find((entry2) => entry2.id === playerId);
  if (!player) return { ok: false, error: "That player is not in the room." };
  if (player.isLeader) return { ok: false, error: "The leader stays for the whole game." };
  return {
    ok: true,
    room: {
      ...room,
      chosenImposterId: room.chosenImposterId === playerId ? null : room.chosenImposterId,
      players: room.players.filter((entry2) => entry2.id !== playerId)
    }
  };
}
function setWord(room, raw) {
  if (room.phase !== "lobby") return { ok: false, error: "The word can change before a round starts." };
  const word = cleanWord(raw);
  if (!word) return { ok: false, error: "Enter a secret word." };
  return { ok: true, room: { ...room, word } };
}
function chooseImposter(room, playerId) {
  if (room.mode !== "exclusive") return { ok: false, error: "In an inclusive game the system chooses the imposter." };
  if (room.phase !== "lobby") return { ok: false, error: "Choose the imposter before the round starts." };
  if (!room.players.some((player) => player.id === playerId)) return { ok: false, error: "Choose someone who has joined." };
  return { ok: true, room: { ...room, chosenImposterId: playerId } };
}
function startBlocker(room) {
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
function startRound(room, rng) {
  const blocker = startBlocker(room);
  if (blocker) return { ok: false, error: blocker };
  let imposterId;
  if (room.mode === "exclusive") {
    imposterId = room.chosenImposterId;
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
      players: room.players.map((player) => ({ ...player, clue: null, seen: false }))
    }
  };
}
function markSeen(room, playerId) {
  if (room.phase !== "roles" && room.phase !== "clues") return { ok: false, error: "Cards are not open." };
  if (!room.players.some((player) => player.id === playerId)) return { ok: false, error: "You are not in this round." };
  return {
    ok: true,
    room: {
      ...room,
      players: room.players.map((player) => player.id === playerId ? { ...player, seen: true } : player)
    }
  };
}
function openClues(room) {
  if (room.phase !== "roles") return { ok: false, error: "Look at the cards before clues." };
  return { ok: true, room: { ...room, phase: "clues" } };
}
function submitClue(room, playerId, raw) {
  if (room.phase !== "clues") return { ok: false, error: "Clues are not open." };
  const player = room.players.find((entry2) => entry2.id === playerId);
  if (!player) return { ok: false, error: "You are not in this round." };
  if (player.clue) return { ok: false, error: "Your clue is already in." };
  const clue = cleanClue(raw);
  if (!clue) return { ok: false, error: "Enter a clue of up to 42 characters." };
  const players = room.players.map((entry2) => entry2.id === playerId ? { ...entry2, clue } : entry2);
  const done = players.every((entry2) => entry2.clue);
  return { ok: true, room: { ...room, players, phase: done ? "poll" : "clues" } };
}
function skipClue(room, playerId) {
  if (room.phase !== "clues") return { ok: false, error: "Clues are not open." };
  const player = room.players.find((entry2) => entry2.id === playerId);
  if (!player) return { ok: false, error: "That player is not in this round." };
  if (player.connected && !player.clue) return { ok: false, error: "They are still here. Let them type their own clue." };
  if (player.clue) return { ok: true, room };
  const players = room.players.map((entry2) => entry2.id === playerId ? { ...entry2, clue: "\u2014" } : entry2);
  const done = players.every((entry2) => entry2.clue);
  return { ok: true, room: { ...room, players, phase: done ? "poll" : "clues" } };
}
function enterPoll(room, pickId) {
  if (room.phase !== "poll") return { ok: false, error: "The audience poll is not open yet." };
  const pick = room.players.find((player) => player.id === pickId);
  if (!pick) return { ok: false, error: "Choose one of the players at the table." };
  const imposter = room.players.find((player) => player.id === room.imposterId);
  if (!imposter || !room.imposterId) return { ok: false, error: "This round has no imposter." };
  const past = {
    round: room.round,
    word: room.word,
    imposterId: room.imposterId,
    imposterName: imposter.name,
    pollPickId: pick.id,
    pollPickName: pick.name,
    audienceWon: pick.id === room.imposterId
  };
  return {
    ok: true,
    room: {
      ...room,
      phase: "reveal",
      pollPickId: pick.id,
      history: [...room.history, past]
    }
  };
}
function backToLobby(room) {
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
      players: room.players.map((player) => ({ ...player, clue: null, seen: false }))
    }
  };
}
function publicPlayer(player, showClue) {
  return {
    id: player.id,
    name: player.name,
    connected: player.connected,
    clue: showClue ? player.clue : null,
    isLeader: player.isLeader
  };
}
function revealOf(room) {
  if (room.phase !== "reveal") return null;
  const past = room.history[room.history.length - 1];
  if (!past || past.round !== room.round) return null;
  return {
    imposterId: past.imposterId,
    imposterName: past.imposterName,
    word: past.word,
    pollPickId: past.pollPickId,
    pollPickName: past.pollPickName,
    audienceWon: past.audienceWon
  };
}
function privateCard(room, playerId) {
  if (room.phase === "lobby") return null;
  if (!room.imposterId) return null;
  const player = room.players.find((entry2) => entry2.id === playerId);
  if (!player) return null;
  const isImposter = player.id === room.imposterId;
  return { isImposter, word: isImposter ? null : room.word };
}
function viewFor(room, client) {
  const showClue = room.phase === "clues" || room.phase === "poll" || room.phase === "reveal";
  const base = {
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
    maxPlayers: MAX_PLAYERS
  };
  if (client.kind === "player" && client.playerId) {
    return { ...base, privateCard: privateCard(room, client.playerId) };
  }
  if (client.kind === "leader") {
    const self = room.mode === "inclusive" ? room.players.find((player) => player.isLeader) : void 0;
    return {
      ...base,
      selfId: self?.id ?? null,
      privateCard: self ? privateCard(room, self.id) : null,
      hostWord: room.phase === "lobby" ? room.word : null,
      chosenImposterId: room.phase === "lobby" ? room.chosenImposterId : null,
      startBlocker: startBlocker(room)
    };
  }
  return base;
}

// server/index.ts
var PORT = Number(process.env.PORT ?? 8787);
var rooms = /* @__PURE__ */ new Map();
var ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
var sockets = /* @__PURE__ */ new Set();
function makeCode() {
  const bytes = randomBytes(4);
  let value = "";
  for (const byte of bytes) value += ALPHABET[byte % ALPHABET.length] ?? "A";
  return rooms.has(value) ? makeCode() : value;
}
function send(socket, payload) {
  if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(payload));
}
function fail(socket, message) {
  send(socket, { type: "error", message });
}
function broadcast(room) {
  for (const socket of sockets) {
    if (socket.roomCode !== room.code || !socket.kind) continue;
    send(socket, { type: "state", view: viewFor(room, { kind: socket.kind, playerId: socket.playerId ?? null }) });
  }
}
function presence(room) {
  let next = room;
  for (const player of room.players) {
    const online = [...sockets].some(
      (socket) => socket.readyState === socket.OPEN && socket.roomCode === room.code && socket.playerId === player.id
    );
    next = setConnected(next, player.id, online);
  }
  rooms.set(room.code, next);
  return next;
}
function attach(socket, room, kind, token, playerId) {
  socket.roomCode = room.code;
  socket.kind = kind;
  socket.token = token;
  socket.playerId = playerId;
}
function leaderRoom(socket) {
  const room = socket.roomCode ? rooms.get(socket.roomCode) : void 0;
  if (!room || socket.kind !== "leader" || socket.token !== room.leaderToken) return null;
  return room;
}
function apply(socket, result) {
  if (!result.ok) {
    fail(socket, result.error);
    return;
  }
  rooms.set(result.room.code, result.room);
  broadcast(result.room);
}
function handle(socket, message) {
  const type = message.type;
  if (type === "create") {
    if (message.mode !== "inclusive" && message.mode !== "exclusive") {
      fail(socket, "Choose how the leader plays.");
      return;
    }
    const made = createRoom({
      code: makeCode(),
      leaderToken: randomUUID(),
      leaderId: randomUUID(),
      leaderName: String(message.leaderName ?? ""),
      mode: message.mode,
      word: String(message.word ?? "")
    });
    if (!made.ok) {
      fail(socket, made.error);
      return;
    }
    rooms.set(made.room.code, made.room);
    const self = made.room.players.find((player) => player.isLeader);
    attach(socket, made.room, "leader", made.room.leaderToken, self?.id);
    send(socket, { type: "created", code: made.room.code, token: made.room.leaderToken });
    broadcast(made.room);
    return;
  }
  if (type === "resume" || type === "watch" || type === "join") {
    const code = String(message.code ?? "").toUpperCase();
    const room2 = rooms.get(code);
    if (!room2) {
      fail(socket, type === "join" ? "That code does not match an open game." : "That game is not open.");
      return;
    }
    if (type === "watch") {
      attach(socket, room2, "audience", "");
      broadcast(presence(room2));
      return;
    }
    if (type === "join") {
      const joined = joinPlayer(room2, { id: randomUUID(), token: randomUUID(), name: String(message.name ?? "") });
      if (!joined.ok) {
        fail(socket, joined.error);
        return;
      }
      const player2 = joined.room.players[joined.room.players.length - 1];
      if (!player2) return;
      rooms.set(room2.code, joined.room);
      attach(socket, joined.room, "player", player2.token, player2.id);
      send(socket, { type: "joined", code: room2.code, token: player2.token, playerId: player2.id });
      broadcast(joined.room);
      return;
    }
    const token = String(message.token ?? "");
    if (message.kind === "leader" && token === room2.leaderToken) {
      const self = room2.players.find((player2) => player2.isLeader);
      attach(socket, room2, "leader", token, self?.id);
      broadcast(presence(room2));
      return;
    }
    const player = room2.players.find((entry2) => entry2.token === token);
    if (!player) {
      fail(socket, "This phone is not in that game.");
      return;
    }
    attach(socket, room2, "player", token, player.id);
    broadcast(presence(room2));
    return;
  }
  const room = socket.roomCode ? rooms.get(socket.roomCode) : void 0;
  if (!room) {
    fail(socket, "Join a game first.");
    return;
  }
  if (type === "set-word") {
    if (!leaderRoom(socket)) return fail(socket, "Only the leader can change the word.");
    return apply(socket, setWord(room, String(message.word ?? "")));
  }
  if (type === "choose-imposter") {
    if (!leaderRoom(socket)) return fail(socket, "Only the leader can choose the imposter.");
    return apply(socket, chooseImposter(room, String(message.playerId ?? "")));
  }
  if (type === "remove-player") {
    if (!leaderRoom(socket)) return fail(socket, "Only the leader can change the table.");
    return apply(socket, removePlayer(room, String(message.playerId ?? "")));
  }
  if (type === "start") {
    if (!leaderRoom(socket)) return fail(socket, "Only the leader can start the round.");
    return apply(socket, startRound(room, Math.random));
  }
  if (type === "open-clues") {
    if (!leaderRoom(socket)) return fail(socket, "Only the leader can open clues.");
    return apply(socket, openClues(room));
  }
  if (type === "seen") {
    if (!socket.playerId) return;
    return apply(socket, markSeen(room, socket.playerId));
  }
  if (type === "clue") {
    if (!socket.playerId) return fail(socket, "Only a player at the table can give a clue.");
    return apply(socket, submitClue(room, socket.playerId, String(message.clue ?? "")));
  }
  if (type === "skip-clue") {
    if (!leaderRoom(socket)) return fail(socket, "Only the leader can skip a missing clue.");
    return apply(socket, skipClue(room, String(message.playerId ?? "")));
  }
  if (type === "poll") {
    if (!leaderRoom(socket)) return fail(socket, "Only the leader can enter the poll.");
    return apply(socket, enterPoll(room, String(message.playerId ?? "")));
  }
  if (type === "next") {
    if (!leaderRoom(socket)) return fail(socket, "Only the leader can open the next round.");
    return apply(socket, backToLobby(room));
  }
}
var server;
function createRoomServer() {
  if (server) return server;
  server = createServer((_req, res) => {
    res.writeHead(200, { "content-type": "text/plain" });
    res.end("ok");
  });
  const wss = new WebSocketServer({ server });
  wss.on("connection", (socket) => {
    const client = socket;
    sockets.add(client);
    client.on("close", () => {
      sockets.delete(client);
      const current = client.roomCode ? rooms.get(client.roomCode) : void 0;
      if (current && client.playerId) broadcast(presence(current));
    });
    client.on("message", (raw) => {
      try {
        const message = JSON.parse(String(raw));
        handle(client, message);
      } catch {
        fail(client, "That message could not be read.");
      }
    });
  });
  return server;
}
var entry = process.argv[1] ?? "";
if (!process.env.VERCEL && (entry.endsWith("server/index.ts") || entry.endsWith("server/index.js"))) {
  createRoomServer().listen(PORT, "127.0.0.1", () => {
    console.log(`room server on ${PORT}`);
  });
}

// server/vercel.ts
var vercel_default = createRoomServer();
export {
  vercel_default as default
};

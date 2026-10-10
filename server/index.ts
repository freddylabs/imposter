import { randomBytes, randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
import {
  backToLobby,
  chooseImposter,
  createRoom,
  enterPoll,
  joinPlayer,
  markSeen,
  openClues,
  removePlayer,
  setConnected,
  setWord,
  skipClue,
  startRound,
  submitClue,
  viewFor,
  type ClientKind,
  type Room,
} from "../src/game/room.ts";

const PORT = Number(process.env.PORT ?? 8787);
const rooms = new Map<string, Room>();
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

type Client = WebSocket & {
  roomCode?: string;
  kind?: ClientKind;
  playerId?: string;
  token?: string;
};

const sockets = new Set<Client>();

function makeCode(): string {
  const bytes = randomBytes(4);
  let value = "";
  for (const byte of bytes) value += ALPHABET[byte % ALPHABET.length] ?? "A";
  return rooms.has(value) ? makeCode() : value;
}

function send(socket: Client, payload: unknown) {
  if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(payload));
}

function fail(socket: Client, message: string) {
  send(socket, { type: "error", message });
}

function broadcast(room: Room) {
  for (const socket of sockets) {
    if (socket.roomCode !== room.code || !socket.kind) continue;
    send(socket, { type: "state", view: viewFor(room, { kind: socket.kind, playerId: socket.playerId ?? null }) });
  }
}

function presence(room: Room): Room {
  let next = room;
  for (const player of room.players) {
    const online = [...sockets].some(
      (socket) => socket.readyState === socket.OPEN && socket.roomCode === room.code && socket.playerId === player.id,
    );
    next = setConnected(next, player.id, online);
  }
  rooms.set(room.code, next);
  return next;
}

function attach(socket: Client, room: Room, kind: ClientKind, token: string, playerId?: string) {
  socket.roomCode = room.code;
  socket.kind = kind;
  socket.token = token;
  socket.playerId = playerId;
}

function leaderRoom(socket: Client): Room | null {
  const room = socket.roomCode ? rooms.get(socket.roomCode) : undefined;
  if (!room || socket.kind !== "leader" || socket.token !== room.leaderToken) return null;
  return room;
}

function apply(socket: Client, result: { ok: true; room: Room } | { ok: false; error: string }) {
  if (!result.ok) {
    fail(socket, result.error);
    return;
  }
  rooms.set(result.room.code, result.room);
  broadcast(result.room);
}

function handle(socket: Client, message: Record<string, unknown>) {
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
      word: String(message.word ?? ""),
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
    const room = rooms.get(code);
    if (!room) {
      fail(socket, type === "join" ? "That code does not match an open game." : "That game is not open.");
      return;
    }
    if (type === "watch") {
      attach(socket, room, "audience", "");
      broadcast(presence(room));
      return;
    }
    if (type === "join") {
      const joined = joinPlayer(room, { id: randomUUID(), token: randomUUID(), name: String(message.name ?? "") });
      if (!joined.ok) {
        fail(socket, joined.error);
        return;
      }
      const player = joined.room.players[joined.room.players.length - 1];
      if (!player) return;
      rooms.set(room.code, joined.room);
      attach(socket, joined.room, "player", player.token, player.id);
      send(socket, { type: "joined", code: room.code, token: player.token, playerId: player.id });
      broadcast(joined.room);
      return;
    }
    const token = String(message.token ?? "");
    if (message.kind === "leader" && token === room.leaderToken) {
      const self = room.players.find((player) => player.isLeader);
      attach(socket, room, "leader", token, self?.id);
      broadcast(presence(room));
      return;
    }
    const player = room.players.find((entry) => entry.token === token);
    if (!player) {
      fail(socket, "This phone is not in that game.");
      return;
    }
    attach(socket, room, "player", token, player.id);
    broadcast(presence(room));
    return;
  }

  const room = socket.roomCode ? rooms.get(socket.roomCode) : undefined;
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

let server: ReturnType<typeof createServer> | undefined;

export function createRoomServer() {
  if (server) return server;
  server = createServer((_req, res) => {
    res.writeHead(200, { "content-type": "text/plain" });
    res.end("ok");
  });

  const wss = new WebSocketServer({ server });

  wss.on("connection", (socket) => {
    const client = socket as Client;
    sockets.add(client);
    client.on("close", () => {
      sockets.delete(client);
      const current = client.roomCode ? rooms.get(client.roomCode) : undefined;
      if (current && client.playerId) broadcast(presence(current));
    });
    client.on("message", (raw) => {
      try {
        const message = JSON.parse(String(raw)) as Record<string, unknown>;
        handle(client, message);
      } catch {
        fail(client, "That message could not be read.");
      }
    });
  });

  return server;
}

const entry = process.argv[1] ?? "";
if (!process.env.VERCEL && (entry.endsWith("server/index.ts") || entry.endsWith("server/index.js"))) {
  createRoomServer().listen(PORT, "127.0.0.1", () => {
    console.log(`room server on ${PORT}`);
  });
}

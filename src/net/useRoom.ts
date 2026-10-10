import { useEffect, useRef, useState } from "react";
import type { ClientView } from "../game/room";

export type Hello =
  | { kind: "leader"; token: string }
  | { kind: "player"; token?: string; name?: string }
  | { kind: "audience" };

export function leaderKey(code: string): string {
  return `imposter.leader.${code}`;
}

export function playerKey(code: string): string {
  return `imposter.player.${code}`;
}

export function socketUrl(): string {
  const proto = window.location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${window.location.host}/ws`;
}

export function useRoom(code: string, hello: Hello | null) {
  const [view, setView] = useState<ClientView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "connecting" | "open" | "closed">(hello ? "connecting" : "idle");
  const socketRef = useRef<WebSocket | null>(null);
  const helloKey = hello ? JSON.stringify(hello) : "";

  useEffect(() => {
    if (!hello) return;
    let stopped = false;
    let attempt = 0;
    let retry: number | undefined;

    function greet(socket: WebSocket) {
      if (!hello) return;
      if (hello.kind === "leader") {
        socket.send(JSON.stringify({ type: "resume", kind: "leader", code, token: hello.token }));
        return;
      }
      if (hello.kind === "audience") {
        socket.send(JSON.stringify({ type: "watch", code }));
        return;
      }
      const token = sessionStorage.getItem(playerKey(code)) ?? hello.token;
      if (token) {
        socket.send(JSON.stringify({ type: "resume", kind: "player", code, token }));
      } else if (hello.name) {
        socket.send(JSON.stringify({ type: "join", code, name: hello.name }));
      }
    }

    function connect() {
      const socket = new WebSocket(socketUrl());
      socketRef.current = socket;
      setStatus("connecting");
      socket.onopen = () => {
        attempt = 0;
        setStatus("open");
        greet(socket);
      };
      socket.onmessage = (event) => {
        const message = JSON.parse(String(event.data)) as {
          type?: string;
          view?: ClientView;
          message?: string;
          token?: string;
        };
        if (message.type === "state" && message.view) {
          setView(message.view);
          setError(null);
        } else if (message.type === "joined" && message.token) {
          sessionStorage.setItem(playerKey(code), message.token);
        } else if (message.type === "error" && message.message) {
          setError(message.message);
        }
      };
      socket.onclose = () => {
        if (stopped || socketRef.current !== socket) return;
        attempt += 1;
        if (attempt > 5) {
          setStatus("closed");
          return;
        }
        retry = window.setTimeout(connect, 800);
      };
    }

    connect();
    return () => {
      stopped = true;
      if (retry !== undefined) window.clearTimeout(retry);
      socketRef.current?.close();
    };
  }, [code, helloKey]);

  function send(payload: Record<string, unknown>) {
    const socket = socketRef.current;
    if (socket && socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(payload));
  }

  return { view, error, status, send };
}

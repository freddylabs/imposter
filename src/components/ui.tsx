import type { ButtonHTMLAttributes, ReactNode } from "react";

const AVATAR_COLORS = ["#f0c27a", "#f0a48a", "#9fd0b5", "#aac4e0", "#e0b4cf", "#e7d7a8", "#c9b4e0", "#f2b6a0"];

export function avatarColor(name: string): string {
  let hash = 0;
  for (let index = 0; index < name.length; index += 1) {
    hash = (hash * 31 + name.charCodeAt(index)) >>> 0;
  }
  return AVATAR_COLORS[hash % AVATAR_COLORS.length] ?? "#f0c27a";
}

export function Avatar({ name }: { name: string }) {
  const letter = name.trim().slice(0, 1).toUpperCase() || "?";
  return (
    <span className="avatar" style={{ background: avatarColor(name) }} aria-hidden="true">
      {letter}
    </span>
  );
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "text";
  block?: boolean;
  shimmer?: boolean;
};

export function Button({
  variant = "primary",
  block = false,
  shimmer = false,
  className = "",
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={`btn ${variant}${block ? " block" : ""}${shimmer ? " shimmer" : ""} ${className}`.trim()}
      {...props}
    />
  );
}

export function Screen({
  children,
  footer,
  className = "",
}: {
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  return (
    <section className={`screen ${className}`.trim()}>
      <div className="screen-body">{children}</div>
      {footer ? <div className="screen-footer">{footer}</div> : null}
    </section>
  );
}

export function Notice({ children }: { children: string | null | undefined }) {
  if (!children) return null;
  return (
    <p className="notice" role="alert">
      {children}
    </p>
  );
}

export function MaskIcon() {
  return (
    <svg className="icon" viewBox="0 0 32 32" aria-hidden="true">
      <path
        d="M6.5 14.2c0-5.4 4-9.4 9.5-9.4s9.5 4 9.5 9.4v1.8c0 4.6-2.8 7.5-5.8 8.5L16 29l-3.7-4.5c-3-1-5.8-3.9-5.8-8.5v-1.8z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
      />
      <circle cx="12.2" cy="15" r="1.25" fill="currentColor" />
      <circle cx="19.8" cy="15" r="1.25" fill="currentColor" />
    </svg>
  );
}

export function BookIcon() {
  return (
    <svg className="icon" viewBox="0 0 32 32" aria-hidden="true">
      <path
        d="M6 7.5h8.2c1.2 0 2.3.6 2.8 1.6.5-1 1.6-1.6 2.8-1.6H28V24h-8.2c-1.2 0-2.3.5-2.8 1.4-.5-.9-1.6-1.4-2.8-1.4H6V7.5z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
      />
      <path d="M16 9.2v16" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}

export type ClueView = {
  id: string;
  name: string;
  text: string;
  spoken: boolean;
  round: number;
};

export function ClueList({ clues }: { clues: ClueView[] }) {
  if (clues.length === 0) {
    return <p className="empty">Clues will gather here.</p>;
  }
  const rounds = new Map<number, ClueView[]>();
  for (const clue of clues) {
    const group = rounds.get(clue.round) ?? [];
    group.push(clue);
    rounds.set(clue.round, group);
  }
  return (
    <div className="clue-feed">
      {[...rounds.entries()].map(([round, group]) => (
        <section key={round}>
          <h2 className="round-label">Round {round + 1}</h2>
          <ol>
            {group.map((clue) => (
              <li key={clue.id} className="clue">
                <Avatar name={clue.name} />
                <div>
                  <p className="clue-name">{clue.name}</p>
                  <p className={clue.spoken ? "spoken" : undefined}>{clue.spoken ? "Spoken clue" : clue.text}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}

export function joinNames(names: string[]): string {
  if (names.length === 0) return "";
  if (names.length === 1) return names[0] ?? "";
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}

export function Cover({
  kicker,
  title,
  body,
  action,
  onAction,
  note,
}: {
  kicker?: string;
  title: string;
  body: string;
  action: string;
  onAction: () => void;
  note?: string;
}) {
  return (
    <div className="deal-layout">
      <p className="look-aside">Look away</p>
      <div className="cover">
        {kicker ? <p className="kicker">{kicker}</p> : null}
        <h1>{title}</h1>
        <p className="lede">{body}</p>
        {note ? <p className="note">{note}</p> : null}
        <Button block onClick={onAction}>
          {action}
        </Button>
      </div>
      <p className="look-aside">Look away</p>
    </div>
  );
}

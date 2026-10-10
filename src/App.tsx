import { MaskIcon } from "./components/ui";
import { CreateScreen } from "./screens/CreateScreen";
import { HomeScreen } from "./screens/HomeScreen";
import { HostScreen } from "./screens/HostScreen";
import { PlayerScreen } from "./screens/PlayerScreen";
import { WatchScreen } from "./screens/WatchScreen";

function page() {
  const path = window.location.pathname.replace(/\/$/, "") || "/";
  const host = path.match(/^\/host\/([A-Za-z0-9]{4})$/i);
  if (host?.[1]) return <HostScreen code={host[1].toUpperCase()} />;
  const watch = path.match(/^\/watch\/([A-Za-z0-9]{4})$/i);
  if (watch?.[1]) return <WatchScreen code={watch[1].toUpperCase()} />;
  const join = path.match(/^\/join\/([A-Za-z0-9]{4})$/i);
  if (join?.[1]) return <PlayerScreen code={join[1].toUpperCase()} />;
  if (path === "/join") return <PlayerScreen />;
  if (path === "/create") return <CreateScreen />;
  return <HomeScreen />;
}

export function App() {
  return (
    <div className="app">
      <a className="skip" href="#content">
        Skip to the game
      </a>
      <header className="topbar">
        <a className="brand" href="/">
          <MaskIcon />
          <span>Imposter</span>
        </a>
      </header>
      <main className="main" id="content">
        {page()}
      </main>
    </div>
  );
}

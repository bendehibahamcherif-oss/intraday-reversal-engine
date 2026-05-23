import { useEffect, useState } from "react";

import { streamManager } from "./core/streamManager";
import "./core/realtimeBindings";

import TerminalTopBar from "./TerminalTopBar.jsx";
import TerminalSidebar from "./TerminalSidebar.jsx";
import AuthGate from "./AuthGate.jsx";

import WorkspaceSwitcher from "./components/WorkspaceSwitcher.jsx";
import ErrorBoundary from "./components/ErrorBoundary.jsx";

import RiskWorkspace from "./workspaces/RiskWorkspace.jsx";
import MacroWorkspace from "./workspaces/MacroWorkspace.jsx";
import PortfolioWorkspace from "./workspaces/PortfolioWorkspace.jsx";
import ExecutionWorkspace from "./workspaces/ExecutionWorkspace.jsx";
import ReplayWorkspace from "./workspaces/ReplayWorkspace.jsx";

import { useWorkspaceStore } from "./store/workspaceStore";
import { useMarketStore } from "./store/marketStore";

import { api, getToken, getUser } from "./api.js";

import "./terminal.css";

const DEFAULT_WATCHLIST = [
  "SPX",
  "NDX",
  "VIX",
  "EURUSD",
  "USDJPY",
];

function WorkspaceRenderer({ workspace, marketData }) {
  switch (workspace) {
    case "Macro":
      return (
        <MacroWorkspace marketData={marketData} />
      );

    case "Portfolio":
      return <PortfolioWorkspace />;

    case "Execution":
      return <ExecutionWorkspace />;

    case "Replay":
      return <ReplayWorkspace />;

    case "Risk":
    default:
      return (
        <RiskWorkspace marketData={marketData} />
      );
  }
}

export default function App() {
  const [socketStatus, setSocketStatus] = useState("connecting");

  const [authReady, setAuthReady] = useState(false);

  const [user, setUser] = useState(getUser());

  const [watchlist] = useState(DEFAULT_WATCHLIST);

  const workspace = useWorkspaceStore(
    (state) => state.workspace
  );

  const marketData = useMarketStore(
    (state) => state.prices
  );

  useEffect(() => {
    const token = getToken();

    if (!token) {
      setAuthReady(true);
      return;
    }

    api
      .me()
      .then((res) => setUser(res.user))
      .catch(() => setUser(null))
      .finally(() => setAuthReady(true));
  }, []);

  useEffect(() => {
    const socket = streamManager.connect(watchlist);

    socket.on("connect", () => {
      setSocketStatus("connected");
    });

    socket.on("disconnect", () => {
      setSocketStatus("disconnected");
    });

    socket.on("connect_error", () => {
      setSocketStatus("error");
    });
  }, [watchlist]);

  if (!authReady) {
    return (
      <div
        className="terminal-shell"
        style={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
        }}
      >
        Loading institutional terminal...
      </div>
    );
  }

  if (!user) {
    return (
      <AuthGate onAuth={setUser} />
    );
  }

  return (
    <ErrorBoundary>
      <div className="terminal-shell">
        <TerminalTopBar
          user={user}
          onLogout={() => setUser(null)}
        />

        <div
          style={{
            display: "flex",
            minHeight: "calc(100vh - 58px)",
          }}
        >
          <TerminalSidebar
            watchlist={watchlist}
            socketStatus={socketStatus}
          />

          <div
            style={{
              flex: 1,
              minWidth: 0,
              padding: 20,
            }}
          >
            <div style={{ marginBottom: 20 }}>
              <div
                style={{
                  color: "#9ca3af",
                  fontSize: 12,
                  letterSpacing: 1,
                  marginBottom: 6,
                }}
              >
                INSTITUTIONAL OPERATING SYSTEM
              </div>

              <h1 style={{ margin: 0 }}>
                Reversal Terminal
              </h1>
            </div>

            <WorkspaceSwitcher />

            <WorkspaceRenderer
              workspace={workspace}
              marketData={marketData}
            />
          </div>
        </div>
      </div>
    </ErrorBoundary>
  );
}

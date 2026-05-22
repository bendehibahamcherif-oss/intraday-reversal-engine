import { useEffect, useMemo, useState } from "react";
import { io } from "socket.io-client";
import StrategyAnalyzer from "./StrategyAnalyzer.jsx";
import LiveTradingHeader from "./LiveTradingHeader.jsx";
import LiveMarketBoard from "./LiveMarketBoard.jsx";
import TerminalControls from "./TerminalControls.jsx";
import AIAlertsPanel from "./AIAlertsPanel.jsx";
import MiniChartPanel from "./MiniChartPanel.jsx";
import QuantPanel from "./QuantPanel.jsx";
import ExecutiveSummary from "./ExecutiveSummary.jsx";
import PortfolioRiskPanel from "./PortfolioRiskPanel.jsx";
import AdvancedChartPanel from "./AdvancedChartPanel.jsx";
import RiskAnalyticsPanel from "./RiskAnalyticsPanel.jsx";
import WorkspacePanel from "./WorkspacePanel.jsx";
import AdminUsersPanel from "./AdminUsersPanel.jsx";
import AuthGate from "./AuthGate.jsx";
import TerminalTopBar from "./TerminalTopBar.jsx";
import MarketIntelligencePanel from "./MarketIntelligencePanel.jsx";
import TerminalSidebar from "./TerminalSidebar.jsx";
import SignalRankingPanel from "./SignalRankingPanel.jsx";
import VolatilityHeatmapPanel from "./VolatilityHeatmapPanel.jsx";
import MarketRegimePanel from "./MarketRegimePanel.jsx";
import { api, getToken, getUser } from "./api.js";
import "./terminal.css";

const DEFAULT_WATCHLIST = ["AAPL", "TSLA", "NVDA", "MSFT"];

function generateAlerts(marketData) {
  return Object.values(marketData)
    .filter((row) => row?.signal)
    .map((row) => {
      const confidence = Math.round(Number(row.signal?.confidence || 0) * 100);
      const extension = Math.abs(Number(row.signal?.distancePct || 0));

      return {
        symbol: row.symbol,
        score: Math.min(99, Math.round(confidence + extension * 10)),
        type: row.signal.signal,
        message: row.signal.reason || "Realtime signal detected",
      };
    })
    .filter((row) => row.score >= 60)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);
}

export default function App() {
  const [livePrice, setLivePrice] = useState(null);
  const [marketData, setMarketData] = useState({});
  const [ticks, setTicks] = useState([]);
  const [socketStatus, setSocketStatus] = useState("connecting");
  const [watchlist, setWatchlist] = useState(DEFAULT_WATCHLIST);
  const [alertsEnabled, setAlertsEnabled] = useState(true);
  const [user, setUser] = useState(getUser());
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    const token = getToken();

    if (!token) {
      setAuthReady(true);
      return;
    }

    api.me()
      .then((res) => setUser(res.user))
      .catch(() => setUser(null))
      .finally(() => setAuthReady(true));
  }, []);

  const socket = useMemo(() => io(api.base, {
    transports: ["websocket", "polling"],
    auth: {
      token: getToken() || import.meta.env.VITE_USER_TOKEN || "",
    },
  }), [user]);

  useEffect(() => {
    if (!user) return;

    socket.on("connect", () => {
      setSocketStatus("connected");
      socket.emit("subscribe", { symbols: watchlist });
    });

    socket.on("price_update", (data) => {
      setLivePrice(data);

      setMarketData((prev) => ({
        ...prev,
        [data.symbol]: data,
      }));

      setTicks((prev) => [...prev.slice(-119), data]);

      if (
        alertsEnabled &&
        typeof window !== "undefined" &&
        "Notification" in window &&
        Notification.permission === "granted" &&
        Number(data.signal?.confidence || 0) > 0.75
      ) {
        new Notification(`${data.symbol} ${data.signal?.signal}`, {
          body: data.signal?.reason || "Realtime signal",
        });
      }
    });

    socket.on("connect_error", () => setSocketStatus("error"));
    socket.on("disconnect", () => setSocketStatus("disconnected"));

    return () => socket.disconnect();
  }, [socket, watchlist, alertsEnabled, user]);

  useEffect(() => {
    if (socket.connected) {
      socket.emit("subscribe", { symbols: watchlist });
    }
  }, [socket, watchlist]);

  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window) {
      Notification.requestPermission().catch(() => {});
    }
  }, []);

  const alerts = alertsEnabled ? generateAlerts(marketData) : [];

  if (!authReady) {
    return (
      <div className="terminal-shell" style={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>
        Loading terminal...
      </div>
    );
  }

  if (!user) {
    return <AuthGate onAuth={setUser} />;
  }

  return (
    <div className="terminal-shell">
      <TerminalTopBar user={user} onLogout={() => setUser(null)} />

      <div style={{ display: "flex", minHeight: "calc(100vh - 58px)" }}>
        <TerminalSidebar watchlist={watchlist} socketStatus={socketStatus} />

        <div style={{ flex: 1, minWidth: 0 }}>
          <LiveTradingHeader livePrice={livePrice} socketStatus={socketStatus} />

          <div className="terminal-container">
            <ExecutiveSummary
              marketData={marketData}
              alerts={alerts}
              socketStatus={socketStatus}
            />

            <TerminalControls
              symbols={watchlist}
              onSymbolsChange={setWatchlist}
              alertsEnabled={alertsEnabled}
              onAlertsToggle={() => setAlertsEnabled((v) => !v)}
            />

            <div className="terminal-grid">
              <div>
                <AdvancedChartPanel ticks={ticks} />
                <MiniChartPanel ticks={ticks} />
                <VolatilityHeatmapPanel marketData={marketData} />
                <LiveMarketBoard marketData={marketData} />
              </div>

              <div>
                <MarketRegimePanel marketData={marketData} />
                <MarketIntelligencePanel />
                <SignalRankingPanel marketData={marketData} />
                <WorkspacePanel />
                <QuantPanel marketData={marketData} />
                <RiskAnalyticsPanel marketData={marketData} />
                <AIAlertsPanel alerts={alerts} />

                {user?.role === "admin" && (
                  <div style={{ marginTop: 16 }}>
                    <AdminUsersPanel />
                  </div>
                )}
              </div>
            </div>

            <PortfolioRiskPanel marketData={marketData} />

            <div style={{ marginTop: 16 }}>
              <StrategyAnalyzer livePrice={livePrice} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

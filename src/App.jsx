import { useEffect, useMemo, useState } from "react";
import { io } from "socket.io-client";
import StrategyAnalyzer from "./StrategyAnalyzer.jsx";
import LiveTradingHeader from "./LiveTradingHeader.jsx";
import LiveMarketBoard from "./LiveMarketBoard.jsx";
import TerminalControls from "./TerminalControls.jsx";
import AIAlertsPanel from "./AIAlertsPanel.jsx";
import MiniChartPanel from "./MiniChartPanel.jsx";
import QuantPanel from "./QuantPanel.jsx";
import { api, getToken } from "./api.js";

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

  const socket = useMemo(() => io(api.base, {
    transports: ["websocket", "polling"],
    auth: {
      token: getToken() || import.meta.env.VITE_USER_TOKEN || "",
    },
  }), []);

  useEffect(() => {
    socket.on("connect", () => {
      setSocketStatus("connected");
      socket.emit("subscribe", { symbols: watchlist });
    });

    socket.on("subscribed", (data) => {
      console.log("WebSocket subscribed:", data);
    });

    socket.on("price_update", (data) => {
      setLivePrice(data);

      setMarketData((prev) => ({
        ...prev,
        [data.symbol]: data,
      }));

      setTicks((prev) => [...prev.slice(-59), data]);

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

    socket.on("price_error", (data) => {
      console.warn("LIVE PRICE ERROR:", data);
    });

    socket.on("connect_error", (err) => {
      console.error("WebSocket error:", err.message);
      setSocketStatus("error");
    });

    socket.on("disconnect", () => {
      setSocketStatus("disconnected");
    });

    return () => socket.disconnect();
  }, [socket, watchlist, alertsEnabled]);

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

  return (
    <div style={{ minHeight: "100vh", background: "#0b0b0b", color: "white" }}>
      <LiveTradingHeader
        livePrice={livePrice}
        socketStatus={socketStatus}
      />

      <div style={{ padding: 16, maxWidth: 1600, margin: "0 auto" }}>
        <TerminalControls
          symbols={watchlist}
          onSymbolsChange={setWatchlist}
          alertsEnabled={alertsEnabled}
          onAlertsToggle={() => setAlertsEnabled((v) => !v)}
        />

        <QuantPanel marketData={marketData} />

        <MiniChartPanel ticks={ticks} />

        <AIAlertsPanel alerts={alerts} />

        <LiveMarketBoard marketData={marketData} />

        <StrategyAnalyzer livePrice={livePrice} />
      </div>
    </div>
  );
}

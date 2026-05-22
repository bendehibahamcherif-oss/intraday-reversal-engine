import { useEffect, useMemo, useState } from "react";
import { io } from "socket.io-client";
import StrategyAnalyzer from "./StrategyAnalyzer.jsx";
import LiveTradingHeader from "./LiveTradingHeader.jsx";
import LiveMarketBoard from "./LiveMarketBoard.jsx";
import { api, getToken } from "./api.js";

const WATCHLIST = ["AAPL", "TSLA", "NVDA", "MSFT"];

export default function App() {
  const [livePrice, setLivePrice] = useState(null);
  const [marketData, setMarketData] = useState({});
  const [socketStatus, setSocketStatus] = useState("connecting");

  const socket = useMemo(() => io(api.base, {
    transports: ["websocket", "polling"],
    auth: {
      token: getToken() || import.meta.env.VITE_USER_TOKEN || "",
    },
  }), []);

  useEffect(() => {
    socket.on("connect", () => {
      setSocketStatus("connected");
      socket.emit("subscribe", {
        symbols: WATCHLIST,
      });
    });

    socket.on("subscribed", (data) => {
      console.log("WebSocket subscribed:", data);
    });

    socket.on("price_update", (data) => {
      console.log("LIVE PRICE:", data);
      setLivePrice(data);
      setMarketData((prev) => ({
        ...prev,
        [data.symbol]: data,
      }));
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
  }, [socket]);

  return (
    <div style={{ minHeight: "100vh", background: "#0b0b0b", color: "white" }}>
      <LiveTradingHeader
        livePrice={livePrice}
        socketStatus={socketStatus}
      />

      <div style={{ padding: 16 }}>
        <LiveMarketBoard marketData={marketData} />

        <StrategyAnalyzer livePrice={livePrice} />
      </div>
    </div>
  );
}

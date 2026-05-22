import { useEffect, useMemo, useState } from "react";
import { io } from "socket.io-client";
import StrategyAnalyzer from "./StrategyAnalyzer.jsx";
import { api, getToken } from "./api.js";

export default function App() {
  const [livePrice, setLivePrice] = useState(null);
  const [socketStatus, setSocketStatus] = useState("connecting");

  const socket = useMemo(() => {
    return io(api.base, {
      transports: ["websocket", "polling"],
      auth: {
        token: getToken() || import.meta.env.VITE_USER_TOKEN || "",
      },
    });
  }, []);

  useEffect(() => {
    socket.on("connect", () => {
      setSocketStatus("connected");

      socket.emit("subscribe", {
        symbols: ["AAPL"],
      });
    });

    socket.on("subscribed", (data) => {
      console.log("WebSocket subscribed:", data);
    });

    socket.on("price_update", (data) => {
      console.log("LIVE PRICE:", data);
      setLivePrice(data);
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

    return () => {
      socket.disconnect();
    };
  }, [socket]);

  return (
    <>
      <div style={{ padding: "10px", background: "#111", color: "white" }}>
        {livePrice ? (
          <strong>
            LIVE {livePrice.symbol}: {Number(livePrice.price).toFixed(2)}
          </strong>
        ) : (
          <strong>
            Connexion live price... ({socketStatus})
          </strong>
        )}
      </div>

      <StrategyAnalyzer livePrice={livePrice} />
    </>
  );
}

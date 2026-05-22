import { useEffect, useState } from "react";
import { io } from "socket.io-client";
import StrategyAnalyzer from "./StrategyAnalyzer.jsx";

const socket = io("https://reversal.onrender.com", {
  auth: {
    token: import.meta.env.VITE_USER_TOKEN
  }
});

export default function App() {
  const [livePrice, setLivePrice] = useState(null);

  useEffect(() => {
    socket.emit("subscribe", {
      symbols: ["AAPL"]
    });

    socket.on("price_update", (data) => {
      console.log("LIVE PRICE:", data);
      setLivePrice(data);
    });

    socket.on("connect_error", (err) => {
      console.error("WebSocket error:", err.message);
    });

    return () => {
      socket.off("price_update");
      socket.off("connect_error");
    };
  }, []);

  return (
    <>
      <div style={{ padding: "10px", background: "#111", color: "white" }}>
        {livePrice ? (
          <strong>
            LIVE {livePrice.symbol}: {Number(livePrice.price).toFixed(2)}
          </strong>
        ) : (
          <strong>Connexion live price...</strong>
        )}
      </div>

      <StrategyAnalyzer livePrice={livePrice} />
    </>
  );
}
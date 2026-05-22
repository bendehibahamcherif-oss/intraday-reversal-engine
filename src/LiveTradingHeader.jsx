export default function LiveTradingHeader({ livePrice, socketStatus }) {
  const signal = livePrice?.signal;
  const signalLabel = signal?.signal || "WAIT";
  const confidence = Number(signal?.confidence || 0);
  const confidencePct = Math.round(confidence * 100);

  const signalColor =
    signalLabel === "FADE_UP"
      ? "#22c55e"
      : signalLabel === "FADE_DOWN"
        ? "#ef4444"
        : "#facc15";

  return (
    <div
      style={{
        padding: "12px 16px",
        background: "linear-gradient(90deg, #050505, #141414)",
        color: "white",
        borderBottom: "1px solid #2a2a2a",
        display: "grid",
        gridTemplateColumns: "1fr auto auto auto",
        gap: "16px",
        alignItems: "center",
        fontFamily: "Inter, system-ui, sans-serif",
      }}
    >
      <div>
        <div style={{ fontSize: 12, color: "#9ca3af", letterSpacing: 1 }}>
          REVERSAL TERMINAL LIVE
        </div>
        <strong style={{ fontSize: 18 }}>
          {livePrice ? `${livePrice.symbol} ${Number(livePrice.price).toFixed(2)}` : "Connexion live feed..."}
        </strong>
      </div>

      <div style={{ textAlign: "right" }}>
        <div style={{ fontSize: 11, color: "#9ca3af" }}>STATUS</div>
        <strong style={{ color: socketStatus === "connected" ? "#22c55e" : "#f97316" }}>
          {socketStatus.toUpperCase()}
        </strong>
      </div>

      <div style={{ textAlign: "right" }}>
        <div style={{ fontSize: 11, color: "#9ca3af" }}>SIGNAL</div>
        <strong style={{ color: signalColor }}>{signalLabel}</strong>
      </div>

      <div style={{ textAlign: "right" }}>
        <div style={{ fontSize: 11, color: "#9ca3af" }}>CONFIDENCE</div>
        <strong>{confidencePct}%</strong>
      </div>
    </div>
  );
}

export default function PanelContainer({
  title,
  children,
}) {
  return (
    <section
      style={{
        background: '#0b0b0b',
        border: '1px solid #202020',
        borderRadius: 14,
        padding: 16,
        marginBottom: 16,
      }}
    >
      <div
        style={{
          marginBottom: 12,
          borderBottom: '1px solid #202020',
          paddingBottom: 10,
        }}
      >
        <h2
          style={{
            margin: 0,
            fontSize: 18,
          }}
        >
          {title}
        </h2>
      </div>

      {children}
    </section>
  );
}

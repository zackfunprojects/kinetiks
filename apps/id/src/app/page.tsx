export default function Home() {
  return (
    <main
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <div style={{ textAlign: "center" }}>
        <h1
          style={{
            fontSize: 48,
            fontWeight: 700,
            color: "#6C5CE7",
            margin: 0,
          }}
        >
          Kinetiks ID
        </h1>
        <p style={{ color: "#666", marginTop: 8, fontSize: 18 }}>
          Your marketing intelligence identity
        </p>
      </div>
    </main>
  );
}

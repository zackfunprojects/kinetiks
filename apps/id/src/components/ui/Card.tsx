interface CardProps {
  children: React.ReactNode;
  style?: React.CSSProperties;
  onClick?: () => void;
}

export function Card({ children, style, onClick }: CardProps) {
  return (
    <div
      onClick={onClick}
      style={{
        border: "1px solid #E5E7EB",
        borderRadius: 12,
        padding: 20,
        background: "#fff",
        cursor: onClick ? "pointer" : undefined,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

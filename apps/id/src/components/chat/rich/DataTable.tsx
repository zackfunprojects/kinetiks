"use client";

export interface DataTableProps {
  columns: string[];
  rows: Array<Array<string | number>>;
  caption?: string;
}

/**
 * A compact inline table for prospect lists, metric comparisons, structured
 * data (spec-addendum-chat-ux §B.5 "Data tables"). Tokens-only; renders an
 * empty state when there are no rows.
 */
export function DataTable({ columns, rows, caption }: DataTableProps) {
  if (rows.length === 0) {
    return (
      <p
        style={{
          marginTop: "var(--kt-s-3)",
          fontSize: "var(--kt-fs-13)",
          color: "var(--kt-fg-3)",
        }}
      >
        No results.
      </p>
    );
  }

  return (
    <div style={{ marginTop: "var(--kt-s-3)", overflowX: "auto" }}>
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          fontSize: "var(--kt-fs-13)",
        }}
      >
        {caption && (
          <caption
            className="kt-data-inline"
            style={{
              captionSide: "top",
              textAlign: "left",
              color: "var(--kt-fg-3)",
              fontSize: "var(--kt-fs-11)",
              paddingBottom: "var(--kt-s-1)",
            }}
          >
            {caption}
          </caption>
        )}
        <thead>
          <tr>
            {columns.map((col) => (
              <th
                key={col}
                scope="col"
                style={{
                  textAlign: "left",
                  padding: "var(--kt-s-1) var(--kt-s-2)",
                  borderBottom: "1px solid var(--kt-border-2)",
                  color: "var(--kt-fg-3)",
                  fontWeight: "var(--kt-fw-med)",
                  whiteSpace: "nowrap",
                }}
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri}>
              {row.map((cell, ci) => (
                <td
                  key={ci}
                  style={{
                    padding: "var(--kt-s-1) var(--kt-s-2)",
                    borderBottom: "1px solid var(--kt-border-1)",
                    color: "var(--kt-fg-1)",
                  }}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

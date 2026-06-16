import { describe, it, expect } from "vitest";
import { commandResultToBlocks } from "../types";

describe("commandResultToBlocks", () => {
  it("emits an action_card with the panel + first approval when work opens a panel", () => {
    const blocks = commandResultToBlocks({
      text: "I built the sequence.",
      approval_ids: ["appr_1", "appr_2"],
      data: {},
      app_panel_open: { app_name: "harvest", entity_id: "seq_1", mode: "collaborative" },
    });
    expect(blocks).toHaveLength(1);
    const card = blocks[0];
    expect(card.kind).toBe("action_card");
    if (card.kind === "action_card") {
      expect(card.title).toBe("Harvest");
      expect(card.summary).toBe("I built the sequence.");
      expect(card.panel?.entity_id).toBe("seq_1");
      expect(card.approvalId).toBe("appr_1");
    }
  });

  it("turns an app results array into a data_table with columns from the first row", () => {
    const blocks = commandResultToBlocks({
      text: "Here are the prospects.",
      approval_ids: [],
      data: {
        harvest: {
          results: [
            { name: "Acme", title: "CFO" },
            { name: "Globex", title: "VP Finance" },
          ],
        },
      },
    });
    const table = blocks.find((b) => b.kind === "data_table");
    expect(table).toBeDefined();
    if (table && table.kind === "data_table") {
      expect(table.columns).toEqual(["name", "title"]);
      expect(table.rows).toEqual([
        ["Acme", "CFO"],
        ["Globex", "VP Finance"],
      ]);
      expect(table.caption).toContain("2 results");
    }
  });

  it("returns no blocks for a plain-text result (prose only)", () => {
    const blocks = commandResultToBlocks({
      text: "Your pipeline looks healthy.",
      approval_ids: [],
      data: {},
    });
    expect(blocks).toEqual([]);
  });
});

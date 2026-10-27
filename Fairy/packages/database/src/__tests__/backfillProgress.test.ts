import { describe, expect, it } from "vitest";
import { selectFreshRows, type PendingRow } from "../backfillProgress.js";

function rows(...ids: string[]): PendingRow[] {
  return ids.map((id) => ({ id, content: `content-${id}` }));
}

describe("selectFreshRows", () => {
  it("returns every row when nothing has been attempted yet", () => {
    const pending = rows("a", "b", "c");
    expect(selectFreshRows(pending, new Set<string>())).toEqual(pending);
  });

  it("drops rows that were already attempted", () => {
    const pending = rows("a", "b", "c");
    const fresh = selectFreshRows(pending, new Set(["a", "c"]));
    expect(fresh).toEqual([{ id: "b", content: "content-b" }]);
  });

  it("returns nothing when every pending row was already attempted", () => {
    const pending = rows("a", "b");
    expect(selectFreshRows(pending, new Set(["a", "b"]))).toEqual([]);
  });

  it("does not mutate the input array", () => {
    const pending = rows("a", "b");
    selectFreshRows(pending, new Set(["a"]));
    expect(pending).toEqual(rows("a", "b"));
  });
});

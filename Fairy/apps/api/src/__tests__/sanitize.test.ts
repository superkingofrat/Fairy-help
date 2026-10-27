import { describe, expect, it } from "vitest";
import { stripControlChars } from "../agent/sanitize.js";

describe("stripControlChars", () => {
  it("strips C0 controls except tab/newline/carriage return, plus DEL and C1", () => {
    expect(stripControlChars("a\u0000b\u0008c\u000Bd\u000Ee\u001Ff\u007Fg\u0085h\u009Fi")).toBe(
      "abcdefghi",
    );
  });

  it("keeps tab, newline and carriage return for upper-layer span handling", () => {
    expect(stripControlChars("a\tb\nc\rd")).toBe("a\tb\nc\rd");
  });
});

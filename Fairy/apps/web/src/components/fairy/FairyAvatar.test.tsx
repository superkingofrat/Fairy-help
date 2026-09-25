import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cleanup, render, screen } from "@testing-library/react";
import { deriveFairyExpression } from "./expressions";
import { FairyAvatar } from "./FairyAvatar";

function stubReducedMotion(matches: boolean): void {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("deriveFairyExpression", () => {
  it("prefers the celebration over every other state", () => {
    expect(deriveFairyExpression({ busy: false, streaming: false, celebrating: true })).toBe(
      "happy",
    );
    expect(deriveFairyExpression({ busy: true, streaming: true, celebrating: true })).toBe("happy");
  });

  it("splits the busy window into thinking and speaking by the first token", () => {
    expect(deriveFairyExpression({ busy: true, streaming: false, celebrating: false })).toBe(
      "thinking",
    );
    expect(deriveFairyExpression({ busy: true, streaming: true, celebrating: false })).toBe(
      "speaking",
    );
  });

  it("falls back to idle", () => {
    expect(deriveFairyExpression({ busy: false, streaming: false, celebrating: false })).toBe(
      "idle",
    );
    expect(deriveFairyExpression({ busy: false, streaming: true, celebrating: false })).toBe(
      "idle",
    );
  });
});

describe("FairyAvatar", () => {
  it("renders the self-drawn SVG face with an accessible idle label by default", () => {
    render(<FairyAvatar />);

    const avatar = screen.getByRole("img", { name: "Fairy 待机中" });
    expect(avatar.getAttribute("data-expression")).toBe("idle");
    expect(avatar.querySelector("svg")).not.toBeNull();
    // 自绘五官而非 emoji 占位
    expect(avatar.querySelector('[data-part="mouth-idle"]')).not.toBeNull();
    expect(avatar.textContent).not.toContain("🧚");
  });

  it("renders distinguishing parts for every expression", () => {
    const { rerender } = render(<FairyAvatar expression="thinking" />);
    expect(
      screen.getByTestId("fairy-avatar").querySelector('[data-part="think-dots"]'),
    ).not.toBeNull();

    rerender(<FairyAvatar expression="speaking" />);
    expect(
      screen.getByTestId("fairy-avatar").querySelector('[data-part="mouth-speak"]'),
    ).not.toBeNull();

    rerender(<FairyAvatar expression="happy" />);
    const happy = screen.getByTestId("fairy-avatar");
    expect(happy.querySelector('[data-part="eyes-happy"]')).not.toBeNull();
    expect(happy.querySelector('[data-part="sparkles"]')).not.toBeNull();
    expect(screen.getByRole("img", { name: "Fairy 心情很好" })).toBeDefined();
  });

  it("hides the decorative variant from assistive technology", () => {
    render(<FairyAvatar expression="idle" size="sm" decorative />);

    const decorative = screen.getByTestId("fairy-avatar-decorative");
    expect(decorative.getAttribute("aria-hidden")).toBe("true");
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("drops every animation class when the user prefers reduced motion", () => {
    stubReducedMotion(true);

    render(<FairyAvatar expression="speaking" size="lg" />);

    const avatar = screen.getByRole("img", { name: "Fairy 正在回答" });
    expect(avatar.className).toContain("fairy-avatar--static");
    const svg = avatar.querySelector("svg");
    expect(svg?.getAttribute("class")).toBe("fairy-avatar-svg");
    // 静态下表情仍可辨：说话嘴型部件还在，只是不动
    expect(svg?.querySelector('[data-part="mouth-speak"]')).not.toBeNull();
  });

  it("keeps animations when reduced motion is not requested", () => {
    stubReducedMotion(false);

    render(<FairyAvatar expression="speaking" />);

    const svg = screen.getByTestId("fairy-avatar").querySelector("svg");
    expect(svg?.getAttribute("class")).toContain("fairy-float");
    expect(svg?.getAttribute("class")).toContain("fairy-blink");
    expect(svg?.getAttribute("class")).toContain("fairy-avatar--speaking");
  });

  it("ships a CSS reduced-motion fallback for environments without the JS switch", () => {
    // vitest 默认桩掉 CSS import，这里按源文件静态核对 media 兜底存在
    const cssPath = join(dirname(fileURLToPath(import.meta.url)), "FairyAvatar.css");
    const css = readFileSync(cssPath, "utf8");

    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    expect(css).toContain("animation: none");
  });
});

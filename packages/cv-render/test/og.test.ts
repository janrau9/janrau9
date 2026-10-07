import { describe, expect, it } from "vitest";
import { renderCard } from "../src/og.ts";

const card = { key: "slash", title: "Slash", subtitle: "Live darts tournaments", footer: "janrau.dev/work/slash" };

describe("renderCard", () => {
  it("renders a 1200×630 PNG", () => {
    const png = renderCard(card);
    expect(png.subarray(1, 4).toString()).toBe("PNG");
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([1200, 630]);
  });

  it("draws the same card on every build", () => {
    expect(renderCard(card).equals(renderCard(card))).toBe(true);
  });

  it("draws a different lattice for a different card", () => {
    expect(renderCard(card).equals(renderCard({ ...card, key: "kiln" }))).toBe(false);
  });
});

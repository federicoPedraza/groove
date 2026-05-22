import { describe, expect, it } from "vitest";

import {
  BUG_DEFINITIONS,
  KINGDOMS,
  type BugKingdom,
} from "@/src/lib/bestiary/definitions";
import {
  ITEM_DEFINITIONS,
  ITEM_RARITIES,
  getIconicForBug,
  getIconicItemsForKingdom,
  getItemDefinition,
  getKingdomItems,
  getUniversalItems,
} from "@/src/lib/items/definitions";

const UNIVERSAL_COUNT = 12;
const KINGDOM_COUNT = 12;
const BUGS_PER_KINGDOM = 25;
const TOTAL_ITEM_COUNT =
  UNIVERSAL_COUNT + KINGDOM_COUNT * KINGDOMS.length + BUG_DEFINITIONS.length;

describe("items definitions", () => {
  it("contains the expected total of 160 items", () => {
    expect(ITEM_DEFINITIONS).toHaveLength(TOTAL_ITEM_COUNT);
    expect(TOTAL_ITEM_COUNT).toBe(160);
  });

  it("uses unique IDs across the whole table", () => {
    const ids = new Set(ITEM_DEFINITIONS.map((item) => item.id));
    expect(ids.size).toBe(ITEM_DEFINITIONS.length);
  });

  it("has 12 universal items", () => {
    expect(getUniversalItems()).toHaveLength(UNIVERSAL_COUNT);
  });

  it.each(KINGDOMS.map((k) => k.slug))(
    "kingdom %s has 12 kingdom items and 25 iconic items",
    (slug) => {
      expect(getKingdomItems(slug)).toHaveLength(KINGDOM_COUNT);
      expect(getIconicItemsForKingdom(slug)).toHaveLength(BUGS_PER_KINGDOM);
    },
  );

  it("has exactly one iconic per beast", () => {
    for (const bug of BUG_DEFINITIONS) {
      const iconic = getIconicForBug(bug.name);
      expect(iconic, `missing iconic for ${bug.name}`).toBeDefined();
      expect(iconic?.source.kind).toBe("iconic");
      if (iconic?.source.kind === "iconic") {
        expect(iconic.source.bugName).toBe(bug.name);
      }
    }
  });

  it("every iconic item references a real bug definition", () => {
    const bugNames = new Set(BUG_DEFINITIONS.map((bug) => bug.name));
    for (const item of ITEM_DEFINITIONS) {
      if (item.source.kind === "iconic") {
        expect(
          bugNames.has(item.source.bugName),
          `iconic item ${item.id} references unknown bug ${item.source.bugName}`,
        ).toBe(true);
      }
    }
  });

  it("every kingdom item references a known kingdom", () => {
    const slugs = new Set(KINGDOMS.map((k) => k.slug as BugKingdom));
    for (const item of ITEM_DEFINITIONS) {
      if (item.source.kind === "kingdom") {
        expect(slugs.has(item.source.kingdom)).toBe(true);
      }
    }
  });

  it("every item resolves to a public /items/ sprite path", () => {
    // A few items have dedicated PNGs at /items/<file>.png; everything
    // else falls back to the shared silhouette strip /items/item.png.
    for (const item of ITEM_DEFINITIONS) {
      expect(item.sprite.src.startsWith("/items/")).toBe(true);
      expect(item.sprite.src.endsWith(".png")).toBe(true);
      expect(item.sprite.frameCount).toBeGreaterThanOrEqual(1);
    }
  });

  it("uses only known rarities", () => {
    const known = new Set(ITEM_RARITIES);
    for (const item of ITEM_DEFINITIONS) {
      expect(known.has(item.rarity)).toBe(true);
    }
  });

  it("getItemDefinition resolves by id and returns undefined for unknown", () => {
    expect(getItemDefinition("bug-husk")?.name).toBe("Bug Husk");
    expect(getItemDefinition("not-a-real-id")).toBeUndefined();
  });
});

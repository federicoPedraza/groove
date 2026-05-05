import { describe, expect, it } from "vitest";

import {
  BUG_DEFINITIONS,
  BUG_DEFINITIONS_BY_NAME,
  KINGDOMS,
  getBugDefinition,
  getBugsByKingdom,
  getKingdom,
  type BugKingdom,
} from "@/src/lib/bestiary/definitions";

// Source of truth for bug names: BUG_NAME_LIBRARY in
// src-tauri/src/backend/workspace_metadata_settings/settings_runtime.rs:517
// If this list diverges from Rust, this test fails — keep in sync.
const EXPECTED_BUG_NAMES_FROM_RUST: readonly string[] = [
  "Omen", "Kirla", "Mern", "Kez", "Vex", "Drix", "Nyx", "Skarn", "Glin", "Thrax",
  "Korv", "Brak", "Zerg", "Mok", "Quill", "Snar", "Yenn", "Drog", "Pip", "Hex",
  "Slag", "Wisp", "Glob", "Ymir", "Onyx", "Pesk", "Tovl", "Wend", "Squa", "Twil",
  "Glop", "Rune", "Krug", "Smel", "Voth", "Krat", "Bask", "Frot", "Glim", "Tarn",
  "Rin", "Soul", "Drex", "Vyne", "Wirm", "Yrex", "Zar", "Mox", "Lirn", "Vorm",
  "Ker", "Nub", "Jerk", "Quip", "Reek", "Krev", "Yez", "Pog", "Yob", "Yek",
  "Shun", "Spin", "Crux", "Daxx", "Nim", "Pirl", "Mirk", "Brel", "Korn", "Rax",
  "Zlin", "Trog", "Ruk", "Slik", "Bom", "Crun", "Dril", "Ekk", "Fop", "Gru",
  "Hak", "Imp", "Jux", "Lop", "Murn", "Olm", "Pez", "Quor", "Ral", "Shu",
  "Tym", "Urz", "Wob", "Xer", "Yarl", "Zob", "Brez", "Drak", "Klin", "Pyx",
];

describe("bestiary definitions", () => {
  it("contains exactly 100 entries", () => {
    expect(BUG_DEFINITIONS).toHaveLength(100);
  });

  it("matches the canonical Rust BUG_NAME_LIBRARY name list in order", () => {
    expect(BUG_DEFINITIONS.map((definition) => definition.name)).toEqual(
      EXPECTED_BUG_NAMES_FROM_RUST,
    );
  });

  it("has all unique names with no whitespace", () => {
    const names = BUG_DEFINITIONS.map((definition) => definition.name);
    expect(new Set(names).size).toBe(names.length);
    for (const name of names) {
      expect(name.trim()).toBe(name);
      expect(name.length).toBeGreaterThan(0);
    }
  });

  it("populates non-empty description and history for every entry", () => {
    for (const definition of BUG_DEFINITIONS) {
      expect(definition.description.trim().length).toBeGreaterThan(0);
      expect(definition.history.trim().length).toBeGreaterThan(0);
    }
  });

  it("declares exactly 4 kingdoms with 25 bugs in each", () => {
    expect(KINGDOMS).toHaveLength(4);
    const slugs = KINGDOMS.map((kingdom) => kingdom.slug);
    for (const slug of slugs) {
      expect(getBugsByKingdom(slug)).toHaveLength(25);
    }
  });

  it("looks up definitions by name and returns undefined for unknown names", () => {
    expect(getBugDefinition("Omen")?.kingdom).toBe<BugKingdom>("veilwood");
    expect(getBugDefinition("Pyx")?.kingdom).toBe<BugKingdom>("voidspire");
    expect(getBugDefinition("not-a-real-bug")).toBeUndefined();
    expect(BUG_DEFINITIONS_BY_NAME.size).toBe(BUG_DEFINITIONS.length);
  });

  it("returns kingdom metadata via getKingdom", () => {
    expect(getKingdom("veilwood").label).toBe("Veilwood");
    expect(getKingdom("voidspire").label).toBe("Voidspire");
  });
});

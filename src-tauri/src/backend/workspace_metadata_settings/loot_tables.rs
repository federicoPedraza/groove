// Loot drop tables. Mirrors the IDs + rarity tier of every item in
// src/lib/items/definitions.ts. The TS file is the source of truth
// for names/sprites/descriptions; this file is the source of truth
// for which IDs exist in which pool and at which rarity tier (used
// only by the loot roller).
//
// If you add or rename an item ID here, update the TS file too. The
// `loot_ids_match_typescript_definitions` test compares both.

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum LootRarity {
    Common,
    Uncommon,
    Rare,
    Epic,
    Legendary,
}

impl LootRarity {
    fn as_serde_str(self) -> &'static str {
        match self {
            LootRarity::Common => "common",
            LootRarity::Uncommon => "uncommon",
            LootRarity::Rare => "rare",
            LootRarity::Epic => "epic",
            LootRarity::Legendary => "legendary",
        }
    }
}

type LootEntry = (&'static str, LootRarity);

// --- Universal pool (any unit can roll these) ------------------------------

const UNIVERSAL_ITEMS: &[LootEntry] = &[
    ("bug-husk", LootRarity::Common),
    ("mandible-fragment", LootRarity::Common),
    ("antenna-bristle", LootRarity::Common),
    ("leg-joint", LootRarity::Common),
    ("cracked-eyestalk", LootRarity::Common),
    ("chitin-shard", LootRarity::Uncommon),
    ("glimmer-mote", LootRarity::Uncommon),
    ("thorax-plate", LootRarity::Uncommon),
    ("ichor-drop", LootRarity::Uncommon),
    ("vestigial-wing", LootRarity::Rare),
    ("hatchling-tooth", LootRarity::Rare),
    ("brood-marrow", LootRarity::Epic),
];

// --- Per-kingdom pools -----------------------------------------------------

const VEILWOOD_ITEMS: &[LootEntry] = &[
    ("mossy-carapace", LootRarity::Common),
    ("spore-pouch", LootRarity::Common),
    ("bark-flake", LootRarity::Common),
    ("lichen-vein", LootRarity::Uncommon),
    ("resin-tear", LootRarity::Uncommon),
    ("fern-curl", LootRarity::Uncommon),
    ("glowleaf", LootRarity::Rare),
    ("heartwood-splinter", LootRarity::Rare),
    ("druid-bracken", LootRarity::Rare),
    ("sapling-crown", LootRarity::Epic),
    ("witchroot-knot", LootRarity::Epic),
    ("veiled-acorn", LootRarity::Legendary),
];

const EMBERFORGE_ITEMS: &[LootEntry] = &[
    ("cinder-flake", LootRarity::Common),
    ("slag-pellet", LootRarity::Common),
    ("pumice-bead", LootRarity::Common),
    ("sulfur-tooth", LootRarity::Uncommon),
    ("forge-coal", LootRarity::Uncommon),
    ("ash-lacquer", LootRarity::Uncommon),
    ("obsidian-fang", LootRarity::Rare),
    ("magma-vial", LootRarity::Rare),
    ("brass-slag", LootRarity::Rare),
    ("smiths-sigil", LootRarity::Epic),
    ("furnace-tongue", LootRarity::Epic),
    ("heart-of-the-forge", LootRarity::Legendary),
];

const TIDEHOLLOW_ITEMS: &[LootEntry] = &[
    ("brine-bead", LootRarity::Common),
    ("damp-scale", LootRarity::Common),
    ("kelp-strand", LootRarity::Common),
    ("coral-ring", LootRarity::Uncommon),
    ("pearl-bead", LootRarity::Uncommon),
    ("salt-glass-shard", LootRarity::Uncommon),
    ("anglerlight", LootRarity::Rare),
    ("trench-pearl", LootRarity::Rare),
    ("silt-compass", LootRarity::Rare),
    ("hollow-tide", LootRarity::Epic),
    ("lantern-brine", LootRarity::Epic),
    ("crown-of-the-trench-king", LootRarity::Legendary),
];

const VOIDSPIRE_ITEMS: &[LootEntry] = &[
    ("stardust-pinch", LootRarity::Common),
    ("glass-splinter", LootRarity::Common),
    ("cold-filament", LootRarity::Common),
    ("magnet-filing", LootRarity::Uncommon),
    ("star-chart-fragment", LootRarity::Uncommon),
    ("vacuum-pearl", LootRarity::Uncommon),
    ("light-glass", LootRarity::Rare),
    ("gravity-pebble", LootRarity::Rare),
    ("comet-hair", LootRarity::Rare),
    ("constellation-lens", LootRarity::Epic),
    ("astral-pin", LootRarity::Epic),
    ("eye-of-the-spire", LootRarity::Legendary),
];

// --- Iconic per-bug --------------------------------------------------------
//
// One iconic per beast (100 entries). Only drops when fighting that
// specific bug. Indexed by bug name (case-sensitive, matching
// `BUG_NAME_LIBRARY`). 77 R / 17 E / 6 L.

const ICONIC_ITEMS: &[(&'static str, &'static str, LootRarity)] = &[
    // Veilwood
    ("Omen", "omen-falling-tree-chitter", LootRarity::Rare),
    ("Kirla", "kirla-regrown-lichen-leg", LootRarity::Rare),
    ("Mern", "mern-translucent-sap-sac", LootRarity::Rare),
    ("Kez", "kez-mist-track-charm", LootRarity::Rare),
    ("Vex", "vex-petrified-thought", LootRarity::Rare),
    ("Drix", "drix-gold-dust-pellet", LootRarity::Rare),
    ("Nyx", "nyx-soundless-wing", LootRarity::Epic),
    ("Skarn", "skarn-curved-joust-horn", LootRarity::Rare),
    ("Glin", "glin-steady-lantern-globe", LootRarity::Rare),
    ("Thrax", "thrax-bone-white-tally", LootRarity::Rare),
    ("Korv", "korv-rasping-tongue", LootRarity::Rare),
    ("Brak", "brak-twilight-croak-sac", LootRarity::Rare),
    ("Zerg", "zerg-living-arrow", LootRarity::Rare),
    ("Mok", "mok-eyeless-antenna", LootRarity::Rare),
    ("Quill", "quill-spine-coronet", LootRarity::Rare),
    ("Snar", "snar-honey-cake-crumb", LootRarity::Rare),
    ("Yenn", "yenn-quiet-forelimb", LootRarity::Rare),
    ("Drog", "drog-iron-black-yoke", LootRarity::Rare),
    ("Pip", "pip-mimic-acorn", LootRarity::Rare),
    ("Hex", "hex-geometric-web-pattern", LootRarity::Epic),
    ("Slag", "slag-hardened-pulp-shell", LootRarity::Rare),
    ("Wisp", "wisp-held-breath-wing", LootRarity::Rare),
    ("Glob", "glob-memoryless-gel-strand", LootRarity::Rare),
    ("Ymir", "ymir-witnesss-red-ink", LootRarity::Legendary),
    ("Onyx", "onyx-onyx-cabochon", LootRarity::Legendary),
    // Emberforge
    ("Pesk", "pesk-cooling-crust-egg", LootRarity::Rare),
    ("Tovl", "tovl-obsidian-foot", LootRarity::Rare),
    ("Wend", "wend-soot-colorless-wing", LootRarity::Rare),
    ("Squa", "squa-basalt-crusted-shell", LootRarity::Rare),
    ("Twil", "twil-apprentice-spark", LootRarity::Rare),
    ("Glop", "glop-pumice-froth-trail", LootRarity::Epic),
    ("Rune", "rune-etched-glyph-plate", LootRarity::Epic),
    ("Krug", "krug-bell-armor-plate", LootRarity::Epic),
    ("Smel", "smel-etched-brass-coin", LootRarity::Rare),
    ("Voth", "voth-smouldering-belly-coal", LootRarity::Rare),
    ("Krat", "krat-forge-road-glue", LootRarity::Rare),
    ("Bask", "bask-hearth-lintel-charm", LootRarity::Epic),
    ("Frot", "frot-pale-frot-snow", LootRarity::Rare),
    ("Glim", "glim-lucky-cricket-chirp", LootRarity::Rare),
    ("Tarn", "tarn-initiation-scar", LootRarity::Epic),
    ("Rin", "rin-tomorrows-flame-wing", LootRarity::Epic),
    ("Soul", "soul-quiet-death-thread", LootRarity::Legendary),
    ("Drex", "drex-cliff-edge-marker", LootRarity::Rare),
    ("Vyne", "vyne-lava-diver-hide", LootRarity::Rare),
    ("Wirm", "wirm-round-tunnel-hole", LootRarity::Rare),
    ("Yrex", "yrex-rivals-yrex-scale", LootRarity::Rare),
    ("Zar", "zar-spark-trail-charm", LootRarity::Rare),
    ("Mox", "mox-cinder-line-hook", LootRarity::Rare),
    ("Lirn", "lirn-stilt-god-filament", LootRarity::Epic),
    ("Vorm", "vorm-stolen-tool", LootRarity::Rare),
    // Tidehollow
    ("Ker", "ker-pulsing-cold-lantern", LootRarity::Rare),
    ("Nub", "nub-soft-eye-glow", LootRarity::Rare),
    ("Jerk", "jerk-spring-loaded-tail-coil", LootRarity::Rare),
    ("Quip", "quip-tide-omen-bristle", LootRarity::Rare),
    ("Reek", "reek-milky-cloud-vial", LootRarity::Rare),
    ("Krev", "krev-court-powder", LootRarity::Rare),
    ("Yez", "yez-trench-kings-banner-thread", LootRarity::Epic),
    ("Pog", "pog-calm-water-charm", LootRarity::Rare),
    ("Yob", "yob-silt-walkers-guide-trail", LootRarity::Rare),
    ("Yek", "yek-trench-whale-latch-hook", LootRarity::Rare),
    ("Shun", "shun-brine-mourners-knot", LootRarity::Epic),
    ("Spin", "spin-shell-coin", LootRarity::Epic),
    ("Crux", "crux-floor-sigil", LootRarity::Legendary),
    ("Daxx", "daxx-apprentice-quill", LootRarity::Rare),
    ("Nim", "nim-synchronized-fin", LootRarity::Rare),
    ("Pirl", "pirl-empty-bead", LootRarity::Rare),
    ("Mirk", "mirk-cove-vanishing-wing", LootRarity::Rare),
    ("Brel", "brel-slow-dancers-filament", LootRarity::Rare),
    ("Korn", "korn-brine-altar-block", LootRarity::Rare),
    ("Rax", "rax-surgeons-blade", LootRarity::Rare),
    ("Zlin", "zlin-paper-thin-plate", LootRarity::Rare),
    ("Trog", "trog-lighthouse-companion", LootRarity::Rare),
    ("Ruk", "ruk-pincer-crest", LootRarity::Epic),
    ("Slik", "slik-mucous-net-slip", LootRarity::Rare),
    ("Bom", "bom-burst-vial", LootRarity::Rare),
    // Voidspire
    ("Crun", "crun-star-born-shard", LootRarity::Rare),
    ("Dril", "dril-pale-metal-pigment", LootRarity::Rare),
    ("Ekk", "ekk-constellation-eye", LootRarity::Rare),
    ("Fop", "fop-magnetism-tuft", LootRarity::Rare),
    ("Gru", "gru-skyboat-ballast-stone", LootRarity::Rare),
    ("Hak", "hak-watchmakers-lintel-mark", LootRarity::Rare),
    ("Imp", "imp-void-glitch-token", LootRarity::Rare),
    ("Jux", "jux-folded-geometry-tail", LootRarity::Rare),
    ("Lop", "lop-asymmetric-future-token", LootRarity::Rare),
    ("Murn", "murn-anti-forgetting-fur", LootRarity::Epic),
    ("Olm", "olm-compass-antenna", LootRarity::Rare),
    ("Pez", "pez-pressure-pop-carapace", LootRarity::Rare),
    ("Quor", "quor-tutors-bite-mark", LootRarity::Rare),
    ("Ral", "ral-conversational-light-pulse", LootRarity::Epic),
    ("Shu", "shu-felted-foot-pad", LootRarity::Rare),
    ("Tym", "tym-second-beat-spring", LootRarity::Epic),
    ("Urz", "urz-vesper-resonator", LootRarity::Epic),
    ("Wob", "wob-endurance-charm", LootRarity::Rare),
    ("Xer", "xer-sky-tower-crossbeam", LootRarity::Rare),
    ("Yarl", "yarl-night-call-bell", LootRarity::Rare),
    ("Zob", "zob-lightning-trace-filament", LootRarity::Rare),
    ("Brez", "brez-wing-shard", LootRarity::Rare),
    ("Drak", "drak-vapor-coil", LootRarity::Legendary),
    ("Klin", "klin-dawn-chime", LootRarity::Rare),
    ("Pyx", "pyx-scent-bonded-shell", LootRarity::Legendary),
];

// --- Bug-name → kingdom map ------------------------------------------------
//
// Mirrors the kingdom split in src/lib/bestiary/definitions.ts:
//   indices 0..=24  → Veilwood
//   indices 25..=49 → Emberforge
//   indices 50..=74 → Tidehollow
//   indices 75..=99 → Voidspire

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum LootKingdom {
    Veilwood,
    Emberforge,
    Tidehollow,
    Voidspire,
}

impl LootKingdom {
    fn pool(self) -> &'static [LootEntry] {
        match self {
            LootKingdom::Veilwood => VEILWOOD_ITEMS,
            LootKingdom::Emberforge => EMBERFORGE_ITEMS,
            LootKingdom::Tidehollow => TIDEHOLLOW_ITEMS,
            LootKingdom::Voidspire => VOIDSPIRE_ITEMS,
        }
    }
}

const VEILWOOD_BUG_NAMES: &[&str] = &[
    "Omen", "Kirla", "Mern", "Kez", "Vex", "Drix", "Nyx", "Skarn", "Glin", "Thrax",
    "Korv", "Brak", "Zerg", "Mok", "Quill", "Snar", "Yenn", "Drog", "Pip", "Hex",
    "Slag", "Wisp", "Glob", "Ymir", "Onyx",
];
const EMBERFORGE_BUG_NAMES: &[&str] = &[
    "Pesk", "Tovl", "Wend", "Squa", "Twil", "Glop", "Rune", "Krug", "Smel", "Voth",
    "Krat", "Bask", "Frot", "Glim", "Tarn", "Rin", "Soul", "Drex", "Vyne", "Wirm",
    "Yrex", "Zar", "Mox", "Lirn", "Vorm",
];
const TIDEHOLLOW_BUG_NAMES: &[&str] = &[
    "Ker", "Nub", "Jerk", "Quip", "Reek", "Krev", "Yez", "Pog", "Yob", "Yek",
    "Shun", "Spin", "Crux", "Daxx", "Nim", "Pirl", "Mirk", "Brel", "Korn", "Rax",
    "Zlin", "Trog", "Ruk", "Slik", "Bom",
];
const VOIDSPIRE_BUG_NAMES: &[&str] = &[
    "Crun", "Dril", "Ekk", "Fop", "Gru", "Hak", "Imp", "Jux", "Lop", "Murn",
    "Olm", "Pez", "Quor", "Ral", "Shu", "Tym", "Urz", "Wob", "Xer", "Yarl",
    "Zob", "Brez", "Drak", "Klin", "Pyx",
];

fn kingdom_for_bug_name(name: &str) -> Option<LootKingdom> {
    if VEILWOOD_BUG_NAMES.iter().any(|n| *n == name) {
        Some(LootKingdom::Veilwood)
    } else if EMBERFORGE_BUG_NAMES.iter().any(|n| *n == name) {
        Some(LootKingdom::Emberforge)
    } else if TIDEHOLLOW_BUG_NAMES.iter().any(|n| *n == name) {
        Some(LootKingdom::Tidehollow)
    } else if VOIDSPIRE_BUG_NAMES.iter().any(|n| *n == name) {
        Some(LootKingdom::Voidspire)
    } else {
        None
    }
}

fn iconic_for_bug_name(name: &str) -> Option<(&'static str, LootRarity)> {
    ICONIC_ITEMS
        .iter()
        .find(|(bug_name, _, _)| *bug_name == name)
        .map(|(_, item_id, rarity)| (*item_id, *rarity))
}

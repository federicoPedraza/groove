// Items, drops, and loot taxonomy. Mirrors the bestiary kingdoms in
// src/lib/bestiary/definitions.ts. Sprite paths follow the mascot
// MascotSpriteDefinition shape so the existing renderer can play them
// (see src/lib/utils/mascots.ts:16). Mapped PNGs live flat under
// /public/items/; anything unmapped renders the generic silhouette
// strip at /items/item.png. The data layer is authoritative.
//
// IDs are stable strings used by the Rust loot roller and persisted
// in workspace.json. Do NOT rename without a migration. The Rust side
// keeps a parallel id+rarity list in
// src-tauri/src/backend/workspace_metadata_settings/loot_tables.rs;
// keep them in sync.

import type { BugKingdom } from "@/src/lib/bestiary/definitions";
import { BUG_DEFINITIONS } from "@/src/lib/bestiary/definitions";
import type { MascotSpriteDefinition } from "@/src/lib/utils/mascots";

export type ItemRarity =
  | "common"
  | "uncommon"
  | "rare"
  | "epic"
  | "legendary";

export const ITEM_RARITIES: readonly ItemRarity[] = [
  "common",
  "uncommon",
  "rare",
  "epic",
  "legendary",
] as const;

export type ItemSource =
  | { kind: "universal" }
  | { kind: "kingdom"; kingdom: BugKingdom }
  | { kind: "iconic"; bugName: string };

export type ItemDefinition = {
  id: string;
  name: string;
  rarity: ItemRarity;
  source: ItemSource;
  description: string;
  sprite: MascotSpriteDefinition;
};

type RarityVariantClassNames = {
  border: string;
  text: string;
  badge: string;
};

const RARITY_CLASS_NAMES: Readonly<Record<ItemRarity, RarityVariantClassNames>> =
  {
    common: {
      border: "border-zinc-500/45 dark:border-zinc-300/45",
      text: "text-zinc-700 dark:text-zinc-300",
      badge:
        "border-zinc-600 bg-zinc-800 text-zinc-50 dark:border-zinc-500 dark:bg-zinc-700",
    },
    uncommon: {
      border: "border-emerald-500/45 dark:border-emerald-300/55",
      text: "text-emerald-700 dark:text-emerald-300",
      badge:
        "border-emerald-700 bg-emerald-900 text-emerald-50 dark:border-emerald-600",
    },
    rare: {
      border: "border-sky-500/45 dark:border-sky-300/55",
      text: "text-sky-700 dark:text-sky-300",
      badge:
        "border-sky-700 bg-sky-900 text-sky-50 dark:border-sky-600",
    },
    epic: {
      border: "border-violet-500/45 dark:border-violet-300/55",
      text: "text-violet-700 dark:text-violet-300",
      badge:
        "border-violet-700 bg-violet-900 text-violet-50 dark:border-violet-600",
    },
    legendary: {
      border: "border-amber-500/55 dark:border-amber-300/65",
      text: "text-amber-700 dark:text-amber-300",
      badge:
        "border-amber-600 bg-amber-700 text-amber-50 dark:border-amber-500 dark:bg-amber-800",
    },
  };

export function getRarityBorderClassName(rarity: ItemRarity): string {
  return RARITY_CLASS_NAMES[rarity].border;
}

export function getRarityTextClassName(rarity: ItemRarity): string {
  return RARITY_CLASS_NAMES[rarity].text;
}

export function getRarityBadgeClassName(rarity: ItemRarity): string {
  return RARITY_CLASS_NAMES[rarity].badge;
}

const ITEM_SPRITE_FRAME_PX = 144;
const ITEM_SPRITE_FRAME_COUNT = 24;
const FALLBACK_ITEM_SPRITE_SRC = "/items/item.png";

// Real PNGs that ship today live flat under /public/items/<file>.png and
// share a uniform 24-frame strip of 144x144 cells. Anything not listed
// here falls back to /items/item.png (the generic silhouette strip,
// same 24x144 layout).
const SPRITE_FILE_OVERRIDES: Readonly<Record<string, string>> = {
  "bug-husk": "/items/bug_husk.png",
  "mandible-fragment": "/items/mandible_fragment.png",
  "antenna-bristle": "/items/antenna.png",
  "leg-joint": "/items/bug_leg_joint.png",
  "cracked-eyestalk": "/items/bug_eyes.png",
  "chitin-shard": "/items/chitin_shard.png",
  "glimmer-mote": "/items/glimmer_mote.png",
};

function placeholderSprite(id: string): MascotSpriteDefinition {
  return {
    src: SPRITE_FILE_OVERRIDES[id] ?? FALLBACK_ITEM_SPRITE_SRC,
    frameCount: ITEM_SPRITE_FRAME_COUNT,
    frameWidthPx: ITEM_SPRITE_FRAME_PX,
    frameHeightPx: ITEM_SPRITE_FRAME_PX,
    frameYOffsetPx: 0,
    renderedHeightPx: ITEM_SPRITE_FRAME_PX,
    animationSpeedMultiplier: 1.25,
  };
}

type ItemSeed = {
  id: string;
  name: string;
  rarity: ItemRarity;
  description: string;
};

type IconicSeed = ItemSeed & { bugName: string };

const UNIVERSAL_SEEDS: readonly ItemSeed[] = [
  {
    id: "bug-husk",
    name: "Bug Husk",
    rarity: "common",
    description: "An empty exoskeleton, brittle and faintly hollow.",
  },
  {
    id: "mandible-fragment",
    name: "Mandible Fragment",
    rarity: "common",
    description: "Half a jaw, snapped clean at the joint.",
  },
  {
    id: "antenna-bristle",
    name: "Antenna Bristle",
    rarity: "common",
    description: "A twitching whisker that won't quite stop moving.",
  },
  {
    id: "leg-joint",
    name: "Leg Joint",
    rarity: "common",
    description: "A knuckled segment of chitin, useful for almost nothing.",
  },
  {
    id: "cracked-eyestalk",
    name: "Cracked Eyestalk",
    rarity: "common",
    description: "Still seems to be looking at you. Don't think about it.",
  },
  {
    id: "chitin-shard",
    name: "Chitin Shard",
    rarity: "uncommon",
    description: "Plate splinter, harder than it looks.",
  },
  {
    id: "glimmer-mote",
    name: "Glimmer Mote",
    rarity: "uncommon",
    description: "Residual life-spark, kept alive in a sealed jar.",
  },
  {
    id: "thorax-plate",
    name: "Thorax Plate",
    rarity: "uncommon",
    description: "Ribbed armour scale, big enough to stand on a fingertip.",
  },
  {
    id: "ichor-drop",
    name: "Ichor Drop",
    rarity: "uncommon",
    description: "Bug-blood, oddly sweet, oddly cold.",
  },
  {
    id: "vestigial-wing",
    name: "Vestigial Wing",
    rarity: "rare",
    description: "Membrane preserved between two slips of glass.",
  },
  {
    id: "hatchling-tooth",
    name: "Hatchling Tooth",
    rarity: "rare",
    description: "First tooth of something that grew up to eat its kin.",
  },
  {
    id: "brood-marrow",
    name: "Brood Marrow",
    rarity: "epic",
    description: "Pulped queen-bone. Hums when you set it down.",
  },
];

const VEILWOOD_KINGDOM_SEEDS: readonly ItemSeed[] = [
  {
    id: "mossy-carapace",
    name: "Mossy Carapace",
    rarity: "common",
    description: "Carapace fragment furred over with green velvet.",
  },
  {
    id: "spore-pouch",
    name: "Spore Pouch",
    rarity: "common",
    description: "Sealed sac of forest dust. Don't open indoors.",
  },
  {
    id: "bark-flake",
    name: "Bark Flake",
    rarity: "common",
    description: "Curl of bark with the smell of wet oak.",
  },
  {
    id: "lichen-vein",
    name: "Lichen Vein",
    rarity: "uncommon",
    description: "Silvery mycelial thread, still faintly twitching.",
  },
  {
    id: "resin-tear",
    name: "Resin Tear",
    rarity: "uncommon",
    description: "Amber droplet of tree-blood, traps a breath of pollen.",
  },
  {
    id: "fern-curl",
    name: "Fern Curl",
    rarity: "uncommon",
    description: "Spring-tight green coil that uncoils when warmed.",
  },
  {
    id: "glowleaf",
    name: "Glowleaf",
    rarity: "rare",
    description: "Phosphorescent canopy frond. Lights a room for one night.",
  },
  {
    id: "heartwood-splinter",
    name: "Heartwood Splinter",
    rarity: "rare",
    description: "Sliver from a sentient tree. Faintly recognises you.",
  },
  {
    id: "druid-bracken",
    name: "Druid Bracken",
    rarity: "rare",
    description: "Knotted bracken-shoot once worn at a Veilwood rite.",
  },
  {
    id: "sapling-crown",
    name: "Sapling Crown",
    rarity: "epic",
    description: "Embryo of a witch-grove, sleeping in a husk of bark.",
  },
  {
    id: "witchroot-knot",
    name: "Witchroot Knot",
    rarity: "epic",
    description: "Tangle of root that flexes like a slow fist.",
  },
  {
    id: "veiled-acorn",
    name: "Veiled Acorn",
    rarity: "legendary",
    description: "Seed that whispers when held. Plant it and don't ask why.",
  },
];

const EMBERFORGE_KINGDOM_SEEDS: readonly ItemSeed[] = [
  {
    id: "cinder-flake",
    name: "Cinder Flake",
    rarity: "common",
    description: "Warm crumb of volcanic ash, never quite cooling.",
  },
  {
    id: "slag-pellet",
    name: "Slag Pellet",
    rarity: "common",
    description: "Bead of cooled forge-slag, heavier than it looks.",
  },
  {
    id: "pumice-bead",
    name: "Pumice Bead",
    rarity: "common",
    description: "Light and porous, floats on water for an hour.",
  },
  {
    id: "sulfur-tooth",
    name: "Sulfur Tooth",
    rarity: "uncommon",
    description: "Yellow crystallised vapor, sharp at the tip.",
  },
  {
    id: "forge-coal",
    name: "Forge Coal",
    rarity: "uncommon",
    description: "Ember that refuses to die. Useful in winter.",
  },
  {
    id: "ash-lacquer",
    name: "Ash Lacquer",
    rarity: "uncommon",
    description: "Coal-black varnish, used to seal forge contracts.",
  },
  {
    id: "obsidian-fang",
    name: "Obsidian Fang",
    rarity: "rare",
    description: "Knapped glass blade. Cuts most things and itself last.",
  },
  {
    id: "magma-vial",
    name: "Magma Vial",
    rarity: "rare",
    description: "Bottled droplet of living lava, kept warm by its own anger.",
  },
  {
    id: "brass-slag",
    name: "Brass Slag",
    rarity: "rare",
    description: "Wedge of unrefined brass with veins of gold.",
  },
  {
    id: "smiths-sigil",
    name: "Smith's Sigil",
    rarity: "epic",
    description: "Branded guild-mark, still warm to the touch after years.",
  },
  {
    id: "furnace-tongue",
    name: "Furnace Tongue",
    rarity: "epic",
    description: "Iron ladle bent by centuries of pouring.",
  },
  {
    id: "heart-of-the-forge",
    name: "Heart of the Forge",
    rarity: "legendary",
    description: "Pulsing ember-core. Beats in time with whoever holds it.",
  },
];

const TIDEHOLLOW_KINGDOM_SEEDS: readonly ItemSeed[] = [
  {
    id: "brine-bead",
    name: "Brine Bead",
    rarity: "common",
    description: "Salt-crystal pellet, smells like a fishing dock.",
  },
  {
    id: "damp-scale",
    name: "Damp Scale",
    rarity: "common",
    description: "Translucent fleck that never fully dries.",
  },
  {
    id: "kelp-strand",
    name: "Kelp Strand",
    rarity: "common",
    description: "Ribbon of kelp, slightly self-coiling.",
  },
  {
    id: "coral-ring",
    name: "Coral Ring",
    rarity: "uncommon",
    description: "Calcified band, hollow, fits a thumb.",
  },
  {
    id: "pearl-bead",
    name: "Pearl Bead",
    rarity: "uncommon",
    description: "Small cloudy sphere, slightly too round.",
  },
  {
    id: "salt-glass-shard",
    name: "Salt-Glass Shard",
    rarity: "uncommon",
    description: "Glass made of compressed brine, refracts grey.",
  },
  {
    id: "anglerlight",
    name: "Anglerlight",
    rarity: "rare",
    description: "A captured deep-glow, kept in a little brass cage.",
  },
  {
    id: "trench-pearl",
    name: "Trench Pearl",
    rarity: "rare",
    description: "Perfectly round and perfectly empty inside.",
  },
  {
    id: "silt-compass",
    name: "Silt Compass",
    rarity: "rare",
    description: "A trail-tip from a Yob, set into a brine-walker's pin.",
  },
  {
    id: "hollow-tide",
    name: "Hollow Tide",
    rarity: "epic",
    description: "Vial of breathing seawater. Inhales every nineteen seconds.",
  },
  {
    id: "lantern-brine",
    name: "Lantern Brine",
    rarity: "epic",
    description: "Brine that holds a single point of light, suspended.",
  },
  {
    id: "crown-of-the-trench-king",
    name: "Crown of the Trench-King",
    rarity: "legendary",
    description: "Diadem of bone and sea-silk, bent slightly by deep pressure.",
  },
];

const VOIDSPIRE_KINGDOM_SEEDS: readonly ItemSeed[] = [
  {
    id: "stardust-pinch",
    name: "Stardust Pinch",
    rarity: "common",
    description: "Mote of frozen sky-light. Kept in a thimble.",
  },
  {
    id: "glass-splinter",
    name: "Glass Splinter",
    rarity: "common",
    description: "A fleck of refracting glass, throws rainbows in candlelight.",
  },
  {
    id: "cold-filament",
    name: "Cold Filament",
    rarity: "common",
    description: "Hair-thin wire that's always slightly chilly.",
  },
  {
    id: "magnet-filing",
    name: "Magnet Filing",
    rarity: "uncommon",
    description: "Drifting iron flake; aligns to nothing on this world.",
  },
  {
    id: "star-chart-fragment",
    name: "Star Chart Fragment",
    rarity: "uncommon",
    description: "Torn corner of a Voidspire chart, three constellations short.",
  },
  {
    id: "vacuum-pearl",
    name: "Vacuum Pearl",
    rarity: "uncommon",
    description: "Pearl with no inside. Weighs nothing.",
  },
  {
    id: "light-glass",
    name: "Light Glass",
    rarity: "rare",
    description: "Disc of glass that has been told a secret.",
  },
  {
    id: "gravity-pebble",
    name: "Gravity Pebble",
    rarity: "rare",
    description: "Small stone that weighs different amounts on different days.",
  },
  {
    id: "comet-hair",
    name: "Comet Hair",
    rarity: "rare",
    description: "A single fibre of comet-tail, kept under glass.",
  },
  {
    id: "constellation-lens",
    name: "Constellation Lens",
    rarity: "epic",
    description: "Prism that focuses starlight into one bright thought.",
  },
  {
    id: "astral-pin",
    name: "Astral Pin",
    rarity: "epic",
    description: "Brooch made from a fixed-point in the night sky.",
  },
  {
    id: "eye-of-the-spire",
    name: "Eye of the Spire",
    rarity: "legendary",
    description: "Ever-watching aperture. Blinks once per generation.",
  },
];

const ICONIC_SEEDS: readonly IconicSeed[] = [
  // Veilwood
  {
    bugName: "Omen",
    id: "omen-falling-tree-chitter",
    name: "Falling-Tree Chitter",
    rarity: "rare",
    description:
      "A glass jar of the chitter Omens make seconds before a tree falls.",
  },
  {
    bugName: "Kirla",
    id: "kirla-regrown-lichen-leg",
    name: "Regrown Lichen Leg",
    rarity: "rare",
    description: "A leg shed and regrown overnight, still mossing over.",
  },
  {
    bugName: "Mern",
    id: "mern-translucent-sap-sac",
    name: "Translucent Sap-Sac",
    rarity: "rare",
    description: "Small sac of paralyzing sap, harvested whole from a Mern.",
  },
  {
    bugName: "Kez",
    id: "kez-mist-track-charm",
    name: "Mist-Track Charm",
    rarity: "rare",
    description: "Charm woven from Kez mist; finds water in the dark.",
  },
  {
    bugName: "Vex",
    id: "vex-petrified-thought",
    name: "Petrified Thought",
    rarity: "rare",
    description: "What a dying tree was thinking, now small and round.",
  },
  {
    bugName: "Drix",
    id: "drix-gold-dust-pellet",
    name: "Drix Gold-Dust Pellet",
    rarity: "rare",
    description: "Pellet of gold dust pressed from Drix-visited flowers.",
  },
  {
    bugName: "Nyx",
    id: "nyx-soundless-wing",
    name: "Soundless Wing",
    rarity: "epic",
    description: "Wing of a Nyx, used by mourners to carry names to the moon.",
  },
  {
    bugName: "Skarn",
    id: "skarn-curved-joust-horn",
    name: "Curved Joust-Horn",
    rarity: "rare",
    description: "Single curved horn from a Skarn-jousting champion.",
  },
  {
    bugName: "Glin",
    id: "glin-steady-lantern-globe",
    name: "Steady Lantern Globe",
    rarity: "rare",
    description: "A still-glowing Glin tail, sealed in glass.",
  },
  {
    bugName: "Thrax",
    id: "thrax-bone-white-tally",
    name: "Bone-White Tally",
    rarity: "rare",
    description: "A length of Thrax leg, used to tally forest debts.",
  },
  {
    bugName: "Korv",
    id: "korv-rasping-tongue",
    name: "Rasping Tongue",
    rarity: "rare",
    description: "Tongue of a Korv, still rasping at nothing in the dark.",
  },
  {
    bugName: "Brak",
    id: "brak-twilight-croak-sac",
    name: "Twilight Croak Sac",
    rarity: "rare",
    description: "Inflatable throat sac of a Brak, croaks once when squeezed.",
  },
  {
    bugName: "Zerg",
    id: "zerg-living-arrow",
    name: "Living Arrow",
    rarity: "rare",
    description: "A column of Zerg pinned in flight, points always forward.",
  },
  {
    bugName: "Mok",
    id: "mok-eyeless-antenna",
    name: "Eyeless Antenna",
    rarity: "rare",
    description: "Feathery antenna of a Mok, smells damp stone forever.",
  },
  {
    bugName: "Quill",
    id: "quill-spine-coronet",
    name: "Spine Coronet",
    rarity: "rare",
    description: "Tiny coronet woven from a year's worth of Quill spines.",
  },
  {
    bugName: "Snar",
    id: "snar-honey-cake-crumb",
    name: "Honey-Cake Crumb",
    rarity: "rare",
    description: "Crumb of honey-cake, kept in a Snar's grip even in death.",
  },
  {
    bugName: "Yenn",
    id: "yenn-quiet-forelimb",
    name: "Quiet Forelimb",
    rarity: "rare",
    description: "Translucent forelimb that owls reportedly will not eat.",
  },
  {
    bugName: "Drog",
    id: "drog-iron-black-yoke",
    name: "Iron-Black Yoke",
    rarity: "rare",
    description: "Miniature yoke from a Drog thimble-cart.",
  },
  {
    bugName: "Pip",
    id: "pip-mimic-acorn",
    name: "Mimic Acorn",
    rarity: "rare",
    description: "An acorn that's almost certainly a Pip. Almost.",
  },
  {
    bugName: "Hex",
    id: "hex-geometric-web-pattern",
    name: "Geometric Web-Pattern",
    rarity: "epic",
    description: "Pinned web that predicts weather, then predicts you.",
  },
  {
    bugName: "Slag",
    id: "slag-hardened-pulp-shell",
    name: "Hardened Pulp Shell",
    rarity: "rare",
    description: "Slag's chewed-pulp shell, dry and lit-able.",
  },
  {
    bugName: "Wisp",
    id: "wisp-held-breath-wing",
    name: "Held-Breath Wing",
    rarity: "rare",
    description: "A Wisp wing, thin as a held breath.",
  },
  {
    bugName: "Glob",
    id: "glob-memoryless-gel-strand",
    name: "Memoryless Gel Strand",
    rarity: "rare",
    description: "Strand of Glob with no memory of being a Glob.",
  },
  {
    bugName: "Ymir",
    id: "ymir-witnesss-red-ink",
    name: "Witness's Red Ink",
    rarity: "legendary",
    description: "The red ink the Veilwood archive uses to note Ymir sightings.",
  },
  {
    bugName: "Onyx",
    id: "onyx-onyx-cabochon",
    name: "Onyx Cabochon",
    rarity: "legendary",
    description: "A polished Onyx, never pinned through. Never to be pinned.",
  },

  // Emberforge
  {
    bugName: "Pesk",
    id: "pesk-cooling-crust-egg",
    name: "Cooling-Crust Egg",
    rarity: "rare",
    description: "Egg laid in a cooling lava crust by a Pesk.",
  },
  {
    bugName: "Tovl",
    id: "tovl-obsidian-foot",
    name: "Obsidian Foot",
    rarity: "rare",
    description: "A Tovl foot — a whole obsidian shard with a leg attached.",
  },
  {
    bugName: "Wend",
    id: "wend-soot-colorless-wing",
    name: "Soot-Colorless Wing",
    rarity: "rare",
    description: "A Wend wing — the colour of soot and nothing else.",
  },
  {
    bugName: "Squa",
    id: "squa-basalt-crusted-shell",
    name: "Basalt-Crusted Shell",
    rarity: "rare",
    description: "Squa shell that still looks like a pebble until it scuttles.",
  },
  {
    bugName: "Twil",
    id: "twil-apprentice-spark",
    name: "Apprentice Spark",
    rarity: "rare",
    description: "A Twil spark caught in the moment of being thrown.",
  },
  {
    bugName: "Glop",
    id: "glop-pumice-froth-trail",
    name: "Pumice-Froth Trail",
    rarity: "epic",
    description: "Section of Glop trail — Emberforge's oldest writing.",
  },
  {
    bugName: "Rune",
    id: "rune-etched-glyph-plate",
    name: "Etched Glyph-Plate",
    rarity: "epic",
    description: "Carapace plate from a Rune, glyphs still warm.",
  },
  {
    bugName: "Krug",
    id: "krug-bell-armor-plate",
    name: "Bell-Armor Plate",
    rarity: "epic",
    description: "Plate from a Krug, rings clean when struck.",
  },
  {
    bugName: "Smel",
    id: "smel-etched-brass-coin",
    name: "Etched Brass Coin",
    rarity: "rare",
    description: "Brass coin discoloured by a Smel's spit.",
  },
  {
    bugName: "Voth",
    id: "voth-smouldering-belly-coal",
    name: "Smouldering Belly-Coal",
    rarity: "rare",
    description: "A still-warm coal from inside a Voth.",
  },
  {
    bugName: "Krat",
    id: "krat-forge-road-glue",
    name: "Forge-Road Glue",
    rarity: "rare",
    description: "Phial of Krat-glue, still capable of holding a bridge.",
  },
  {
    bugName: "Bask",
    id: "bask-hearth-lintel-charm",
    name: "Hearth Lintel-Charm",
    rarity: "epic",
    description: "Carved Bask, blessed for a chimney that will never fail.",
  },
  {
    bugName: "Frot",
    id: "frot-pale-frot-snow",
    name: "Pale Frot-Snow",
    rarity: "rare",
    description: "Jar of pale Frot-mass — what rim children call snow.",
  },
  {
    bugName: "Glim",
    id: "glim-lucky-cricket-chirp",
    name: "Lucky Cricket-Chirp",
    rarity: "rare",
    description: "A Glim chirp, sealed in resin. Buys a clean smelt.",
  },
  {
    bugName: "Tarn",
    id: "tarn-initiation-scar",
    name: "Tarn Initiation Scar",
    rarity: "epic",
    description: "Strip of skin scarred by a Tarn — a deep-forge initiation.",
  },
  {
    bugName: "Rin",
    id: "rin-tomorrows-flame-wing",
    name: "Tomorrow's Flame Wing",
    rarity: "epic",
    description: "Rin wing that catches tomorrow's heat-shimmer.",
  },
  {
    bugName: "Soul",
    id: "soul-quiet-death-thread",
    name: "Quiet Death-Thread",
    rarity: "legendary",
    description: "A filament from a Soul, drawn at the death of a forge-fire.",
  },
  {
    bugName: "Drex",
    id: "drex-cliff-edge-marker",
    name: "Cliff-Edge Marker",
    rarity: "rare",
    description: "Drex tail-barb used by the rim cartographers as a pin.",
  },
  {
    bugName: "Vyne",
    id: "vyne-lava-diver-hide",
    name: "Lava-Diver Hide",
    rarity: "rare",
    description: "Strip of Vyne hide — woven into lava-diving gauntlets.",
  },
  {
    bugName: "Wirm",
    id: "wirm-round-tunnel-hole",
    name: "Round Tunnel-Hole",
    rarity: "rare",
    description: "A perfectly round disc of pumice cut from a Wirm tunnel.",
  },
  {
    bugName: "Yrex",
    id: "yrex-rivals-yrex-scale",
    name: "Rival's Yrex Scale",
    rarity: "rare",
    description: "Obsidian scale, given between rival smiths in respect.",
  },
  {
    bugName: "Zar",
    id: "zar-spark-trail-charm",
    name: "Spark-Trail Charm",
    rarity: "rare",
    description: "Trail-line of a Zar, set into bone for luck.",
  },
  {
    bugName: "Mox",
    id: "mox-cinder-line-hook",
    name: "Cinder-Line Hook",
    rarity: "rare",
    description: "Mox-claw hook — the rim's standard cinder-line tackle.",
  },
  {
    bugName: "Lirn",
    id: "lirn-stilt-god-filament",
    name: "Stilt-God Filament",
    rarity: "epic",
    description: "Heat-resistant filament from a Lirn leg.",
  },
  {
    bugName: "Vorm",
    id: "vorm-stolen-tool",
    name: "Vorm-Stolen Tool",
    rarity: "rare",
    description: "A small smith's tool a Vorm took, then dropped.",
  },

  // Tidehollow
  {
    bugName: "Ker",
    id: "ker-pulsing-cold-lantern",
    name: "Pulsing Cold-Lantern",
    rarity: "rare",
    description: "A Ker leg, still pulsing with cold bioluminescence.",
  },
  {
    bugName: "Nub",
    id: "nub-soft-eye-glow",
    name: "Soft Eye-Glow",
    rarity: "rare",
    description: "A Nub eye, kept in oil, lights a fishing line.",
  },
  {
    bugName: "Jerk",
    id: "jerk-spring-loaded-tail-coil",
    name: "Spring-Loaded Tail-Coil",
    rarity: "rare",
    description: "Coiled Jerk tail, snaps a fisher's net taut without warning.",
  },
  {
    bugName: "Quip",
    id: "quip-tide-omen-bristle",
    name: "Tide-Omen Bristle",
    rarity: "rare",
    description: "Bristle from a Quip, used by brine-priests to read tides.",
  },
  {
    bugName: "Reek",
    id: "reek-milky-cloud-vial",
    name: "Milky Reek-Cloud Vial",
    rarity: "rare",
    description: "A Reek's milky panic-cloud, sealed under cork.",
  },
  {
    bugName: "Krev",
    id: "krev-court-powder",
    name: "Krev Court-Powder",
    rarity: "rare",
    description: "Powder from ground Krev shells, used at the trench-courts.",
  },
  {
    bugName: "Yez",
    id: "yez-trench-kings-banner-thread",
    name: "Trench-King's Banner-Thread",
    rarity: "epic",
    description: "Sea-silk thread once woven into the trench-king's banner.",
  },
  {
    bugName: "Pog",
    id: "pog-calm-water-charm",
    name: "Calm-Water Charm",
    rarity: "rare",
    description: "A whole Pog, dried, said to calm a household's waters.",
  },
  {
    bugName: "Yob",
    id: "yob-silt-walkers-guide-trail",
    name: "Silt-Walker's Guide-Trail",
    rarity: "rare",
    description: "Faint Yob trail caught in resin, points the right way down.",
  },
  {
    bugName: "Yek",
    id: "yek-trench-whale-latch-hook",
    name: "Trench-Whale Latch-Hook",
    rarity: "rare",
    description: "A Yek hook pried off a trench whale by a priest-diver.",
  },
  {
    bugName: "Shun",
    id: "shun-brine-mourners-knot",
    name: "Brine-Mourner's Knot",
    rarity: "epic",
    description: "A Shun in its mourning-knot form, perfectly still.",
  },
  {
    bugName: "Spin",
    id: "spin-shell-coin",
    name: "Spin-Shell Coin",
    rarity: "epic",
    description: "Coin pressed from a Spin shell — currency of the lower hollows.",
  },
  {
    bugName: "Crux",
    id: "crux-floor-sigil",
    name: "Crux Floor-Sigil",
    rarity: "legendary",
    description: "A four-armed Crux, rotated to true north and pinned.",
  },
  {
    bugName: "Daxx",
    id: "daxx-apprentice-quill",
    name: "Apprentice Daxx Quill",
    rarity: "rare",
    description: "Venom-tipped Daxx quill, lifted barehanded as proof.",
  },
  {
    bugName: "Nim",
    id: "nim-synchronized-fin",
    name: "Synchronized Nim Fin",
    rarity: "rare",
    description: "A Nim fin that still ticks with its swarm's lost rhythm.",
  },
  {
    bugName: "Pirl",
    id: "pirl-empty-bead",
    name: "Empty Pirl Bead",
    rarity: "rare",
    description: "A perfect, perfectly empty Pirl bead. Worth a dowry slot.",
  },
  {
    bugName: "Mirk",
    id: "mirk-cove-vanishing-wing",
    name: "Cove Vanishing Wing",
    rarity: "rare",
    description: "Mirk wing — invisible in still water, faint here.",
  },
  {
    bugName: "Brel",
    id: "brel-slow-dancers-filament",
    name: "Slow-Dancer's Filament",
    rarity: "rare",
    description: "A Brel sting-filament, still drifting in slow circles.",
  },
  {
    bugName: "Korn",
    id: "korn-brine-altar-block",
    name: "Brine-Altar Block",
    rarity: "rare",
    description: "Korn shell, fits into a brine-altar tower without mortar.",
  },
  {
    bugName: "Rax",
    id: "rax-surgeons-blade",
    name: "Surgeon's Rax Blade",
    rarity: "rare",
    description: "Razor Rax fin, kept sharp by saltwater alone.",
  },
  {
    bugName: "Zlin",
    id: "zlin-paper-thin-plate",
    name: "Paper-Thin Zlin Plate",
    rarity: "rare",
    description: "A folded Zlin plate that slides under a stone of any size.",
  },
  {
    bugName: "Trog",
    id: "trog-lighthouse-companion",
    name: "Lighthouse Tide-Companion",
    rarity: "rare",
    description: "A Trog kept in a tin, companion to the loneliest tower.",
  },
  {
    bugName: "Ruk",
    id: "ruk-pincer-crest",
    name: "Crushing Pincer Crest",
    rarity: "epic",
    description: "Pincer crest of a Ruk, feared by the entire Hollow.",
  },
  {
    bugName: "Slik",
    id: "slik-mucous-net-slip",
    name: "Mucous Net-Slip",
    rarity: "rare",
    description: "Coil of Slik mucous, slips through any net cleanly.",
  },
  {
    bugName: "Bom",
    id: "bom-burst-vial",
    name: "Bom-Burst Vial",
    rarity: "rare",
    description: "A Bom-burst caught in a vial; pops if you shake it.",
  },

  // Voidspire
  {
    bugName: "Crun",
    id: "crun-star-born-shard",
    name: "Star-Born Shard",
    rarity: "rare",
    description: "Crystalline shard from a Crun — a bug born of broken stars.",
  },
  {
    bugName: "Dril",
    id: "dril-pale-metal-pigment",
    name: "Pale-Metal Pigment",
    rarity: "rare",
    description: "Vial of pale metal dust used to draw star-charts.",
  },
  {
    bugName: "Ekk",
    id: "ekk-constellation-eye",
    name: "Constellation Eye",
    rarity: "rare",
    description: "An Ekk eye still tuned to a constellation no one's seen.",
  },
  {
    bugName: "Fop",
    id: "fop-magnetism-tuft",
    name: "Magnetism-Tuft",
    rarity: "rare",
    description: "A Fop tuft that drifts toward whichever way is up.",
  },
  {
    bugName: "Gru",
    id: "gru-skyboat-ballast-stone",
    name: "Skyboat Ballast-Stone",
    rarity: "rare",
    description: "Gru shell mounted as ballast on a Voidspire skyboat keel.",
  },
  {
    bugName: "Hak",
    id: "hak-watchmakers-lintel-mark",
    name: "Watchmaker's Lintel-Mark",
    rarity: "rare",
    description: "Carved Hak from a watchmaker's lintel. Still ticks faintly.",
  },
  {
    bugName: "Imp",
    id: "imp-void-glitch-token",
    name: "Void-Glitch Token",
    rarity: "rare",
    description: "An Imp pressed into amber. Sometimes it's not there.",
  },
  {
    bugName: "Jux",
    id: "jux-folded-geometry-tail",
    name: "Folded-Geometry Tail",
    rarity: "rare",
    description: "A Jux tail folded paper-thin, used to measure local space.",
  },
  {
    bugName: "Lop",
    id: "lop-asymmetric-future-token",
    name: "Asymmetric Future-Token",
    rarity: "rare",
    description: "A Lop, dried, with one leg-pair still slightly larger.",
  },
  {
    bugName: "Murn",
    id: "murn-anti-forgetting-fur",
    name: "Anti-Forgetting Fur",
    rarity: "epic",
    description: "Tuft of Murn fur, woven into archivist cloaks.",
  },
  {
    bugName: "Olm",
    id: "olm-compass-antenna",
    name: "Compass Antenna",
    rarity: "rare",
    description: "Olm antenna in a small jar, never lost, never afraid.",
  },
  {
    bugName: "Pez",
    id: "pez-pressure-pop-carapace",
    name: "Pressure-Pop Carapace",
    rarity: "rare",
    description: "Pez carapace that fizzes audibly under low pressure.",
  },
  {
    bugName: "Quor",
    id: "quor-tutors-bite-mark",
    name: "Tutor's Bite-Mark",
    rarity: "rare",
    description: "Bite-shaped notch from a Quor — only on objects, not flesh.",
  },
  {
    bugName: "Ral",
    id: "ral-conversational-light-pulse",
    name: "Conversational Light-Pulse",
    rarity: "epic",
    description: "Light-glass with a Ral conversation captured inside it.",
  },
  {
    bugName: "Shu",
    id: "shu-felted-foot-pad",
    name: "Felted Foot-Pad",
    rarity: "rare",
    description: "Pad from a Shu foot, used to silence delicate instruments.",
  },
  {
    bugName: "Tym",
    id: "tym-second-beat-spring",
    name: "Second-Beat Spring",
    rarity: "epic",
    description: "Tym mainspring — keeps Voidspire's great clocks honest.",
  },
  {
    bugName: "Urz",
    id: "urz-vesper-resonator",
    name: "Vesper Resonator",
    rarity: "epic",
    description: "Hollow Urz shell that hums on its own at vespers.",
  },
  {
    bugName: "Wob",
    id: "wob-endurance-charm",
    name: "Endurance Charm",
    rarity: "rare",
    description: "Wob, dried; never first, but never not finishing.",
  },
  {
    bugName: "Xer",
    id: "xer-sky-tower-crossbeam",
    name: "Sky-Tower Crossbeam",
    rarity: "rare",
    description: "Crossbeam Xer shell, mounted on a sky-tower antenna.",
  },
  {
    bugName: "Yarl",
    id: "yarl-night-call-bell",
    name: "Yarl Night-Call Bell",
    rarity: "rare",
    description: "A small bell tuned to answer a Yarl call.",
  },
  {
    bugName: "Zob",
    id: "zob-lightning-trace-filament",
    name: "Lightning-Trace Filament",
    rarity: "rare",
    description: "A Zob trail captured in glass, never the same line twice.",
  },
  {
    bugName: "Brez",
    id: "brez-wing-shard",
    name: "Brez Wing-Shard",
    rarity: "rare",
    description: "Brez wing-shard, used to write on the most fragile pages.",
  },
  {
    bugName: "Drak",
    id: "drak-vapor-coil",
    name: "Drak Vapor-Coil",
    rarity: "legendary",
    description: "A Drak vapor-coil — the only bug Voidspire dragons fear.",
  },
  {
    bugName: "Klin",
    id: "klin-dawn-chime",
    name: "Dawn Chime",
    rarity: "rare",
    description: "A Klin joint chimes once at dawn, every dawn, here too.",
  },
  {
    bugName: "Pyx",
    id: "pyx-scent-bonded-shell",
    name: "Scent-Bonded Pyx Shell",
    rarity: "legendary",
    description: "Crystal Pyx shell bonded by scent — knows its owner.",
  },
];

const KINGDOM_SEEDS_BY_SLUG: Readonly<Record<BugKingdom, readonly ItemSeed[]>> =
  {
    veilwood: VEILWOOD_KINGDOM_SEEDS,
    emberforge: EMBERFORGE_KINGDOM_SEEDS,
    tidehollow: TIDEHOLLOW_KINGDOM_SEEDS,
    voidspire: VOIDSPIRE_KINGDOM_SEEDS,
  };

function buildItemDefinitions(): readonly ItemDefinition[] {
  const items: ItemDefinition[] = [];

  for (const seed of UNIVERSAL_SEEDS) {
    items.push({
      id: seed.id,
      name: seed.name,
      rarity: seed.rarity,
      source: { kind: "universal" },
      description: seed.description,
      sprite: placeholderSprite(seed.id),
    });
  }

  for (const kingdomSlug of Object.keys(KINGDOM_SEEDS_BY_SLUG) as BugKingdom[]) {
    for (const seed of KINGDOM_SEEDS_BY_SLUG[kingdomSlug]) {
      items.push({
        id: seed.id,
        name: seed.name,
        rarity: seed.rarity,
        source: { kind: "kingdom", kingdom: kingdomSlug },
        description: seed.description,
        sprite: placeholderSprite(seed.id),
      });
    }
  }

  for (const seed of ICONIC_SEEDS) {
    items.push({
      id: seed.id,
      name: seed.name,
      rarity: seed.rarity,
      source: { kind: "iconic", bugName: seed.bugName },
      description: seed.description,
      sprite: placeholderSprite(seed.id),
    });
  }

  return items;
}

export const ITEM_DEFINITIONS: readonly ItemDefinition[] =
  buildItemDefinitions();

const ITEM_DEFINITIONS_BY_ID: ReadonlyMap<string, ItemDefinition> = new Map(
  ITEM_DEFINITIONS.map((item) => [item.id, item]),
);

const ICONIC_BY_BUG_NAME: ReadonlyMap<string, ItemDefinition> = new Map(
  ITEM_DEFINITIONS.filter(
    (item): item is ItemDefinition & { source: { kind: "iconic"; bugName: string } } =>
      item.source.kind === "iconic",
  ).map((item) => [item.source.bugName, item]),
);

export function getItemDefinition(id: string): ItemDefinition | undefined {
  return ITEM_DEFINITIONS_BY_ID.get(id);
}

export function getUniversalItems(): readonly ItemDefinition[] {
  return ITEM_DEFINITIONS.filter((item) => item.source.kind === "universal");
}

export function getKingdomItems(
  kingdom: BugKingdom,
): readonly ItemDefinition[] {
  return ITEM_DEFINITIONS.filter(
    (item) =>
      item.source.kind === "kingdom" && item.source.kingdom === kingdom,
  );
}

export function getIconicItemsForKingdom(
  kingdom: BugKingdom,
): readonly ItemDefinition[] {
  const bugsInKingdom = new Set(
    BUG_DEFINITIONS.filter((bug) => bug.kingdom === kingdom).map(
      (bug) => bug.name,
    ),
  );
  return ITEM_DEFINITIONS.filter(
    (item) =>
      item.source.kind === "iconic" && bugsInKingdom.has(item.source.bugName),
  );
}

export function getIconicForBug(bugName: string): ItemDefinition | undefined {
  return ICONIC_BY_BUG_NAME.get(bugName);
}

export function getItemsByRarity(
  rarity: ItemRarity,
): readonly ItemDefinition[] {
  return ITEM_DEFINITIONS.filter((item) => item.rarity === rarity);
}

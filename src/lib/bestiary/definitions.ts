// Bestiary metadata: each bug name from the Rust BUG_NAME_LIBRARY
// (src-tauri/src/backend/workspace_metadata_settings/settings_runtime.rs:517)
// gets a kingdom, description (physical capabilities), and history (lore).
// Names are kept verbatim and in canonical order. The four kingdoms are
// deterministic quarters of the canonical list.

export type BugKingdom =
  | "veilwood"
  | "emberforge"
  | "tidehollow"
  | "voidspire";

export type BugDefinition = {
  name: string;
  kingdom: BugKingdom;
  description: string;
  history: string;
};

export type KingdomMeta = {
  slug: BugKingdom;
  label: string;
  tagline: string;
  badgeClassName: string;
  cardClassName: string;
  cardInnerBorderClassName: string;
  cardSubtitleClassName: string;
};

export const KINGDOMS: readonly KingdomMeta[] = [
  {
    slug: "veilwood",
    label: "Veilwood",
    tagline: "The mossback canopy",
    badgeClassName:
      "border-emerald-700 bg-emerald-900 text-emerald-50 [&>svg]:text-emerald-50 dark:border-emerald-700 dark:bg-emerald-900 dark:text-emerald-50 dark:[&>svg]:text-emerald-50",
    cardClassName: "border-emerald-700 bg-emerald-900 text-emerald-50",
    cardInnerBorderClassName: "border-emerald-400",
    cardSubtitleClassName: "text-emerald-200/80",
  },
  {
    slug: "emberforge",
    label: "Emberforge",
    tagline: "The cinder rim",
    badgeClassName:
      "border-amber-700 bg-amber-900 text-amber-50 [&>svg]:text-amber-50 dark:border-amber-700 dark:bg-amber-900 dark:text-amber-50 dark:[&>svg]:text-amber-50",
    cardClassName: "border-amber-700 bg-amber-900 text-amber-50",
    cardInnerBorderClassName: "border-amber-400",
    cardSubtitleClassName: "text-amber-200/80",
  },
  {
    slug: "tidehollow",
    label: "Tidehollow",
    tagline: "The brine trench",
    badgeClassName:
      "border-sky-700 bg-sky-900 text-sky-50 [&>svg]:text-sky-50 dark:border-sky-700 dark:bg-sky-900 dark:text-sky-50 dark:[&>svg]:text-sky-50",
    cardClassName: "border-sky-700 bg-sky-900 text-sky-50",
    cardInnerBorderClassName: "border-sky-400",
    cardSubtitleClassName: "text-sky-200/80",
  },
  {
    slug: "voidspire",
    label: "Voidspire",
    tagline: "The starlit reaches",
    badgeClassName:
      "border-violet-700 bg-violet-900 text-violet-50 [&>svg]:text-violet-50 dark:border-violet-700 dark:bg-violet-900 dark:text-violet-50 dark:[&>svg]:text-violet-50",
    cardClassName: "border-violet-700 bg-violet-900 text-violet-50",
    cardInnerBorderClassName: "border-violet-400",
    cardSubtitleClassName: "text-violet-200/80",
  },
] as const;

const KINGDOM_BY_SLUG: ReadonlyMap<BugKingdom, KingdomMeta> = new Map(
  KINGDOMS.map((kingdom) => [kingdom.slug, kingdom]),
);

export const BUG_DEFINITIONS: readonly BugDefinition[] = [
  // Kingdom: Veilwood (indices 0–24)
  {
    name: "Omen",
    kingdom: "veilwood",
    description:
      "Moss-furred crawler the size of a coin; razor mandibles fold flat against its head when it tunnels through rotting bark.",
    history:
      "First catalogued by the witch-cartographers of the Hollowfen, who named it for the chitter it makes seconds before a tree falls.",
  },
  {
    name: "Kirla",
    kingdom: "veilwood",
    description:
      "Slender eight-legged climber draped in lichen scales; can shed a leg and regrow it overnight beneath bracken.",
    history:
      "Said to be the first creature drawn on the bark-maps of the Veilwood druids, kept secret for a thousand seasons.",
  },
  {
    name: "Mern",
    kingdom: "veilwood",
    description:
      "Plump, slow-moving grub with translucent skin showing the sap it has eaten; bite paralyzes lesser leaves.",
    history:
      "Appears in lullabies sung to children of the canopy clans, always as the dreamer who forgot to wake.",
  },
  {
    name: "Kez",
    kingdom: "veilwood",
    description:
      "Knife-thin gnat with iridescent wings; flies in tight spirals to confuse predators in the fern-mist.",
    history:
      "Veilwood scouts learned to track Kez clouds to find safe water during the years of the Long Drought.",
  },
  {
    name: "Vex",
    kingdom: "veilwood",
    description:
      "Burrowing pillbug with armored back plates the color of wet oak; rolls into a perfect sphere when struck.",
    history:
      "Believed by some elders to be the leftover thoughts of dying trees, given small legs to wander.",
  },
  {
    name: "Drix",
    kingdom: "veilwood",
    description:
      "Fast jumping mite with hooked feet that grip moss like climbing irons; leaps four times its length.",
    history:
      "Once farmed by the Vinekeepers for the gold dust it leaves on flowers it visits at dawn.",
  },
  {
    name: "Nyx",
    kingdom: "veilwood",
    description:
      "Nocturnal moth-bug with wide eyes that catch starlight under the canopy; wings make no sound at all.",
    history:
      "The Veilwood mourners release one Nyx per soul lost, trusting it to carry the name to the moon.",
  },
  {
    name: "Skarn",
    kingdom: "veilwood",
    description:
      "Stout beetle with a spiked carapace and a single curved horn; wrestles rivals over mushroom stumps.",
    history:
      "The Skarn-jousts of the deep glade are still held every solstice by those who remember the rite.",
  },
  {
    name: "Glin",
    kingdom: "veilwood",
    description:
      "Tiny glow-worm whose tail emits a steady green light; clings to the underside of leaves at dusk.",
    history:
      "Lantern-makers of the canopy once captured Glin in glass jars to light their slow boats home.",
  },
  {
    name: "Thrax",
    kingdom: "veilwood",
    description:
      "Heavy-bodied centipede with bone-white legs; can curl around a finger and squeeze hard enough to bruise.",
    history:
      "Old Veilwood trappers say a Thrax appearing in your boot is a debt owed quietly to the forest.",
  },
  {
    name: "Korv",
    kingdom: "veilwood",
    description:
      "Sharp-jawed root-borer with a rasping tongue; chews through tubers thick as a wrist in a single night.",
    history:
      "Korv tracks were how the rootkeepers learned which crops would fail before the harvest came.",
  },
  {
    name: "Brak",
    kingdom: "veilwood",
    description:
      "Squat toad-bug with a bumpy hide and an inflatable throat sac that croaks at twilight.",
    history:
      "Brak-callers were once paid in fine salt to walk the Veilwood paths and answer back.",
  },
  {
    name: "Zerg",
    kingdom: "veilwood",
    description:
      "Swarming gnat that flies in tight columns and stings on contact; one bite is harmless, a hundred is not.",
    history:
      "Zerg pillars were once used as living arrows by the witch-priests to mark sinful trees.",
  },
  {
    name: "Mok",
    kingdom: "veilwood",
    description:
      "Pale, eyeless cave-grub with feathery antennae; navigates by scent of damp stone and old wood.",
    history:
      "Found only in the lower hollows, where the trees do not remember the name for the sun.",
  },
  {
    name: "Quill",
    kingdom: "veilwood",
    description:
      "Slender stick-bug covered in fine spines; flexes them outward when threatened by passing claws.",
    history:
      "The Quill is said to teach itself a new posture every year of its short and careful life.",
  },
  {
    name: "Snar",
    kingdom: "veilwood",
    description:
      "Bristly mossbug with sticky pads and a curled, prehensile tail used to grip wet bark.",
    history:
      "Veilwood children name their first Snar for a grandparent and feed it crumbs of honey-cake.",
  },
  {
    name: "Yenn",
    kingdom: "veilwood",
    description:
      "Slow-stepping mantis with translucent forelimbs; moves so quietly it can pass a sleeping fox.",
    history:
      "Said to be the only creature the Veilwood owls refuse to eat, for reasons never written down.",
  },
  {
    name: "Drog",
    kingdom: "veilwood",
    description:
      "Heavy-jawed beetle with iron-black shell; can drag twice its weight up a vertical trunk.",
    history:
      "Drog were once hitched to thimble-carts in the moss villages of the older canopy clans.",
  },
  {
    name: "Pip",
    kingdom: "veilwood",
    description:
      "Tiny seed-mimic that hides among acorns; springs onto a finger if disturbed by a careless hand.",
    history:
      "The Pip rite of the foragers' guild requires picking one without knowing it from a real seed.",
  },
  {
    name: "Hex",
    kingdom: "veilwood",
    description:
      "Six-legged spinner with milk-white web; weaves geometric shapes that dissolve before sunrise.",
    history:
      "Hex-readers studied the patterns to predict weather, until the patterns started predicting them.",
  },
  {
    name: "Slag",
    kingdom: "veilwood",
    description:
      "Fat, sluggish leaf-roller; coats itself in chewed pulp that hardens overnight into a thin shell.",
    history:
      "Slag carapaces are still used as tinder by the deep-forest charcoaler clans of the eastern reach.",
  },
  {
    name: "Wisp",
    kingdom: "veilwood",
    description:
      "Floating midge that drifts on warm updrafts under the boughs; wings as thin as a held breath.",
    history:
      "Veilwood lovers used to tie a Wisp to a thread and let it lead them to a chosen tree.",
  },
  {
    name: "Glob",
    kingdom: "veilwood",
    description:
      "Soft-bodied gel-worm that clings to wet bark; oozes through narrow cracks when alarmed.",
    history:
      "The Glob has no skeleton, and the Veilwood elders say neither does its memory.",
  },
  {
    name: "Ymir",
    kingdom: "veilwood",
    description:
      "Massive horned beetle the size of a child's fist; rare, slow, and said to be older than its years.",
    history:
      "The Veilwood archive calls Ymir the witness, and its sightings are noted in red ink.",
  },
  {
    name: "Onyx",
    kingdom: "veilwood",
    description:
      "Glossy black mossbug that sheens green in lantern-light; carapace is harder than walnut shell.",
    history:
      "Onyx are the only creature kept whole on the witch-cartographers' shelves, never pinned through.",
  },

  // Kingdom: Emberforge (indices 25–49)
  {
    name: "Pesk",
    kingdom: "emberforge",
    description:
      "Cinder-flecked sprite-bug with smouldering wing-veins; lays eggs in the crusts of cooling lava.",
    history:
      "The first Pesk swarm broke from the Forge-maw the year the magma-priests stopped sleeping.",
  },
  {
    name: "Tovl",
    kingdom: "emberforge",
    description:
      "Long-legged glass-walker; feet are shaped like obsidian shards and clatter sharply on stone.",
    history:
      "Tovl glass is collected from the cinder fields and sold as charm-stones in the rim markets.",
  },
  {
    name: "Wend",
    kingdom: "emberforge",
    description:
      "Smoke-bodied moth that nests deep inside fumaroles; wings the colorless color of fresh soot.",
    history:
      "Wend appearances mark the safe edge of an active vent, a knowledge older than the rim cities.",
  },
  {
    name: "Squa",
    kingdom: "emberforge",
    description:
      "Shellbug crusted with cooled basalt fragments; mistaken for pebbles until it suddenly scuttles.",
    history:
      "The Squa is the favored prey of the rim falconers, who train their birds with hot stones.",
  },
  {
    name: "Twil",
    kingdom: "emberforge",
    description:
      "Twin-tailed firemite that flicks sparks when frightened; the sparks rarely catch but always hiss.",
    history:
      "Old foundry songs speak of the Twil as the smith's apprentice that never grew up.",
  },
  {
    name: "Glop",
    kingdom: "emberforge",
    description:
      "Magma-skinned slug that leaves a glowing trail of pumice-froth; cools to grey by morning light.",
    history:
      "Glop trails are the oldest writing in Emberforge, recording paths walked centuries ago.",
  },
  {
    name: "Rune",
    kingdom: "emberforge",
    description:
      "Beetle whose carapace is etched with natural cracks resembling glyphs; varies bug to bug.",
    history:
      "The rune-readers tattoo their own skin to match the markings of a single Rune they catch.",
  },
  {
    name: "Krug",
    kingdom: "emberforge",
    description:
      "Heavy ironbug with a hide that rings when struck; can wedge itself in a vent and outlast a fire.",
    history:
      "Krug shells were once forged into the bell-armor of the magma-king's personal guard.",
  },
  {
    name: "Smel",
    kingdom: "emberforge",
    description:
      "Acid-spitter the size of a thumbnail; spray etches glass and discolors brass.",
    history:
      "Smel are the bane of the rim coiners, who must wash every tooled blank in slaked lime.",
  },
  {
    name: "Voth",
    kingdom: "emberforge",
    description:
      "Multi-legged pyro-centipede with a smouldering belly; runs along chimney walls hunting embers.",
    history:
      "Voth nest in old furnaces; a smith who finds one knows the furnace will run hot all winter.",
  },
  {
    name: "Krat",
    kingdom: "emberforge",
    description:
      "Spiked tunneler that burrows through ash; spits a binding glue that hardens in seconds.",
    history:
      "Krat-glue once held together the bridges of the Forge-roads before stone replaced the joins.",
  },
  {
    name: "Bask",
    kingdom: "emberforge",
    description:
      "Plate-shelled basalt-clinger that warms itself on lava-stones; slow, patient, unkillable in heat.",
    history:
      "Bask is the patron of the hearth-keepers, who carve its shape into every chimney lintel.",
  },
  {
    name: "Frot",
    kingdom: "emberforge",
    description:
      "Frothing fume-fly with two pairs of milky wings; emerges from steam vents in pale clouds.",
    history:
      "The Frot mass is what rim children call snow, since true snow has not fallen there in living memory.",
  },
  {
    name: "Glim",
    kingdom: "emberforge",
    description:
      "Bright-eyed cinder-cricket whose chirp warms the air a hand's-breadth around it.",
    history:
      "Glim song is a luck charm in the rim cities; one in your forge means a clean smelt that day.",
  },
  {
    name: "Tarn",
    kingdom: "emberforge",
    description:
      "Pitch-black firebug that blends with cooled slag; venomous bite leaves a small scar that never fades.",
    history:
      "Tarn marks are worn as initiation by the deep-forge guilds — badges of having survived the dark.",
  },
  {
    name: "Rin",
    kingdom: "emberforge",
    description:
      "Whisper-thin emberfly that catches light through translucent wings; flutters in heat shimmers.",
    history:
      "The Rin is sacred to the seer-smiths, who say it shows them the shape of tomorrow's flame.",
  },
  {
    name: "Soul",
    kingdom: "emberforge",
    description:
      "Dim-glowing ash-moth that hovers near the recently extinguished; named for its quiet stillness.",
    history:
      "The Soul appears at the death of a forge-fire, and the smiths bow before they relight.",
  },
  {
    name: "Drex",
    kingdom: "emberforge",
    description:
      "Six-eyed ridge-crawler with a barbed tail; perches on volcanic ridgelines waiting for prey.",
    history:
      "Drex are the unofficial markers of the rim cartographers, drawn at every cliff-edge on the maps.",
  },
  {
    name: "Vyne",
    kingdom: "emberforge",
    description:
      "Whip-fast firewhip with a red-banded body; coils around hot stones to absorb their heat.",
    history:
      "The Vyne is hunted for its hide, which is woven into the gauntlets of the lava-divers.",
  },
  {
    name: "Wirm",
    kingdom: "emberforge",
    description:
      "Worm-like cinderfeeder that tunnels through pumice; leaves perfectly round holes behind.",
    history:
      "Wirm tunnels were what first led the magma-priests to suspect the deep-forge had a floor.",
  },
  {
    name: "Yrex",
    kingdom: "emberforge",
    description:
      "Plated armorbug with overlapping scales of cooled obsidian; rolls into a wedge under attack.",
    history:
      "Yrex shells are the traditional gift between rival smiths — a sign of respect freely given.",
  },
  {
    name: "Zar",
    kingdom: "emberforge",
    description:
      "Spark-tailed gnat that flies in lazy spirals near vents; bite causes brief, harmless burning.",
    history:
      "Zar are the only insect Emberforge children may chase, since they cannot really be caught.",
  },
  {
    name: "Mox",
    kingdom: "emberforge",
    description:
      "Bristle-backed lavabug with wide claws; clings to vertical magma walls like a frog to glass.",
    history:
      "Mox claws are pried free and used as the standard hook for cinder-line fishing on the rim.",
  },
  {
    name: "Lirn",
    kingdom: "emberforge",
    description:
      "Tall, slender stilt-bug whose legs are heat-resistant black filaments; walks across cooling lava.",
    history:
      "Rim sailors say to spot a Lirn alone on the magma seas is to glimpse a quiet god of patience.",
  },
  {
    name: "Vorm",
    kingdom: "emberforge",
    description:
      "Coiled fume-eel of a bug; long body folds and unfolds through the cracks in basalt.",
    history:
      "Vorm are blamed for the disappearance of small tools in the deep forge, and rarely caught.",
  },

  // Kingdom: Tidehollow (indices 50–74)
  {
    name: "Ker",
    kingdom: "tidehollow",
    description:
      "Pale, gelatinous deep-bug with eight transparent legs; pulses faintly with cold bioluminescence.",
    history:
      "First seen by the brine-divers of the Hollow Trench, who returned to the surface with no other words.",
  },
  {
    name: "Nub",
    kingdom: "tidehollow",
    description:
      "Knobby cave-shrimpoid with stubby grasping claws; clings to underwater stone in pitch dark.",
    history:
      "Nub were once farmed by the lantern-fishers of the deep ledges for the soft glow of their eyes.",
  },
  {
    name: "Jerk",
    kingdom: "tidehollow",
    description:
      "Twitchy mantis-shrimp variant with a spring-loaded tail; uses bursts of motion to confuse prey.",
    history:
      "The Jerk is named in the deep tongue for the way it makes a fisher's net snap taut without warning.",
  },
  {
    name: "Quip",
    kingdom: "tidehollow",
    description:
      "Quick-finned skitterer that walks the seafloor on six bristled legs; small enough to hide in coral.",
    history:
      "Quip movement patterns are read by the brine-priests as omens of tide and salt yet to come.",
  },
  {
    name: "Reek",
    kingdom: "tidehollow",
    description:
      "Foul-smelling sponge-clinger that releases a milky cloud when threatened; the cloud lasts hours.",
    history:
      "Reek clouds are how the cave-divers know they are no longer alone in a flooded passage.",
  },
  {
    name: "Krev",
    kingdom: "tidehollow",
    description:
      "Translucent shell-creeper with razor mouthparts; scrapes algae from the throat of brine vents.",
    history:
      "Krev shells are dried and ground into the white powder used at the Hollow trench-courts.",
  },
  {
    name: "Yez",
    kingdom: "tidehollow",
    description:
      "Eel-bodied ribbon-bug that flickers with cold light when startled; swims in slow undulations.",
    history:
      "The Yez was once the standard of the trench-king, woven into a banner of sea-silk and bone.",
  },
  {
    name: "Pog",
    kingdom: "tidehollow",
    description:
      "Small, round-bellied filterfeeder with feathery gills; clings to driftwood in slow currents.",
    history:
      "Pog are kept as pets in the lower coral towns, said to bring calm waters to a household.",
  },
  {
    name: "Yob",
    kingdom: "tidehollow",
    description:
      "Rubbery armored worm with a flat head; tunnels through silt at depth without disturbance.",
    history:
      "Yob trails are the guide ropes of the silt-walkers — faint but unmistakable to a trained hand.",
  },
  {
    name: "Yek",
    kingdom: "tidehollow",
    description:
      "Hooked, hard-shelled latcher; attaches to the underside of larger creatures and refuses to let go.",
    history:
      "Yek are pried off the trench whales every spring; the priest-divers count them like rosaries.",
  },
  {
    name: "Shun",
    kingdom: "tidehollow",
    description:
      "Withdrawn anemone-like mover with curling fronds; pulls into a hard knot when touched.",
    history:
      "The Shun is the sigil of the brine-mourners, who bind themselves into knots during the dark season.",
  },
  {
    name: "Spin",
    kingdom: "tidehollow",
    description:
      "Tightly coiled spiral-shell crawler; unwinds itself across the seabed in slow, deliberate turns.",
    history:
      "Spin shells are the coinage of the lower-hollow traders, prized for being almost impossible to forge.",
  },
  {
    name: "Crux",
    kingdom: "tidehollow",
    description:
      "Cross-shaped sediment-walker with four perpendicular limbs; rotates slowly as it moves.",
    history:
      "The Crux walked the floor of the Hollow long before the brine-folk arrived, and watches them still.",
  },
  {
    name: "Daxx",
    kingdom: "tidehollow",
    description:
      "Spiny-backed bottom-feeder with venom-tipped quills; preferred prey of the trench rays.",
    history:
      "The Daxx is the test of an apprentice diver, who must lift one barehanded without flinching.",
  },
  {
    name: "Nim",
    kingdom: "tidehollow",
    description:
      "Tiny scuttling polyp with paddle-like fins; moves in synchronized swarms through the deep.",
    history:
      "Nim swarms are how the trench-musicians learn the timing of the great currents in winter.",
  },
  {
    name: "Pirl",
    kingdom: "tidehollow",
    description:
      "Pearled glass-bug that secretes a perfectly round bead each spring; the bead is empty inside.",
    history:
      "Pirl beads are the dowry of the brine-bride; her family must collect a hundred before the betrothal stands.",
  },
  {
    name: "Mirk",
    kingdom: "tidehollow",
    description:
      "Murky water-stinger with cloudy wings under the surface; vanishes in still water within seconds.",
    history:
      "Mirk are quietly blamed for the disappearance of unattended children in the lower coves.",
  },
  {
    name: "Brel",
    kingdom: "tidehollow",
    description:
      "Bell-shaped jellybug with hanging filaments that sting on contact; drifts in slow circles.",
    history:
      "The Brel is the patron of the Hollow's slow dancers, who imitate its turning at the long festivals.",
  },
  {
    name: "Korn",
    kingdom: "tidehollow",
    description:
      "Hard-shelled deep-walker with twin grasping arms; lives in silt-fields beyond the lantern-line.",
    history:
      "Korn shells are the building blocks of the brine-altar towers, stacked together without any mortar.",
  },
  {
    name: "Rax",
    kingdom: "tidehollow",
    description:
      "Razor-finned ribbon-skater that cuts through kelp; can sever a finger if mishandled.",
    history:
      "Rax fins are the blades of the Hollow's surgeon-divers, who keep them sharp by saltwater alone.",
  },
  {
    name: "Zlin",
    kingdom: "tidehollow",
    description:
      "Flat, plate-bodied bottom-skitterer; folds itself paper-thin to slip beneath stones.",
    history:
      "The Zlin is what the rock-readers of the lower hollows watch to know the floor is shifting.",
  },
  {
    name: "Trog",
    kingdom: "tidehollow",
    description:
      "Heavy, slow-moving cave-bug with grasping claws and blunted eyes; can outwait a tide.",
    history:
      "Trog are the lighthouse-keepers' companions in the Hollow's most isolated lantern-towers.",
  },
  {
    name: "Ruk",
    kingdom: "tidehollow",
    description:
      "Squat shell-cracker with crushing pincers; eats other crustaceans alive without ceremony.",
    history:
      "The Ruk is feared by every other bug of the Hollow, and respected by every diver who has touched one.",
  },
  {
    name: "Slik",
    kingdom: "tidehollow",
    description:
      "Slippery skin-coater with a mucous shell; slides through nets without tearing the weave.",
    history:
      "Slik are the despair of the trench-fishers, who name them in oaths and never in prayers.",
  },
  {
    name: "Bom",
    kingdom: "tidehollow",
    description:
      "Round-bodied detonator-bug that puffs out a burst of brine when threatened; the burst is harmless but sudden.",
    history:
      "The Bom-burst is the warning sign of the lower-hollow scouts, mimicked by their flute-calls.",
  },

  // Kingdom: Voidspire (indices 75–99)
  {
    name: "Crun",
    kingdom: "voidspire",
    description:
      "Crystalline shard-flier with translucent wings that refract starlight; barely whispers in flight.",
    history:
      "Crun are said to be born from broken stars, and the Voidspire seers count them as omens.",
  },
  {
    name: "Dril",
    kingdom: "voidspire",
    description:
      "Slim drill-headed boring-bug that tunnels through obsidian glass; produces a fine dust of pale metal.",
    history:
      "Dril dust is the pigment of the Voidspire star-charts, mixed with oil and applied with a single hair.",
  },
  {
    name: "Ekk",
    kingdom: "voidspire",
    description:
      "Six-eyed perch-bug with eyes that match the colors of the Voidspire planetarium; rarely blinks.",
    history:
      "The Ekk is said to dream of constellations it has not yet seen, and to wake when one finally appears.",
  },
  {
    name: "Fop",
    kingdom: "voidspire",
    description:
      "Featherweight floater that drifts on void-thermals; wings powered by stray magnetism.",
    history:
      "Fop flocks gather where the planetarium fields are warmest, and the priests bring them quiet offerings.",
  },
  {
    name: "Gru",
    kingdom: "voidspire",
    description:
      "Heavy-shelled gravity-bug that clings to the underside of platforms; immune to the Spire's thinner air.",
    history:
      "Gru are mounted on the keels of the Voidspire skyboats as ballast that thinks for itself.",
  },
  {
    name: "Hak",
    kingdom: "voidspire",
    description:
      "Sharp-jawed stargazer with a single forward eye; bites through wire and glass equally well.",
    history:
      "The Hak is the patron of the Voidspire watchmakers, depicted on every workshop's lintel.",
  },
  {
    name: "Imp",
    kingdom: "voidspire",
    description:
      "Tiny prankster-bug that flickers in and out of visibility; thought to be a kind of void-glitch.",
    history:
      "Voidspire children are warned against speaking too loudly to an Imp, lest it stop returning.",
  },
  {
    name: "Jux",
    kingdom: "voidspire",
    description:
      "Long-tailed glider with a body of folded paper-thin chitin; rides static currents in the dark.",
    history:
      "Jux gliders are how the Voidspire mathematicians measure the local geometry of the Spire's fields.",
  },
  {
    name: "Lop",
    kingdom: "voidspire",
    description:
      "Lopsided crawler with one larger pair of legs; moves in a strange, lurching arc across surfaces.",
    history:
      "The Lop is taken as a sign of asymmetric futures, and the Spire's seers debate its meaning monthly.",
  },
  {
    name: "Murn",
    kingdom: "voidspire",
    description:
      "Soft-furred dust-bug that gathers loose star-residue from the planetarium floor; purrs faintly.",
    history:
      "Murn-fur is woven into the cloaks of the Voidspire archivists, said to repel the act of forgetting.",
  },
  {
    name: "Olm",
    kingdom: "voidspire",
    description:
      "Eyeless feeler that navigates by gravity gradients alone; never lost, never afraid.",
    history:
      "The Olm is the Spire's compass, kept in small jars by every void-traveler before a long jump.",
  },
  {
    name: "Pez",
    kingdom: "voidspire",
    description:
      "Effervescent bubble-bug whose carapace fizzes in low pressure; pops audibly when disturbed.",
    history:
      "Pez popping is the soundtrack of the upper Spire's quiet halls — a kind of natural clock.",
  },
  {
    name: "Quor",
    kingdom: "voidspire",
    description:
      "Question-mark-shaped curlbug with a hooked head; bites only objects, never living flesh.",
    history:
      "The Quor is the tutor's mascot in the Voidspire schools, drawn on every primer's first page.",
  },
  {
    name: "Ral",
    kingdom: "voidspire",
    description:
      "Radiant winged-flicker that pulses light in answer to spoken words; semi-conversational.",
    history:
      "Ral-keepers spend years learning to interpret the patterns; the records are kept in light-glass.",
  },
  {
    name: "Shu",
    kingdom: "voidspire",
    description:
      "Quiet, padded crawler with felted feet; moves through observatories without disturbing instruments.",
    history:
      "The Shu is welcome in any Voidspire workshop, said to bring the clarity of held breath.",
  },
  {
    name: "Tym",
    kingdom: "voidspire",
    description:
      "Time-keeping ticker that pulses at exactly one beat per second; the rhythm slows in cold.",
    history:
      "Tym are wound into the great clocks of the Spire, replaced only at the death of their master.",
  },
  {
    name: "Urz",
    kingdom: "voidspire",
    description:
      "Hollow-shelled resonator that hums when stars align overhead; varies pitch with the seasons.",
    history:
      "Urz hum is the closing note of the Voidspire vespers, sung by no human voice in the chamber.",
  },
  {
    name: "Wob",
    kingdom: "voidspire",
    description:
      "Wobbling, fat-bodied driftbug with poor balance and excellent endurance.",
    history:
      "Wob are the long-distance runners of the Voidspire ant-races — slow, certain, and rarely first.",
  },
  {
    name: "Xer",
    kingdom: "voidspire",
    description:
      "Crossbeam-shelled sentinel-bug with a rigid posture; perches on antennas and waits for hours.",
    history:
      "The Xer is the void-watcher's familiar, and a sky-tower without one is considered unkept.",
  },
  {
    name: "Yarl",
    kingdom: "voidspire",
    description:
      "Yowling night-flier whose call carries for unreasonable distances; harmless and lonely.",
    history:
      "Yarl calls are catalogued by the Voidspire night-clerks, and answered with bell-tones from the towers.",
  },
  {
    name: "Zob",
    kingdom: "voidspire",
    description:
      "Zigzagging spark-bug that traces lightning paths through still air; never twice the same line.",
    history:
      "The Zob is what the Spire's storm-mages chase to learn the next path of the sky's anger.",
  },
  {
    name: "Brez",
    kingdom: "voidspire",
    description:
      "Brittle-winged ash-flake bug; wings shatter at a touch but regrow within a single night.",
    history:
      "Brez wing-shards are the writing-medium of the Voidspire's most fragile-papered archive.",
  },
  {
    name: "Drak",
    kingdom: "voidspire",
    description:
      "Dragon-coiled vapor-snake bug; thin body coils into knots and unties itself in the air.",
    history:
      "The Drak is the only bug the Voidspire dragons fear, and the dragons will not say why.",
  },
  {
    name: "Klin",
    kingdom: "voidspire",
    description:
      "Clinking metal-shelled bell-bug whose joints sound when it moves; a slow, soft, constant chime.",
    history:
      "Klin chimes are the sound of dawn in the upper Spire, where the sun is barely a rumor.",
  },
  {
    name: "Pyx",
    kingdom: "voidspire",
    description:
      "Tiny crystal-cased traveler-bug carried in pockets for luck; said to know its owner by smell.",
    history:
      "The Pyx is the last bug catalogued by the Voidspire archivists, and the first they tell newcomers about.",
  },
] as const;

export const BUG_DEFINITIONS_BY_NAME: ReadonlyMap<string, BugDefinition> =
  new Map(BUG_DEFINITIONS.map((definition) => [definition.name, definition]));

export function getBugDefinition(name: string): BugDefinition | undefined {
  return BUG_DEFINITIONS_BY_NAME.get(name);
}

export function getKingdom(slug: BugKingdom): KingdomMeta {
  const kingdom = KINGDOM_BY_SLUG.get(slug);
  if (!kingdom) {
    throw new Error(`Unknown bestiary kingdom: ${slug}`);
  }
  return kingdom;
}

export function getBugsByKingdom(slug: BugKingdom): readonly BugDefinition[] {
  return BUG_DEFINITIONS.filter((definition) => definition.kingdom === slug);
}

/**
 * First-100 roadmap (M19, Track B.14). 26 shipped rows are DERIVED from the
 * catalog (shippedSlots()); 74 planned slots fill every gap: the 5 unused
 * mechanics, the 4 unused modes, all 21 skills (2+ each), and every empty
 * world. Planning records only — M20 authors real content per slot.
 */
import {
  shippedSlots,
  slot,
  type RoadmapCoverage,
  type RoadmapSlot,
} from "./scale-roadmap";

const PLANNED: RoadmapSlot[] = [
  // keyboard-village (beginner onboarding) — 2 planned
  slot("home-row-sprint", "Home Row Sprint", "time-trial", "letter", "beginner", "keyboard-village", ["speed", "key-recognition"], "home-row", 14, "countdown", 45, "speed"),
  slot("alphabet-aegis", "Alphabet Aegis", "defense-shield", "letter", "beginner", "keyboard-village", ["defense", "letter-accuracy"], "alphabet-lower", 16, "countdown", 90, "survival"),
  // finger-forest (finger placement) — 5 planned
  slot("finger-trails", "Finger Trails", "sequence-build", "letter", "beginner", "finger-forest", ["finger-placement"], "home-row", 16, "countdown", 120, "standard"),
  slot("left-hand-lodge", "Left Hand Lodge", "target-press", "letter", "beginner", "finger-forest", ["finger-placement"], "alphabet-lower", 12, "countdown", 60, "standard"),
  slot("right-hand-ridge", "Right Hand Ridge", "falling-catch", "letter", "beginner", "finger-forest", ["finger-placement", "letter-accuracy"], "top-row", 18, "countdown", 60, "standard"),
  slot("pinky-peaks", "Pinky Peaks", "accuracy-trial", "letter", "beginner", "finger-forest", ["accuracy", "finger-placement"], "top-row", 12, "countdown", 60, "accuracy"),
  slot("bottom-row-bounty", "Bottom Row Bounty", "collection", "letter", "beginner", "finger-forest", ["collection", "key-recognition"], "home-row", 14, "countdown", 90, "standard"),
  // letter-valley — 3 planned
  slot("consonant-caverns", "Consonant Caverns", "survival-waves", "letter", "intermediate", "letter-valley", ["survival", "letter-accuracy"], "alphabet-lower", 20, "countup", undefined, "survival"),
  slot("case-cascade", "Case Cascade", "sequence-build", "letter", "intermediate", "letter-valley", ["capitalization", "finger-placement"], "alphabet-lower", 18, "untimed", undefined, "standard"),
  slot("symbol-sprouts", "Symbol Sprouts", "target-press", "symbol", "beginner", "letter-valley", ["symbols", "key-recognition"], "symbols", 10, "untimed", undefined, "standard"),
  // word-city — 5 planned
  slot("plural-plaza", "Plural Plaza", "sequence-build", "word", "beginner", "word-city", ["word-construction"], "beginner-words", 10, "countdown", 120, "standard"),
  slot("duel-debut", "Duel Debut", "duel-rounds", "word", "intermediate", "word-city", ["competitive-preparation", "word-reaction"], "common-words", 20, "countdown", 60, "speed"),
  slot("number-market", "Number Market", "falling-catch", "number", "beginner", "word-city", ["numbers", "word-reaction"], "numbers", 16, "countdown", 60, "standard"),
  slot("compound-crossing", "Compound Crossing", "sequence-build", "word", "intermediate", "word-city", ["word-construction", "mixed-input"], "common-words", 16, "countdown", 120, "standard"),
  slot("ghost-race-rue", "Ghost Race Rue", "race-checkpoints", "word", "beginner", "word-city", ["race", "word-reaction"], "beginner-words", 14, "countup", undefined, "standard"),
  // sentence-kingdom — 5 planned
  slot("comma-court", "Comma Court", "accuracy-trial", "sentence", "intermediate", "sentence-kingdom", ["punctuation", "accuracy"], "punctuated-sentences", 6, "countdown", 90, "accuracy"),
  slot("capital-coronation", "Capital Coronation", "sequence-build", "sentence", "intermediate", "sentence-kingdom", ["capitalization", "sentence-typing"], "capitalized-sentences", 5, "untimed", undefined, "standard"),
  slot("royal-relay", "Royal Relay", "relay-team", "sentence", "intermediate", "sentence-kingdom", ["competitive-preparation", "sentence-typing"], "short-sentences", 8, "countdown", 120, "clan-aggregate"),
  slot("decree-defense", "Decree Defense", "defense-shield", "sentence", "intermediate", "sentence-kingdom", ["defense", "sentence-typing"], "standard-sentences", 8, "countdown", 120, "survival"),
  slot("endless-chronicle", "Endless Chronicle", "endless", "sentence", "intermediate", "sentence-kingdom", ["endless-endurance", "sentence-typing"], "standard-sentences", 10, "countup", undefined, "survival"),
  // speed-arena — 5 planned
  slot("thirty-second-surge", "Thirty Second Surge", "time-trial", "mixed", "intermediate", "speed-arena", ["speed"], "common-words", 16, "countdown", 30, "speed"),
  slot("ghost-final", "Ghost Final", "duel-rounds", "mixed", "expert", "speed-arena", ["competitive-preparation", "speed"], "standard-sentences", 16, "countdown", 90, "speed"),
  slot("marathon-gate", "Marathon Gate", "endless", "mixed", "expert", "speed-arena", ["endless-endurance", "survival"], "common-words", 40, "countup", undefined, "survival"),
  slot("punctuation-prix", "Punctuation Prix", "race-checkpoints", "mixed", "intermediate", "speed-arena", ["punctuation", "race"], "punctuated-sentences", 10, "countdown", 90, "speed"),
  slot("number-grand-prix", "Number Grand Prix", "time-trial", "number", "intermediate", "speed-arena", ["numbers", "speed"], "numbers-extended", 24, "countdown", 60, "speed"),
  // sky-frontier — 4 planned
  slot("tailwind-time-trial", "Tailwind Time Trial", "time-trial", "word", "beginner", "sky-frontier", ["speed", "word-construction"], "beginner-words", 16, "countdown", 45, "speed"),
  slot("storm-survival", "Storm Survival", "survival-waves", "word", "intermediate", "sky-frontier", ["survival", "accuracy"], "common-words", 24, "countup", undefined, "survival"),
  slot("skydive-sprint", "Skydive Sprint", "escape-run", "word", "intermediate", "sky-frontier", ["escape", "speed"], "common-words", 20, "countup", undefined, "standard"),
  slot("constellation-spelling", "Constellation Spelling", "sequence-build", "word", "intermediate", "sky-frontier", ["word-construction", "accuracy"], "common-words", 18, "countdown", 120, "accuracy"),
  // jungle-escape — 4 planned
  slot("vine-swing-words", "Vine Swing Words", "race-checkpoints", "sentence", "beginner", "jungle-escape", ["race", "sentence-typing"], "short-sentences", 6, "countup", undefined, "standard"),
  slot("predator-pursuit", "Predator Pursuit", "escape-run", "mixed", "intermediate", "jungle-escape", ["escape", "survival"], "common-words", 24, "countup", undefined, "survival"),
  slot("waterfall-words", "Waterfall Words", "falling-catch", "sentence", "beginner", "jungle-escape", ["word-reaction", "sentence-typing"], "short-sentences", 10, "countdown", 60, "standard"),
  slot("jungle-night-survival", "Jungle Night Survival", "survival-waves", "sentence", "intermediate", "jungle-escape", ["survival", "sentence-typing"], "short-sentences", 12, "countup", undefined, "survival"),
  // desert-rally — 5 planned
  slot("dune-dash-qualifier", "Dune Dash Qualifier", "race-checkpoints", "word", "intermediate", "desert-rally", ["race", "competitive-preparation"], "common-words", 20, "countdown", 60, "speed"),
  slot("mirage-marathon", "Mirage Marathon", "endless", "word", "intermediate", "desert-rally", ["endless-endurance", "word-reaction"], "common-words", 30, "countup", undefined, "survival"),
  slot("oasis-accuracy", "Oasis Accuracy", "accuracy-trial", "word", "intermediate", "desert-rally", ["accuracy", "punctuation"], "common-words", 18, "countdown", 60, "accuracy"),
  slot("sandstorm-sprint", "Sandstorm Sprint", "time-trial", "sentence", "intermediate", "desert-rally", ["speed", "mixed-input"], "short-sentences", 10, "countdown", 60, "speed"),
  slot("sphinx-symbols", "Sphinx Symbols", "target-press", "symbol", "intermediate", "desert-rally", ["symbols", "accuracy"], "symbols-extended", 14, "countdown", 60, "accuracy"),
  // ocean-depths — 5 planned
  slot("pearl-press", "Pearl Press", "target-press", "mixed", "beginner", "ocean-depths", ["key-recognition", "mixed-input"], "beginner-words", 14, "untimed", undefined, "standard"),
  slot("depth-charge-defense", "Depth Charge Defense", "defense-shield", "mixed", "intermediate", "ocean-depths", ["defense", "survival"], "common-words", 20, "countdown", 120, "survival"),
  slot("tide-time-trial", "Tide Time Trial", "time-trial", "mixed", "beginner", "ocean-depths", ["speed"], "beginner-words", 16, "countdown", 45, "speed"),
  slot("abyss-endless", "Abyss Endless", "endless", "mixed", "intermediate", "ocean-depths", ["endless-endurance", "survival"], "common-words", 30, "countup", undefined, "survival"),
  slot("sonar-symbols", "Sonar Symbols", "falling-catch", "symbol", "intermediate", "ocean-depths", ["symbols", "word-reaction"], "symbols-extended", 16, "countdown", 60, "standard"),
  // arctic-pass — 5 planned
  slot("frost-flawless", "Frost Flawless", "accuracy-trial", "word", "expert", "arctic-pass", ["accuracy"], "common-words", 20, "countdown", 60, "accuracy"),
  slot("blizzard-battle", "Blizzard Battle", "boss-phased", "mixed", "expert", "arctic-pass", ["boss-preparation", "survival"], "standard-sentences", 20, "countdown", 180, "boss"),
  slot("glacier-glide", "Glacier Glide", "race-checkpoints", "mixed", "intermediate", "arctic-pass", ["race", "accuracy"], "common-words", 18, "countdown", 90, "speed"),
  slot("icebridge-endurance", "Icebridge Endurance", "survival-waves", "sentence", "expert", "arctic-pass", ["survival", "endless-endurance"], "standard-sentences", 16, "countup", undefined, "survival"),
  slot("snowflake-symbols", "Snowflake Symbols", "accuracy-trial", "symbol", "intermediate", "arctic-pass", ["symbols", "accuracy"], "symbols", 16, "countdown", 60, "accuracy"),
  // space-station — 4 planned
  slot("zero-g-numbers", "Zero G Numbers", "sequence-build", "number", "beginner", "space-station", ["numbers", "finger-placement"], "numbers", 14, "untimed", undefined, "standard"),
  slot("command-console", "Command Console", "target-press", "number", "intermediate", "space-station", ["numbers", "accuracy"], "numbers-extended", 18, "countdown", 60, "accuracy"),
  slot("satellite-sprint", "Satellite Sprint", "time-trial", "number", "expert", "space-station", ["numbers", "speed"], "numbers-extended", 30, "countdown", 90, "speed"),
  slot("reactor-relay", "Reactor Relay", "relay-team", "mixed", "intermediate", "space-station", ["boss-preparation", "mixed-input"], "standard-sentences", 12, "countdown", 120, "clan-aggregate"),
  // cyber-city — 5 planned
  slot("neon-numbers", "Neon Numbers", "falling-catch", "number", "intermediate", "cyber-city", ["numbers", "word-reaction"], "numbers-extended", 20, "countdown", 60, "standard"),
  slot("firewall-phases", "Firewall Phases", "boss-phased", "mixed", "intermediate", "cyber-city", ["boss-preparation", "mixed-input"], "common-words", 18, "countdown", 150, "boss"),
  slot("hackathon-heat", "Hackathon Heat", "time-trial", "word", "expert", "cyber-city", ["speed", "competitive-preparation"], "code-tokens", 24, "countdown", 60, "speed"),
  slot("cipher-symbols", "Cipher Symbols", "sequence-build", "symbol", "expert", "cyber-city", ["symbols", "accuracy"], "symbols-extended", 20, "untimed", undefined, "standard"),
  slot("ghost-in-the-grid", "Ghost in the Grid", "duel-rounds", "sentence", "expert", "cyber-city", ["competitive-preparation", "sentence-typing"], "standard-sentences", 12, "countdown", 60, "speed"),
  // volcano-zone — 4 planned
  slot("magma-moat", "Magma Moat", "defense-shield", "word", "intermediate", "volcano-zone", ["defense", "word-reaction"], "common-words", 18, "countdown", 120, "survival"),
  slot("eruption-escape", "Eruption Escape", "escape-run", "word", "expert", "volcano-zone", ["escape", "survival"], "common-words", 24, "countdown", 120, "standard"),
  slot("lava-laps", "Lava Laps", "race-checkpoints", "mixed", "intermediate", "volcano-zone", ["race", "endless-endurance"], "common-words", 22, "countdown", 120, "speed"),
  slot("cinder-survival", "Cinder Survival", "survival-waves", "mixed", "expert", "volcano-zone", ["survival"], "common-words", 36, "countup", undefined, "survival"),
  // castle-siege — 4 planned
  slot("gatehouse-guard", "Gatehouse Guard", "defense-shield", "mixed", "expert", "castle-siege", ["defense", "accuracy"], "standard-sentences", 16, "countdown", 150, "boss"),
  slot("siege-ladders", "Siege Ladders", "race-checkpoints", "sentence", "expert", "castle-siege", ["race", "competitive-preparation"], "standard-sentences", 10, "countdown", 90, "speed"),
  slot("trebuchet-targets", "Trebuchet Targets", "target-press", "sentence", "intermediate", "castle-siege", ["word-reaction", "sentence-typing"], "short-sentences", 12, "countdown", 60, "standard"),
  slot("boss-gate-brigade", "Boss Gate Brigade", "boss-phased", "sentence", "expert", "castle-siege", ["boss-preparation", "sentence-typing"], "standard-sentences", 14, "countdown", 180, "boss"),
  // grand-arena — 9 planned
  slot("champions-circuit", "Champions Circuit", "race-checkpoints", "mixed", "expert", "grand-arena", ["race", "competitive-preparation"], "standard-sentences", 20, "countdown", 120, "speed"),
  slot("grand-endless", "Grand Endless", "endless", "story", "expert", "grand-arena", ["endless-endurance", "mixed-input"], "story-chapters", 3, "countup", undefined, "survival"),
  slot("paragraph-pinnacle", "Paragraph Pinnacle", "time-trial", "paragraph", "expert", "grand-arena", ["sentence-typing", "speed"], "paragraphs-starter", 2, "countdown", 120, "speed"),
  slot("story-suzerain", "Story Suzerain", "escape-run", "story", "expert", "grand-arena", ["escape", "endless-endurance"], "story-chapters", 3, "countup", undefined, "standard"),
  slot("shortcut-showdown", "Shortcut Showdown", "time-trial", "shortcut", "expert", "grand-arena", ["key-recognition", "speed"], "shortcut-pro", 16, "countdown", 60, "speed"),
  slot("punctuation-throne", "Punctuation Throne", "accuracy-trial", "mixed", "expert", "grand-arena", ["punctuation", "accuracy"], "punctuated-sentences", 12, "countdown", 90, "accuracy"),
  slot("capital-crown", "Capital Crown", "sequence-build", "mixed", "expert", "grand-arena", ["capitalization", "mixed-input"], "capitalized-sentences", 8, "untimed", undefined, "standard"),
  slot("ultimate-duel", "Ultimate Duel", "duel-rounds", "mixed", "expert", "grand-arena", ["competitive-preparation", "boss-preparation"], "standard-sentences", 20, "countdown", 120, "boss"),
  slot("crown-of-keys", "Crown of Keys", "target-press", "shortcut", "expert", "grand-arena", ["key-recognition", "competitive-preparation"], "shortcut-pro", 14, "countdown", 75, "speed"),
];

/** Full first-100: shipped catalog + planned slots. */
export const ROADMAP_100: RoadmapSlot[] = [...shippedSlots(), ...PLANNED];

export const ROADMAP_100_COVERAGE: RoadmapCoverage = {
  minPerSkill: 2,
  requiredMechanics: [
    "target-press", "falling-catch", "sequence-build", "time-trial",
    "accuracy-trial", "survival-waves", "race-checkpoints", "defense-shield",
    "escape-run", "collection", "boss-phased", "duel-rounds", "endless",
    "relay-team",
  ],
  minPerMechanic: 2,
  requiredModes: ["letter", "word", "sentence", "number", "symbol", "mixed", "paragraph", "story", "shortcut"],
  minPerMode: 1,
  worldMin: 5,
  worldMax: 10,
};

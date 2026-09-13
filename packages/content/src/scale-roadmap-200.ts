/**
 * Full-200 roadmap (M19, Track B.15). ROADMAP_100 plus 100 second-hundred
 * slots: depth (expert variants, ranked ladders, boss gauntlets, seasonal
 * reskins-by-theme) rather than new breadth. Same soundness gates at the
 * 200 scale. Planning records only — zero M20 content created here.
 */
import { ROADMAP_100 } from "./scale-roadmap-100";
import {
  slot,
  type RoadmapCoverage,
  type RoadmapSlot,
} from "./scale-roadmap";

const SECOND_HUNDRED: RoadmapSlot[] = [
  // keyboard-village +6 (1 carried + 5 fresh)
  slot("shift-awakening", "Shift Awakening", "target-press", "shortcut", "beginner", "keyboard-village", ["key-recognition", "capitalization"], "shortcut-basics", 10, "untimed", undefined, "standard"),
  slot("spacebar-steppe", "Spacebar Steppe", "target-press", "letter", "beginner", "keyboard-village", ["key-recognition"], "home-row", 8, "countdown", 30, "standard"),
  slot("capslock-crossing", "Capslock Crossing", "sequence-build", "shortcut", "beginner", "keyboard-village", ["capitalization", "key-recognition"], "shortcut-basics", 8, "untimed", undefined, "standard"),
  slot("enter-avenue", "Enter Avenue", "falling-catch", "letter", "beginner", "keyboard-village", ["letter-accuracy"], "home-row", 16, "countdown", 45, "standard"),
  slot("village-vault-numbers", "Village Vault Numbers", "collection", "number", "beginner", "keyboard-village", ["numbers", "collection"], "numbers", 12, "untimed", undefined, "standard"),
  slot("sunrise-survival-drill", "Sunrise Survival Drill", "survival-waves", "letter", "beginner", "keyboard-village", ["survival", "letter-accuracy"], "alphabet-lower", 14, "countup", undefined, "survival"),
  // finger-forest +7 (1 carried + 6 fresh)
  slot("thumb-pace-escape", "Thumb Pace Escape", "escape-run", "letter", "beginner", "finger-forest", ["escape", "finger-placement"], "home-row", 16, "countup", undefined, "standard"),
  slot("middle-finger-meadow", "Middle Finger Meadow", "target-press", "letter", "beginner", "finger-forest", ["finger-placement"], "home-row", 10, "countdown", 45, "standard"),
  slot("ring-finger-rapids", "Ring Finger Rapids", "falling-catch", "letter", "beginner", "finger-forest", ["finger-placement"], "home-row", 20, "countdown", 75, "standard"),
  slot("index-isles", "Index Isles", "sequence-build", "letter", "beginner", "finger-forest", ["finger-placement", "letter-accuracy"], "alphabet-lower", 12, "untimed", undefined, "standard"),
  slot("hand-alternation-hollow", "Hand Alternation Hollow", "race-checkpoints", "letter", "beginner", "finger-forest", ["finger-placement", "race"], "top-row", 12, "countup", undefined, "standard"),
  slot("weak-finger-workshop", "Weak Finger Workshop", "accuracy-trial", "letter", "intermediate", "finger-forest", ["accuracy", "finger-placement"], "top-row", 14, "countdown", 75, "accuracy"),
  slot("forest-relay-rangers", "Forest Relay Rangers", "relay-team", "word", "beginner", "finger-forest", ["collection", "word-construction"], "beginner-words", 10, "countdown", 90, "clan-aggregate"),
  // letter-valley +6 (1 carried + 5 fresh)
  slot("vowel-voyage", "Vowel Voyage", "race-checkpoints", "letter", "beginner", "letter-valley", ["race", "letter-accuracy"], "alphabet-lower", 14, "countup", undefined, "standard"),
  slot("diphthong-dell", "Diphthong Dell", "sequence-build", "letter", "intermediate", "letter-valley", ["letter-accuracy", "word-construction"], "alphabet-lower", 22, "countdown", 150, "standard"),
  slot("valley-vault-symbols", "Valley Vault Symbols", "collection", "symbol", "beginner", "letter-valley", ["symbols", "collection"], "symbols", 12, "countdown", 60, "standard"),
  slot("echo-escape", "Echo Escape", "escape-run", "letter", "beginner", "letter-valley", ["escape", "letter-accuracy"], "top-row", 14, "countup", undefined, "standard"),
  slot("lookahead-lake", "Lookahead Lake", "target-press", "letter", "intermediate", "letter-valley", ["word-reaction", "letter-accuracy"], "alphabet-lower", 18, "countdown", 45, "speed"),
  slot("glyph-grove", "Glyph Grove", "target-press", "symbol", "beginner", "letter-valley", ["symbols", "key-recognition"], "symbols", 12, "countdown", 45, "standard"),
  // word-city +5 fresh
  slot("verb-vault", "Verb Vault", "falling-catch", "word", "intermediate", "word-city", ["word-construction", "word-reaction"], "common-words", 18, "countdown", 75, "standard"),
  slot("adjective-alley", "Adjective Alley", "collection", "word", "intermediate", "word-city", ["collection", "word-construction"], "common-words", 16, "countdown", 90, "standard"),
  slot("spelling-bee-boulevard", "Spelling Bee Boulevard", "accuracy-trial", "word", "beginner", "word-city", ["accuracy", "word-construction"], "beginner-words", 14, "countdown", 60, "accuracy"),
  slot("synonym-sprint", "Synonym Sprint", "time-trial", "word", "intermediate", "word-city", ["speed", "word-construction"], "common-words", 22, "countdown", 45, "speed"),
  slot("rematch-row", "Rematch Row", "duel-rounds", "word", "beginner", "word-city", ["competitive-preparation", "word-reaction"], "beginner-words", 12, "countdown", 45, "speed"),
  // sentence-kingdom +5 fresh
  slot("semicolon-sanctum", "Semicolon Sanctum", "accuracy-trial", "sentence", "beginner", "sentence-kingdom", ["punctuation", "sentence-typing"], "punctuated-sentences", 5, "countdown", 60, "accuracy"),
  slot("proclamation-process", "Proclamation Process", "sequence-build", "sentence", "beginner", "sentence-kingdom", ["sentence-typing", "capitalization"], "capitalized-sentences", 4, "untimed", undefined, "standard"),
  slot("jousting-judges", "Jousting Judges", "duel-rounds", "sentence", "intermediate", "sentence-kingdom", ["competitive-preparation", "sentence-typing"], "short-sentences", 8, "countdown", 60, "speed"),
  slot("moat-marathon", "Moat Marathon", "endless", "sentence", "beginner", "sentence-kingdom", ["endless-endurance", "sentence-typing"], "short-sentences", 6, "countup", undefined, "standard"),
  slot("herald-haste", "Herald Haste", "race-checkpoints", "sentence", "intermediate", "sentence-kingdom", ["race", "sentence-typing"], "capitalized-sentences", 6, "countdown", 75, "speed"),
  // speed-arena +5 fresh
  slot("photo-finish", "Photo Finish", "race-checkpoints", "word", "expert", "speed-arena", ["race", "competitive-preparation"], "common-words", 26, "countdown", 60, "speed"),
  slot("split-time-special", "Split Time Special", "time-trial", "mixed", "expert", "speed-arena", ["speed", "mixed-input"], "standard-sentences", 20, "countdown", 45, "speed"),
  slot("false-start-foul", "False Start Foul", "accuracy-trial", "mixed", "beginner", "speed-arena", ["accuracy", "speed"], "common-words", 12, "countdown", 45, "accuracy"),
  slot("anchor-leg-arena", "Anchor Leg Arena", "relay-team", "mixed", "expert", "speed-arena", ["competitive-preparation", "endless-endurance"], "standard-sentences", 16, "countdown", 150, "clan-aggregate"),
  slot("decathlon-dash", "Decathlon Dash", "time-trial", "mixed", "intermediate", "speed-arena", ["mixed-input", "endless-endurance"], "common-words", 28, "countdown", 180, "speed"),
  // sky-frontier +7 (1 carried + 6 fresh)
  slot("cloud-collection", "Cloud Collection", "collection", "word", "beginner", "sky-frontier", ["collection", "word-reaction"], "beginner-words", 14, "countdown", 90, "standard"),
  slot("nimbus-numbers", "Nimbus Numbers", "falling-catch", "number", "beginner", "sky-frontier", ["numbers"], "numbers", 14, "countdown", 45, "standard"),
  slot("jetstream-junta", "Jetstream Junta", "escape-run", "word", "beginner", "sky-frontier", ["escape", "word-reaction"], "beginner-words", 14, "countup", undefined, "standard"),
  slot("cirrus-construction", "Cirrus Construction", "sequence-build", "word", "beginner", "sky-frontier", ["word-construction"], "beginner-words", 12, "countdown", 90, "standard"),
  slot("thunderhead-trial", "Thunderhead Trial", "accuracy-trial", "word", "intermediate", "sky-frontier", ["accuracy", "survival"], "common-words", 22, "countdown", 75, "accuracy"),
  slot("stratosphere-sprint", "Stratosphere Sprint", "time-trial", "word", "expert", "sky-frontier", ["speed"], "common-words", 28, "countdown", 90, "speed"),
  slot("cumulonimbus-climb", "Cumulonimbus Climb", "survival-waves", "mixed", "expert", "sky-frontier", ["survival", "accuracy"], "standard-sentences", 28, "countup", undefined, "survival"),
  // jungle-escape +7 (1 carried + 6 fresh)
  slot("canopy-collection", "Canopy Collection", "collection", "mixed", "beginner", "jungle-escape", ["collection", "mixed-input"], "beginner-words", 16, "untimed", undefined, "standard"),
  slot("python-punctuation", "Python Punctuation", "falling-catch", "mixed", "intermediate", "jungle-escape", ["punctuation", "mixed-input"], "punctuated-sentences", 14, "countdown", 60, "standard"),
  slot("anaconda-accuracy", "Anaconda Accuracy", "accuracy-trial", "mixed", "intermediate", "jungle-escape", ["accuracy", "survival"], "common-words", 16, "countdown", 75, "accuracy"),
  slot("canopy-time-trial", "Canopy Time Trial", "time-trial", "sentence", "beginner", "jungle-escape", ["speed", "sentence-typing"], "short-sentences", 8, "countdown", 45, "speed"),
  slot("quicksand-relay", "Quicksand Relay", "relay-team", "mixed", "beginner", "jungle-escape", ["competitive-preparation", "collection"], "beginner-words", 14, "countdown", 120, "clan-aggregate"),
  slot("toucan-targets", "Toucan Targets", "target-press", "mixed", "intermediate", "jungle-escape", ["word-reaction", "mixed-input"], "common-words", 18, "countdown", 75, "standard"),
  slot("emergent-escape", "Emergent Escape", "escape-run", "sentence", "expert", "jungle-escape", ["escape", "survival"], "standard-sentences", 10, "countdown", 150, "survival"),
  // desert-rally +7 (1 carried + 6 fresh)
  slot("caravan-collection", "Caravan Collection", "collection", "sentence", "beginner", "desert-rally", ["collection", "sentence-typing"], "short-sentences", 8, "untimed", undefined, "standard"),
  slot("cactus-counting", "Cactus Counting", "sequence-build", "number", "intermediate", "desert-rally", ["numbers", "mixed-input"], "numbers", 18, "countdown", 120, "standard"),
  slot("dust-devil-duel", "Dust Devil Duel", "duel-rounds", "word", "intermediate", "desert-rally", ["competitive-preparation", "race"], "common-words", 22, "countdown", 75, "speed"),
  slot("nomad-numbers", "Nomad Numbers", "time-trial", "number", "beginner", "desert-rally", ["numbers", "speed"], "numbers", 18, "countdown", 45, "speed"),
  slot("pyramid-punctuation", "Pyramid Punctuation", "accuracy-trial", "sentence", "intermediate", "desert-rally", ["punctuation", "accuracy"], "punctuated-sentences", 8, "countdown", 75, "accuracy"),
  slot("scorpion-shield", "Scorpion Shield", "defense-shield", "word", "beginner", "desert-rally", ["defense", "word-reaction"], "beginner-words", 14, "countdown", 90, "survival"),
  slot("dune-sea-duel", "Dune Sea Duel", "duel-rounds", "mixed", "intermediate", "desert-rally", ["competitive-preparation", "race"], "common-words", 18, "countdown", 90, "speed"),
  // ocean-depths +7 (1 carried + 6 fresh)
  slot("coral-construction", "Coral Construction", "sequence-build", "mixed", "beginner", "ocean-depths", ["word-construction", "mixed-input"], "beginner-words", 12, "untimed", undefined, "standard"),
  slot("current-catch", "Current Catch", "falling-catch", "mixed", "beginner", "ocean-depths", ["mixed-input", "word-reaction"], "beginner-words", 14, "countdown", 45, "standard"),
  slot("whirlpool-words", "Whirlpool Words", "survival-waves", "mixed", "beginner", "ocean-depths", ["survival", "mixed-input"], "beginner-words", 20, "countup", undefined, "survival"),
  slot("lighthouse-letters", "Lighthouse Letters", "target-press", "letter", "intermediate", "ocean-depths", ["letter-accuracy", "accuracy"], "alphabet-lower", 16, "countdown", 75, "accuracy"),
  slot("tsunami-time-trial", "Tsunami Time Trial", "time-trial", "sentence", "beginner", "ocean-depths", ["speed"], "short-sentences", 8, "countdown", 60, "speed"),
  slot("kraken-phases", "Kraken Phases", "boss-phased", "mixed", "intermediate", "ocean-depths", ["boss-preparation", "survival"], "common-words", 22, "countdown", 180, "boss"),
  slot("hadal-hideout", "Hadal Hideout", "escape-run", "mixed", "expert", "ocean-depths", ["escape", "endless-endurance"], "standard-sentences", 18, "countdown", 150, "survival"),
  // arctic-pass +7 (1 carried + 6 fresh)
  slot("aurora-alphabet", "Aurora Alphabet", "falling-catch", "letter", "intermediate", "arctic-pass", ["letter-accuracy", "word-reaction"], "alphabet-lower", 22, "countdown", 60, "standard"),
  slot("permafrost-paragraphs", "Permafrost Paragraphs", "time-trial", "paragraph", "intermediate", "arctic-pass", ["sentence-typing", "mixed-input"], "paragraphs-starter", 2, "countdown", 90, "speed"),
  slot("sled-dog-sprint", "Sled Dog Sprint", "race-checkpoints", "sentence", "beginner", "arctic-pass", ["race", "escape"], "short-sentences", 8, "countdown", 60, "speed"),
  slot("frozen-fingering", "Frozen Fingering", "sequence-build", "letter", "expert", "arctic-pass", ["finger-placement", "accuracy"], "top-row", 20, "countdown", 150, "accuracy"),
  slot("whiteout-words", "Whiteout Words", "survival-waves", "mixed", "intermediate", "arctic-pass", ["survival", "accuracy"], "standard-sentences", 24, "countup", undefined, "survival"),
  slot("polar-press", "Polar Press", "target-press", "number", "beginner", "arctic-pass", ["numbers", "key-recognition"], "numbers", 12, "untimed", undefined, "standard"),
  slot("tundra-time-trial", "Tundra Time Trial", "time-trial", "mixed", "beginner", "arctic-pass", ["speed", "accuracy"], "common-words", 14, "countdown", 30, "speed"),
  // space-station +7 (1 carried + 6 fresh)
  slot("alien-artifacts", "Alien Artifacts", "collection", "symbol", "intermediate", "space-station", ["collection", "symbols"], "symbols", 16, "countdown", 90, "standard"),
  slot("lunar-letters", "Lunar Letters", "escape-run", "letter", "intermediate", "space-station", ["escape", "letter-accuracy"], "alphabet-lower", 20, "countdown", 90, "standard"),
  slot("meteor-mash", "Meteor Mash", "target-press", "mixed", "beginner", "space-station", ["word-reaction", "mixed-input"], "common-words", 12, "countdown", 60, "standard"),
  slot("orbit-operations", "Orbit Operations", "sequence-build", "mixed", "intermediate", "space-station", ["mixed-input", "numbers"], "numbers-extended", 16, "countdown", 120, "standard"),
  slot("black-hole-endless", "Black Hole Endless", "endless", "mixed", "beginner", "space-station", ["endless-endurance"], "beginner-words", 20, "countup", undefined, "standard"),
  slot("cosmonaut-capitals", "Cosmonaut Capitals", "accuracy-trial", "mixed", "intermediate", "space-station", ["capitalization", "accuracy"], "capitalized-sentences", 8, "countdown", 60, "accuracy"),
  slot("supernova-symbols", "Supernova Symbols", "sequence-build", "symbol", "intermediate", "space-station", ["symbols", "mixed-input"], "symbols-extended", 16, "untimed", undefined, "standard"),
  // cyber-city +6 fresh
  slot("packet-pursuit", "Packet Pursuit", "escape-run", "mixed", "intermediate", "cyber-city", ["escape", "mixed-input"], "code-tokens", 16, "countup", undefined, "standard"),
  slot("zero-day-defense", "Zero Day Defense", "defense-shield", "mixed", "intermediate", "cyber-city", ["defense", "accuracy"], "code-tokens", 18, "countdown", 150, "survival"),
  slot("mainframe-marathon", "Mainframe Marathon", "endless", "mixed", "intermediate", "cyber-city", ["endless-endurance", "mixed-input"], "code-tokens", 28, "countup", undefined, "survival"),
  slot("syntax-relay", "Syntax Relay", "relay-team", "mixed", "beginner", "cyber-city", ["mixed-input", "competitive-preparation"], "code-tokens", 14, "countdown", 120, "clan-aggregate"),
  slot("encryption-escape", "Encryption Escape", "escape-run", "symbol", "intermediate", "cyber-city", ["escape", "symbols"], "symbols-extended", 14, "countup", undefined, "standard"),
  slot("root-access-race", "Root Access Race", "race-checkpoints", "symbol", "expert", "cyber-city", ["race", "symbols"], "symbols-extended", 18, "countdown", 90, "speed"),
  // volcano-zone +7 (1 carried + 6 fresh)
  slot("obsidian-order", "Obsidian Order", "sequence-build", "mixed", "intermediate", "volcano-zone", ["mixed-input", "accuracy"], "common-words", 20, "countdown", 120, "accuracy"),
  slot("ember-endless", "Ember Endless", "endless", "word", "beginner", "volcano-zone", ["endless-endurance", "word-reaction"], "beginner-words", 18, "countup", undefined, "standard"),
  slot("basalt-battle", "Basalt Battle", "boss-phased", "word", "expert", "volcano-zone", ["boss-preparation", "word-reaction"], "common-words", 22, "countdown", 150, "boss"),
  slot("pyro-paragraphs", "Pyro Paragraphs", "accuracy-trial", "paragraph", "intermediate", "volcano-zone", ["punctuation", "sentence-typing"], "paragraphs-starter", 2, "countdown", 90, "accuracy"),
  slot("caldera-countdown", "Caldera Countdown", "time-trial", "word", "beginner", "volcano-zone", ["speed"], "beginner-words", 14, "countdown", 30, "speed"),
  slot("sulfur-shield", "Sulfur Shield", "defense-shield", "sentence", "beginner", "volcano-zone", ["defense", "sentence-typing"], "short-sentences", 6, "countdown", 90, "survival"),
  slot("phoenix-phases", "Phoenix Phases", "boss-phased", "mixed", "expert", "volcano-zone", ["boss-preparation", "endless-endurance"], "standard-sentences", 24, "countdown", 210, "boss"),
  // castle-siege +7 (1 carried + 6 fresh)
  slot("war-horn-words", "War Horn Words", "falling-catch", "mixed", "intermediate", "castle-siege", ["mixed-input", "word-reaction"], "common-words", 20, "countdown", 75, "standard"),
  slot("battering-ram-race", "Battering Ram Race", "race-checkpoints", "mixed", "beginner", "castle-siege", ["race", "competitive-preparation"], "beginner-words", 16, "countdown", 60, "speed"),
  slot("archer-accuracy", "Archer Accuracy", "accuracy-trial", "sentence", "beginner", "castle-siege", ["accuracy", "sentence-typing"], "short-sentences", 6, "countdown", 45, "accuracy"),
  slot("catapult-construction", "Catapult Construction", "sequence-build", "sentence", "expert", "castle-siege", ["sentence-typing", "word-construction"], "standard-sentences", 10, "countdown", 150, "standard"),
  slot("portcullis-press", "Portcullis Press", "target-press", "mixed", "expert", "castle-siege", ["accuracy", "mixed-input"], "standard-sentences", 16, "countdown", 90, "accuracy"),
  slot("siege-story", "Siege Story", "endless", "story", "intermediate", "castle-siege", ["endless-endurance", "sentence-typing"], "story-chapters", 2, "countup", undefined, "survival"),
  slot("moat-monsters", "Moat Monsters", "survival-waves", "sentence", "beginner", "castle-siege", ["survival", "sentence-typing"], "short-sentences", 8, "countup", undefined, "survival"),
  // grand-arena +4 fresh
  slot("invitational-duel", "Invitational Duel", "duel-rounds", "mixed", "intermediate", "grand-arena", ["competitive-preparation"], "common-words", 18, "countdown", 75, "speed"),
  slot("hall-of-fame-endless", "Hall of Fame Endless", "endless", "mixed", "expert", "grand-arena", ["endless-endurance", "competitive-preparation"], "standard-sentences", 32, "countup", undefined, "boss"),
  slot("grand-punctuation", "Grand Punctuation", "time-trial", "mixed", "expert", "grand-arena", ["punctuation", "speed"], "punctuated-sentences", 16, "countdown", 75, "speed"),
  slot("coronation-caps", "Coronation Caps", "accuracy-trial", "sentence", "expert", "grand-arena", ["capitalization", "accuracy"], "capitalized-sentences", 8, "countdown", 75, "accuracy"),
];

/** Full 200-game plan: first hundred + second hundred. */
export const ROADMAP_200: RoadmapSlot[] = [...ROADMAP_100, ...SECOND_HUNDRED];

export const ROADMAP_200_COVERAGE: RoadmapCoverage = {
  minPerSkill: 4,
  requiredMechanics: [
    "target-press", "falling-catch", "sequence-build", "time-trial",
    "accuracy-trial", "survival-waves", "race-checkpoints", "defense-shield",
    "escape-run", "collection", "boss-phased", "duel-rounds", "endless",
    "relay-team",
  ],
  minPerMechanic: 6,
  requiredModes: ["letter", "word", "sentence", "number", "symbol", "mixed", "paragraph", "story", "shortcut"],
  minPerMode: 3,
  worldMin: 12,
  worldMax: 14,
};

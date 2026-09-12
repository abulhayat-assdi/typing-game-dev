# Skill Model (M15)

Interpretable dimensions only — there is deliberately no single
opaque "skill score".

## Dimensions (`learner_skill_dimensions`)

Performance: `accuracy`, `wpm`, `consistency` (inverted variation),
`completion`, `error_rate`. Input classes: `input_letters`,
`input_words`, `input_sentences`, `input_numbers`,
`input_punctuation`, `input_capitalization`, `input_symbols`,
`input_mixed`. Mechanics: `mech_reaction`, `mech_race`,
`mech_survival`, `mech_sentence`, `mech_word`, `mech_mixed`.

Values are recency-ordered means over the last 50 samples with
evidence counts; the UI shows the value, never a diagnosis.

## Key-level analysis (`adaptive_key_stats`)

One exposure per prompt char, errors on mismatches. States with
configurable cutoffs (`ALGO_CONFIG.keyCutoffs`, default
98/95/90/80):

- MASTERED / STRONG / NORMAL / WEAK / CRITICAL — only at
  `minKeyExposures` (default 20) observations;
- INSUFFICIENT below that. No weakness is ever claimed without
  evidence; the UI says "collecting data".

## Finger analysis (`adaptive_finger_stats`)

Standard QWERTY map (`adaptive_finger_for`, mirrored in TS
`fingerFor`), re-derived from key stats on every refresh — finger
weakness always traces to key evidence. Powers finger-focused drill
recommendations (`WEAK_FINGER`).

## Error patterns (`adaptive_error_pairs`)

Position-wise (expected → actual) substitutions, classified
data-driven: `letter_confusion` (O/P, I/O, C/V emerge from counts),
`capitalization` (Shift errors), `punctuation`, `number_row`,
`space`, `symbol`, `other`. A pair becomes a pattern at
`minPairCount` (default 3) observations. Nothing is hard-coded per
student.

## Weakness score

```
weakness = errorRate × recurrence × confidence × relevance
```

- `errorRate` = errors / exposures.
- `recurrence` = min(1, samples / 8) — across-attempt repetition.
- `confidence` = min(1, exposures / 50) — evidence depth.
- `relevance` = prompt-kind fit for the target (documented per row).

Materialized in `adaptive_weaknesses` with score, confidence,
evidence, last-observed, and trend (keys/fingers inherit the
accuracy trend; dimensions carry their own metric trend).

## Trends (`adaptive_skill_trends`)

Recent-10 median vs prior-40 median per metric (accuracy ±1.5, wpm
±2, error-rate ±1.5), minimum 5 samples per side else `insufficient`.
Medians — not means — so one anomalous attempt never flips a trend.
States: improving / stable / declining / insufficient.

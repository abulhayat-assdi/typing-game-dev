# Game Engine (M4)

`@tap/game-engine` — UI-free typing/game foundation. Never imports UI, the
database, or the network. Three separations are load-bearing:

| Module | Owns | Never touches |
|---|---|---|
| `types` + `definition` | `GameDefinition` schema + structural validation | any game content |
| `typing` | keystroke state machine + server diff | React/DOM/timers |
| `lifecycle` | attempt state machine | persistence |
| `validation` | server-side plausibility checks | `@tap/scoring` (independent re-derivation) |

## Game definitions

One JSON-shaped `GameDefinition` (id, slug, localized title/description,
world, category, mechanic, mode, difficulty, skill bands, prompt source,
input/timing rules, scoring profile id, unlock rule tree, attempt rules,
theme refs, mechanic `config`, competition flag, active flag, version)
describes a game. 14 mechanics × 9 modes cover the 245-game roadmap;
`validateGameDefinition()` rejects malformed rows before they reach clients
or the database.

## Typing engine

`createTypingSession(expected, { caseSensitive, allowBackspace })` tracks
typed text, cursor (implicit), correct/incorrect positions, cumulative error
strokes, backspace corrections, combo/maxCombo, frozen elapsed time and word
completion — O(1) amortized per keystroke, no keystroke leaves the device.
`snapshot()` emits the single summary submitted per attempt. Out-of-order
timestamps clamp; overlong/invalid keys reject.

`diffExpected(expected, typed)` is the server counterpart: position-wise
recompute so client-claimed correct/incorrect counts are never trusted.

## Lifecycle

`created → started → in_progress → submitted → validating → validated`
(`rejected` from submitted/validating; `abandoned`/`expired` interrupt).
`canTransition()` is consulted by routes, SQL functions and tests alike.

## Extension points

New mechanic: add the union member + renderer mapping (later milestone) —
no engine change. New unlock condition: extend `UnlockCondition` +
`checkUnlock`. New validation check: extend `validateSubmission` +
document the reason code.

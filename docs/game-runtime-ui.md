# Game Runtime UI (M6)

One shell for every game: `GamePlayer` + `PlayExperience` + `ResultScreen`.
No per-game pages — definitions configure the shell (title, timing, HUD).

## Runtime integration (client ↔ M4/M5 backend)

1. `PlayButton` POSTs `start` → `{ attemptId, expectedText, expiresAt }`.
2. Play page (server) re-loads the attempt (ownership enforced) and mounts
   `GamePlayer` with the server snapshot.
3. Typing runs locally in `createTypingSession` (refs, not global state;
   one local re-render per keystroke, zero network).
4. Completion/expiry triggers ONE submit: `{ typedText, elapsedMs,
   corrections, errorStrokes }` from the session snapshot.
5. Server recomputes, validates, finalizes, progresses; the response is the
   ONLY result source. Rejected/expired/409 paths render honest states —
   the client never invents numbers.
6. `PlayExperience` fetches `records` once for the personal-best flag, then
   renders `ResultScreen` (server numbers + owned run stats only).

## Shell features

Per-definition HUD (timer/WPM/accuracy/combo/progress), pause on untimed
games, local restart (pre-submit only), hidden-input capture (physical +
virtual keyboards; autocorrect off), focus overlay, next-key hint, countdown
auto-submit (display clock; server expiry authoritative).

## Performance / a11y

High-frequency state stays in refs; renders are local to the player tree.
Screen readers get phase/result announcements via a single polite live
region — per-character updates are plain text (never live). Reduced motion
disables count-up animations; nothing ever blocks the input.

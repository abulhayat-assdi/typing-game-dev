# Adaptive Difficulty (M15)

Difficulty adapts per learner per game as a **runtime layer**
(`adaptive_game_difficulty`) — global game definitions and
`difficulty_profiles` are never modified.

## Bands

Overall practice band from level (`bandFor`, mirrored in SQL):
beginner by default; intermediate at 85%+ accuracy or 25+ WPM;
expert at 90%+ with 95%+ accuracy or 50+ WPM. Band drives
beginner/intermediate/expert experiences:

- Beginners: short prompts, home-row alphabets, high-success,
  frequent positive feedback.
- Intermediate: mixed words, sentences, punctuation, speed
  challenges, error-specific drills, time pressure.
- Experts: high WPM targets, low-error constraints, long passages,
  symbols/numbers, endurance, competitive preparation.

## Per-game adaptation (`decideDifficulty`)

Last-3 form on the game vs the band's `difficulty_profiles` target:

- **increase** when accuracy ≥ target+2 AND wpm ≥ target across the
  whole window;
- **decrease** when accuracy < 80 across the window;
- **maintain** otherwise; clamped to beginner..expert.

Form is judged against the game's own current band (beginner until
played) so strong overall targets can't freeze a game at its rung.
Runtime params scale prompt lengths and WPM targets (0.8/1.0/1.25);
accuracy targets stay within 50..99.

## Consumption

`fn_get_adaptive_summary` serves each game's band + runtime params;
the recommended launch passes the adaptive difficulty string into
the unchanged `fn_start_attempt` flow. No second difficulty system.

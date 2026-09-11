# PHASE 2 — ADVANCED ADAPTIVE LEARNING, SOCIAL PLAY & REWARDED EXPERIENCES

Phase 2 is built on the same architecture as Phase 1. No duplicate student identity system, XP system or leaderboard system is allowed.

## 1. Phase 2 Goals

1. Make the platform deeply adaptive.
2. Add advanced game mechanics.
3. Add clan cooperation.
4. Add clan help and resource systems.
5. Add boss battles.
6. Add advanced competitions.
7. Introduce carefully controlled rewarded-ad experiences.
8. Add richer personalization and analytics.

## 2. Adaptive Learning Engine

The system maintains a learner skill vector:
- WPM
- accuracy
- error rate
- corrected-error ratio
- finger weakness
- key weakness
- punctuation weakness
- number weakness
- consistency
- fatigue proxy
- preferred challenge style

### Weakness Detection

Example:
If the learner repeatedly makes errors with:
- `O/P`
- `I/O`
- `C/V`
- `Shift + letter`
then generate a targeted practice queue.

The learner never needs to manually find weaknesses.

### Recommendation Score

`recommendation_score = skill_gap * confidence * relevance * freshness`

Recommendations should rotate so a player does not receive the same game forever.

## 3. Clan Model

In Phase 2, every active batch may have:
- Clan identity
- Clan name
- Motto
- Banner
- Avatar
- Leader
- Co-leaders
- Members
- Clan XP
- Clan level
- Clan inventory

Do not allow direct student-to-student XP editing. Use server-controlled support transactions.

## 4. Clan Help

A player may request help for an unlock.

Instead of unrestricted XP transfer:
- teammate receives a Help Request
- eligible teammate spends a configurable support token/coin
- system grants a bounded assist amount
- daily/monthly help limits apply
- all transactions are logged

This prevents XP inflation and farming.

## 5. Clan Missions

Examples:
- 10,000 combined typed characters
- 500 combined completed words
- 90% average accuracy
- 2-hour clan speed target

Clan missions grant:
- clan XP
- personal XP
- coins
- cosmetics
- badges

## 6. Clan Boss System

Boss has:
- HP
- phases
- mechanics
- difficulty
- deadline

Individual attempts reduce boss HP based on validated score.

Bosses can include:
- combo phases
- accuracy phases
- speed phases
- sentence phases
- number/symbol phases

## 7. Advanced Competition Engine

Competition modes:
- Time attack
- Score attack
- Accuracy attack
- WPM attack
- Survival
- Relay
- Elimination
- Best-of-three
- Multi-stage
- Team aggregate
- Swiss-style
- Knockout bracket

Admin controls:
- eligible batches
- eligible skill bands
- game pool
- start/end time
- attempts
- score formula
- tie breaker
- rewards
- announcement
- visibility

## 8. Rewarded Ads

### Policy/Safety Architecture

Use only Google-supported rewarded ad products and only where the account/product is eligible.

Google's current rewarded-ad rules require user opt-in for rewarded ads (except the specified rewarded interstitial behavior), prohibit direct monetary rewards, require rewards to remain within the publisher platform and non-transferable, and require the promised reward to be delivered after the required action. citeturn148943search5

Google Ad Manager currently documents rewarded ads for web pages and an Offerwall rewarded-ad choice. citeturn148943search0turn148943search4

### Product rule

The ad must be:
- optional
- explicitly user initiated
- never disguised
- never required to use the platform
- never awarded as cash
- limited by cooldown/frequency controls
- logged as an immutable reward event

Potential reward:
- temporary extra life
- retry token
- cosmetic token
- non-transferable platform points
- approved streak recovery token

Do NOT hard-code a rule like “miss one day = exactly two ads.” Make the recovery system configurable and subject to Google policy/product eligibility.

## 9. Rewarded-Ad Flow

`Offer shown → user accepts → ad completes → server verifies event → reward ledger entry → reward applied`

Never:
`page opened → ad auto-plays → reward automatically appears`

The server must be the source of truth for reward issuance.

## 10. Phase 2 Game Catalogue

001. **Letter Storm** — advanced letter accuracy under pressure.
002. **Key Lightning** — react to rapidly changing key targets.
003. **Friction Keys** — master commonly confused key pairs.
004. **Precision Grid** — accuracy grid with shrinking targets.
005. **Finger Circuit** — multi-finger routing challenge.
006. **Finger Relay** — switch finger groups without breaking combo.
007. **Keyboard Reflex** — rapid reaction key challenge.
008. **Reflex Tunnel** — continuous high-speed key reactions.
009. **Word Blitz** — high-speed word bursts.
010. **Word Sniper** — hit exact words among decoys.
011. **Word Phantom** — identify subtle target-word differences.
012. **Word Hacker** — decode and type word patterns.
013. **Word Reactor** — correctly type before a meter overloads.
014. **Word Conveyor** — process words on an accelerating conveyor.
015. **Word Fortress** — defend a fortress using word accuracy.
016. **Word Pirates** — capture ships with fast word typing.
017. **Word Raiders** — raid treasure with accurate word chains.
018. **Word Samurai** — precision word strikes.
019. **Word Dragon** — defeat a dragon through word combos.
020. **Word Wizard** — cast spells using exact words.
021. **Sentence Blitz** — rapid sentence bursts.
022. **Sentence Sniper** — precision sentences with decoys.
023. **Sentence Hacker** — restore corrupted sentences.
024. **Sentence Pilot** — navigate flight paths using sentences.
025. **Sentence Racer** — race with sentence checkpoints.
026. **Sentence Defense** — stop incoming threats with sentences.
027. **Sentence Builder Pro** — construct grammatically correct sequences.
028. **Sentence Scramble** — reorder and type sentence parts.
029. **Paragraph Path** — type linked sentence sequences.
030. **Story Runner** — type story segments while moving.
031. **Story Escape** — escape by completing narrative prompts.
032. **Story Reactor** — dynamic prompts that react to speed.
033. **Code Keys** — type keyboard-style symbol sequences.
034. **Symbol Forge** — practice symbols and punctuation.
035. **Punctuation Patrol** — punctuation accuracy challenge.
036. **Capital Mission** — capitalization and shift practice.
037. **Number Rally** — number-row typing challenge.
038. **Number Vault** — unlock numeric locks.
039. **Number Storm** — fast number sequences.
040. **Mixed Keys** — letters, numbers, symbols mixed.
041. **Shift Master** — advanced shift-key accuracy.
042. **Shortcut Sprint** — type common shortcut combinations.
043. **Hotkey Hero** — keyboard shortcut reflex drills.
044. **Backspace Boss** — recover from mistakes efficiently.
045. **Error Doctor** — repair incorrect sequences.
046. **Weak-Key Hunt** — target personal weak keys.
047. **Accuracy Architect** — design a run above an accuracy threshold.
048. **Speed Architect** — build a speed streak across checkpoints.
049. **Combo Reactor** — combo growth with escalating difficulty.
050. **Perfect Chain** — chain perfect segments.
051. **Flawless Flight** — fly only while accuracy stays above target.
052. **Zero Error Zone** — finish a zero-error course.
053. **Pressure Chamber** — typing under escalating pressure.
054. **Time Rift** — switch between time windows.
055. **Chrono Typist** — beat historical speed records.
056. **Lightning Lap** — short maximum-speed laps.
057. **Endurance Run** — long-form typing stamina.
058. **Marathon Typist** — extended typing session.
059. **Infinite Words** — endless word mode.
060. **Infinite Sentences** — endless sentence mode.
061. **Survival Typist** — difficulty rises until failure.
062. **Wave Breaker** — clear typing waves.
063. **Boss Gate** — unlock a boss through multiple sub-tests.
064. **Boss: Key Golem** — mixed key boss.
065. **Boss: Word Kraken** — advanced word boss.
066. **Boss: Sentence Dragon** — sentence accuracy boss.
067. **Boss: Speed Phantom** — speed benchmark boss.
068. **Sky Raiders** — aerial typing combat.
069. **Jungle Chase** — fast jungle obstacle typing.
070. **Cyber City Rush** — urban cyberpunk typing race.
071. **Neon Highway** — high-speed word highway.
072. **Space Station Lockdown** — type commands to restore systems.
073. **Starship Pilot** — steer a ship with sentence commands.
074. **Volcano Escape** — advanced escalating sentence typing.
075. **Deep Sea Dive** — type before oxygen runs out.
076. **Mountain Ascent** — long-form accuracy climb.
077. **Storm Rider** — maintain accuracy in dynamic prompts.
078. **Train Heist** — type commands to stop a moving train.
079. **Castle Siege** — type defensive commands under pressure.
080. **Treasure Vault** — unlock chained typing locks.
081. **Ghost Corridor** — rapid low-error navigation.
082. **Time Trial Pro** — competitive timed benchmark.
083. **Accuracy Trial Pro** — competitive accuracy benchmark.
084. **WPM Duel** — best-of-round speed duel.
085. **Score Attack** — maximize weighted score.
086. **Daily Mastery** — advanced daily personalized challenge.

## 11. Phase 2 Definition of Done

- Adaptive recommendations work.
- Weak-key and weak-skill profiles are generated.
- Clan help has abuse controls.
- Clan missions work.
- Boss battles work.
- Advanced competitions work.
- Rewarded-ad integration is behind a feature flag.
- Rewarded-ad rewards are non-monetary, non-transferable and user-initiated when required by Google policy. citeturn148943search5
- The game engine can add new games through configuration/content rather than rewriting the platform.


# SHARED ENGINE — REQUIRED ACROSS ALL THREE PHASES

## A. Core Game Engine

Do not build 240 games as 240 unrelated React pages.

Build a reusable game engine with:
- Game Definition
- Game Renderer
- Input Rules
- Prompt Generator
- Difficulty Profile
- Scoring Function
- Reward Policy
- Unlock Policy
- Audio Pack
- Visual Pack
- Result Validator

Most games should be configuration-driven.

### Example Concept

```ts
type GameDefinition = {
  id: string;
  slug: string;
  worldId: string;
  mode: "letter" | "word" | "sentence" | "number" | "symbol" | "mixed";
  mechanic: string;
  difficulty: "beginner" | "intermediate" | "expert";
  durationSec?: number;
  promptSource: string;
  scoringProfile: string;
  unlockRule: UnlockRule;
};
```

## B. Scoring

Keep raw metrics separate from reward calculations.

Raw:
- elapsed_ms
- chars_typed
- correct_chars
- incorrect_chars
- corrections
- words_completed
- accuracy
- raw_wpm
- effective_wpm

Derived:
- score
- XP earned
- coins earned
- badge unlocks

This lets the scoring model evolve without corrupting raw records.

## C. WPM

Default:
`WPM = (correct_characters / 5) / minutes`

Store both raw WPM and effective WPM.

Accuracy:
`accuracy = correct_characters / total_typed_characters * 100`

## D. Database Ledger Rules

XP, coins, seasonal points and rewards must be append-only ledgers.

Never only store:
`users.xp = 1200`

Instead store:
- transaction ID
- user ID
- source
- amount
- balance_after
- timestamp
- reference ID
- metadata
- created_by/system

Then maintain cached balances for performance.

## E. RLS

Every table containing student-owned information needs an explicit RLS policy.

Public/batch-visible:
- display name
- roll
- level
- public badges
- public records
- leaderboard metrics

Private:
- email
- password/auth metadata
- internal moderation notes
- private analytics
- ad/reward verification metadata

## F. API Boundaries

Client may request:
- start game
- submit attempt
- request unlock status
- view leaderboard
- view profile
- request help
- join competition

Server validates:
- identity
- batch membership
- game availability
- unlock requirements
- attempt limits
- timing
- score
- reward

## G. Caching

Recommended:
- Cache public game definitions at the edge.
- Cache world map metadata.
- Cache public leaderboard snapshots briefly.
- Never edge-cache private student data without correct cache keys and privacy controls.

## H. R2

Use R2 for:
- avatar originals
- optimized avatar variants
- game illustrations
- world backgrounds
- badges
- cosmetics
- sound
- promotional assets

Never store:
- passwords
- auth secrets
- student private exports
- unencrypted sensitive data

## I. Git Structure

Suggested:

```text
/apps/web
/packages/ui
/packages/game-engine
/packages/scoring
/packages/content
/packages/auth
/packages/db
/packages/analytics
/packages/economy
/packages/competition
/packages/clan
/docs
/supabase/migrations
/scripts
```

## J. Configuration

Use database-backed configuration for:
- XP
- level curve
- game unlocks
- daily mission rotation
- reward values
- badge rules
- competition rules
- ad reward limits
- clan limits
- seasonal rules

Use environment variables only for secrets and deployment-specific configuration.

## K. Observability

Track:
- errors
- latency
- failed score submissions
- abnormal reward grants
- R2 errors
- database errors
- Worker errors

Add:
- correlation ID
- request ID
- user ID where safe
- game attempt ID

## L. Backup & Recovery

For self-hosted Supabase, backups are the operator's responsibility. Production deployment must include automated PostgreSQL backups, retention, restore testing, disk monitoring and disaster-recovery procedures before the platform becomes business-critical.

## M. Launch Strategy

Although the code is developed in three phases, launch all planned capabilities behind feature flags.

Example:

```text
PHASE_1_CORE = true
PHASE_2_ADAPTIVE = true
PHASE_2_REWARDED_ADS = false
PHASE_3_CLAN_WARS = false
PHASE_3_SEASONS = false
```

This allows the entire codebase to be shipped while advanced systems are activated safely.

## N. Critical Product Rule

The platform must never make the learner feel forced to type.

Every session should answer:

**What is my mission?**
**Why should I care?**
**What do I unlock next?**
**What reward do I earn?**
**How am I improving?**
**What can I try if this game is not fun for me?**

That is the core retention loop.

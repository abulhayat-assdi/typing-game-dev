# Typing Adventure Platform — Product Architecture

> **Document status:** Master implementation specification  
> **Language:** English specification; product UI supports English + Bangla  
> **Primary deployment:** Cloudflare Workers  
> **Application:** Next.js + TypeScript  
> **Database/Auth:** Self-hosted Supabase on the user's VPS (PostgreSQL + Supabase Auth + RLS + Realtime)  
> **Asset storage:** Cloudflare R2  
> **Core principle:** This is a typing-learning adventure game, not a generic typing-test website.

## 0. Product Vision

The platform turns typing practice into a progression game. A learner enters an adventure world, completes missions, earns XP and coins, unlocks new stages, builds streaks, earns badges, competes with batch-mates, and eventually participates in clan wars.

The system must support three starting skill profiles:

- **Beginner:** keyboard discovery, finger mapping, letters, simple words, short sentences.
- **Intermediate:** speed/accuracy drills, punctuation, numbers, mixed inputs, advanced word/sentence challenges.
- **Expert:** competitive timed tests, high-speed mixed inputs, endurance, precision and elite challenges.

The three tracks share the same universe and global scoring model. The selected track only changes recommendations, onboarding diagnostics, difficulty and suggested route. It must never permanently imprison a learner in one track.

## 1. Non-Negotiable UX Rules

1. Every locked game has a **playable-looking demo/preview**, but gameplay is disabled until its unlock rules are satisfied.
2. Each locked game shows **Why locked**, **Required XP**, **Required mission(s)**, and **Recommended preparation games**.
3. The primary loop is: **Mission → Play → Score → XP/Coins/Badge → Unlock → New Mission**.
4. Failure never becomes a dead end. The player can retry, switch to another available mission, or use an approved recovery mechanic.
5. The UI should feel like a game map: worlds, gates, paths, quests, treasures, bosses and achievements.
6. Sound, animation and motion must be optional and respect reduced-motion accessibility preferences.
7. The entire student experience must be usable in Bangla UI mode while typing content remains configurable per challenge.
8. No leaderboard advantage may be sold for real money. Competitive scoring must remain skill-based.


# PHASE 1 — CORE ADVENTURE + LEARNING PLATFORM

## 2. Phase 1 Objective

Build the complete launchable foundation: authentication, courses, batches, student profiles, skill selection, keyboard/finger learning, progressive worlds, XP/coins/levels, streaks, badges, achievements, dashboards, batch leaderboard, basic competitions, admin/teacher controls, demo previews, core analytics and the initial large game library.

Phase 1 should be production-ready even though Phase 2 and Phase 3 are developed in parallel.

## 3. Information Architecture

### Public
- Landing page
- About / How it works
- Game world preview
- Leaderboard preview (privacy-safe)
- Login
- Registration
- Terms
- Privacy
- Ad/reward explanation
- Accessibility

### Student
- Adventure Home
- World Map
- Game Library
- Recommended Mission
- Daily Missions
- Streak Center
- XP/Level Center
- Badges/Achievements
- Profile
- Batch Leaderboard
- Competitions
- Notifications
- Settings
- Help

### Teacher/Admin
- Dashboard
- Courses
- Batches
- Students
- Game Catalog
- Mission Templates
- Competitions
- Rewards
- Badges
- Leaderboards
- Analytics
- Content
- Audit Logs

### Super Admin
Everything above plus:
- Platform settings
- Roles and permissions
- Reward economy controls
- Ad/reward configuration
- System feature flags
- Data export
- Abuse controls
- Global leaderboard
- Cross-course batch/clan management
- Competition policy
- Emergency disable switches

## 4. Organizational Model

`Organization → Course → Batch → Student`

A **Batch is treated as a Clan identity** for Phase 3, but the database should model the clan as a separate entity with a one-to-one relation to the batch. This avoids rewriting the data model later.

Example:

- Course: The Art of Sales & Marketing
  - Batch 101
  - Batch 102
- Course: Telesales
  - Batch 201
  - Batch 202

A student can belong to exactly one active batch unless Super Admin explicitly enables multi-course enrollment.

## 5. Registration

Registration fields:
- Batch code / batch selection
- Student roll number
- Full name
- Email
- Password
- Skill level: Beginner / Intermediate / Expert
- Optional avatar
- Terms acceptance

The chosen skill level initializes a diagnostic route. The system then recalibrates recommendations based on actual performance.

### Roll Number Rules
- Unique inside a batch.
- Can be duplicated across different batches.
- Cannot be changed by a student.
- Admin changes require an audit record.

## 6. Authentication & Authorization

Use Supabase Auth.

Roles:
- `student`
- `teacher`
- `admin`
- `super_admin`

Optional scope:
- Teacher assigned to one or more courses/batches.
- Admin scoped to an organization.
- Super Admin global.

Security requirements:
- Supabase Row Level Security (RLS) is mandatory.
- Students can read only their own private account data and permitted batch/clan public profile data.
- Students cannot directly update XP, coins, streaks, badges, competition scores, unlocks or rewards.
- All score/reward mutations must be server-validated.
- Service-role credentials are server-only.
- Never expose Supabase service-role keys in the browser.

## 7. Student Profile

Profile shows:
- Name
- Roll number
- Batch
- Course
- Skill track
- Current level
- Total XP
- Coins
- Current streak
- Best streak
- Average WPM
- Average accuracy
- Missions completed
- Worlds unlocked
- Badges
- Achievements
- Recent records
- Competition history
- Favorite games
- Optional avatar/cosmetics

Batch peers may see a privacy-safe version. Email and private account data remain hidden.

## 8. Progression Model

Primary progression resource:
- XP

Secondary:
- Coins
- Badges
- Achievements
- Streak
- Records

XP is earned from:
- Mission completion
- First-time completion
- Daily missions
- Personal best
- Accuracy milestones
- Speed milestones
- Competition participation
- Competition placement
- Approved social interactions
- Other configured activities

Never award unlimited XP for arbitrary profile views/likes. Anti-abuse rules are mandatory.

### Example Level Curve

Use a configurable formula rather than hard-coding:
`required_total_xp(level) = round(base * level^1.55)`

Suggested starting calibration:
- Level 1: account onboarding
- Level 2: 30 total XP
- Level 3: 80 total XP
- Level 4: 150 total XP
- Level 5: 250 total XP
- Level 10+: progressively increasing

Admins can adjust the curve without redeploying code.

## 9. Game Unlock Model

Every game has:
- `game_id`
- world
- difficulty
- skill bands
- prerequisites
- XP cost
- mission requirements
- completion requirements
- preview asset
- active/inactive
- season availability

Unlock rules can be combined with AND/OR groups.

Example:
`Unlock Word Dragon = Level >= 8 AND Accuracy >= 90% AND Complete 5 Word missions`

A player can see the game card and preview, but cannot play until unlocked.

## 10. World / Adventure Structure

Recommended worlds:
1. Keyboard Village
2. Finger Forest
3. Letter Valley
4. Word City
5. Sentence Kingdom
6. Speed Arena
7. Sky Frontier
8. Jungle Escape
9. Desert Rally
10. Ocean Depths
11. Arctic Pass
12. Space Station
13. Cyber City
14. Volcano Zone
15. Castle Siege
16. Grand Arena

Each world contains:
- Story intro
- Map
- Normal missions
- Side missions
- Treasure missions
- Challenge gates
- Boss/elite content
- Reward chest
- Next-world unlock

## 11. Mission Types

- Learn
- Practice
- Time Trial
- Accuracy Trial
- Survival
- Collection
- Race
- Escape
- Defense
- Boss
- Daily
- Weekly
- Personal Best
- Event
- Competition

## 12. Streak / Consistency

Track:
- Current streak
- Best streak
- Active days
- Weekly consistency
- Monthly consistency

A streak day is earned from a minimum configured meaningful activity, not from merely opening the site.

Example:
- Complete 1 qualifying mission OR
- Complete a configured number of typing actions/minutes.

Recovery must use an explicit, auditable mechanic. Never silently alter historical activity.

## 13. Badges

Badge categories:
- First Steps
- Keyboard Mastery
- Accuracy
- Speed
- Consistency
- Explorer
- Competition
- Clan
- Seasonal
- Elite

Examples:
- First Key
- Home Row Hero
- 100 Words
- 1K Words
- Accuracy Ace
- Zero Error
- 20 WPM
- 40 WPM
- 60 WPM
- 100 WPM
- 7-Day Streak
- 30-Day Streak
- World Explorer
- Competition Rookie
- Speed Champion
- Hall of Legends

## 14. Coins & Economy

Coins are non-cash virtual items.

Uses:
- Cosmetic avatars
- Frames
- Map effects
- Titles
- Sound packs
- Profile decorations
- Approved gameplay convenience items
- Clan support items in later phases

Rules:
- Coins cannot be exchanged for cash.
- Rewarded-ad rewards must be non-transferable when using Google rewarded ad formats.
- All economy transactions use an immutable ledger.

## 15. Batch Leaderboard

Leaderboards are batch-scoped for students:
- Rank
- Name
- Roll
- Level
- XP
- WPM
- Accuracy
- Streak
- Badges

Filters:
- Today
- Week
- Month
- All time
- Mission
- World
- Competition

Student cannot view another batch unless a competition/event explicitly permits it.

## 16. Basic Competition

Admin creates:
- Competition name
- Batch
- Game/mission
- Start time
- End time
- Duration
- Attempts
- Scoring model
- Rewards

Scoring examples:
`score = normalized_wpm * accuracy_multiplier`

Tie-breakers:
1. Accuracy
2. Best single run
3. Lowest error count
4. Earliest qualifying submission

## 17. Admin / Teacher Controls

Teachers can:
- Create missions
- Create competitions
- Review student progress
- Assign batches
- View batch analytics

Admins can:
- Create courses
- Create batches
- Import students
- Manage content
- Manage rewards
- Manage competitions

Super Admin can:
- Manage all tenants
- Manage roles
- Configure global settings
- View audit logs
- Manage feature flags
- Manage economy
- Manage ad settings
- Disable problematic games/rewards

## 18. Analytics

Track events such as:
- login
- mission_started
- mission_completed
- mission_failed
- game_unlocked
- level_up
- badge_earned
- streak_started
- streak_broken
- streak_recovered
- competition_joined
- competition_completed
- clan_event_joined
- ad_offer_opened
- rewarded_event_completed
- reward_granted

Do not store every keystroke in PostgreSQL by default. Store summarized run metrics:
- duration
- WPM
- raw WPM
- accuracy
- errors
- corrected errors
- score
- game id
- difficulty
- timestamp

## 19. Technology Architecture

### Frontend / App
- Next.js
- TypeScript
- React
- Tailwind CSS
- Component library built in-house or shadcn/ui
- Framer Motion or CSS animations
- Web Audio API for lightweight game sounds
- Canvas only where game visuals need it

### Deployment
- Cloudflare Workers
- Cloudflare custom domain
- Wrangler
- Cloudflare-recommended Next.js-on-Workers path (evaluate Vinext first; OpenNext remains a documented alternative for existing projects). citeturn148943search1turn148943search3

### Database / Auth
- Self-hosted Supabase running on the user's existing VPS
- PostgreSQL as the primary database engine
- Supabase Auth
- Row Level Security (RLS)
- Supabase Realtime where required
- Postgres functions where secure server-side atomic operations are useful
- Never expose Supabase service-role credentials to the browser

Because the application uses a self-hosted Supabase deployment on the existing VPS, the managed Supabase Free-tier quotas and pause behavior are not part of the runtime architecture.

For this product, place images/avatars/game media in Cloudflare R2 rather than using Supabase Storage, keeping the VPS focused on application data, authentication, RLS and database workloads.

### Asset Storage
- Cloudflare R2
- Public assets: CDN/cache-friendly
- Private uploads: signed URLs
- Organize by:
  - `/avatars/`
  - `/badges/`
  - `/worlds/`
  - `/games/`
  - `/sound/`
  - `/ui/`
  - `/competition/`

## 20A. VPS Self-Hosted Supabase Deployment

The confirmed production architecture is:

```text
Browser
   ↓
Cloudflare DNS / CDN / WAF
   ↓
Cloudflare Workers
   ↓
Next.js application
   ↓
Secure server-side connection
   ↓
Self-hosted Supabase on existing VPS
   ├── PostgreSQL
   ├── Supabase Auth
   ├── RLS
   ├── Realtime (only where needed)
   └── Supabase APIs
```

Cloudflare R2 remains the asset store:

```text
Cloudflare Workers
      ↓
Cloudflare R2
 ├── avatars
 ├── game art
 ├── badges
 ├── world backgrounds
 ├── audio
 └── cosmetics
```

Operational requirements:
- Use a dedicated subdomain for Supabase APIs, e.g. `api.example.com`.
- Keep the PostgreSQL/Supabase host private where practical and expose only required endpoints through a secure reverse proxy.
- Use HTTPS everywhere.
- Store Supabase secrets in Cloudflare Worker secrets/environment variables, never in client-side code.
- Restrict PostgreSQL network access to the required services.
- Enable VPS firewall rules and fail2ban or an equivalent protection layer.
- Schedule automated PostgreSQL backups to a separate storage destination; do not keep the only backup on the same VPS.
- Test database restore procedures regularly.
- Monitor CPU, RAM, disk, PostgreSQL connections, query latency and error rate.
- Configure restart policies for Supabase services.
- Keep Docker/Supabase versions pinned and upgrade deliberately.
- Do not run R2-equivalent media workloads through the VPS database/storage layer.
- Use connection pooling and avoid creating one database connection per request.
- Never persist individual keystrokes to PostgreSQL by default; persist summarized attempt metrics.

## 20. Suggested Database Core Tables

- profiles
- roles
- courses
- batches
- batch_members
- skill_profiles
- games
- game_versions
- worlds
- missions
- mission_attempts
- game_unlocks
- xp_ledger
- coin_ledger
- levels
- badges
- badge_awards
- achievements
- streaks
- streak_events
- competitions
- competition_entries
- competition_results
- leaderboard_snapshots
- notifications
- audit_logs
- feature_flags
- content_versions

## 21. Phase 1 Game Catalogue

001. **Find the Key** — single key recognition.
002. **Key Hunter** — locate highlighted keys on a virtual keyboard.
003. **Key Compass** — follow directional keyboard hints.
004. **Keyboard Safari** — explore keyboard zones and identify keys.
005. **Home Row Harbor** — home-row placement drills.
006. **F & J Lighthouse** — anchor-key recognition.
007. **Left Hand Lab** — left-hand finger mapping.
008. **Right Hand Lab** — right-hand finger mapping.
009. **Finger Forge** — finger assignment practice.
010. **Finger Trails** — follow correct finger paths.
011. **Key Garden** — tap target letters in sequence.
012. **Letter Rain** — catch falling target letters.
013. **Letter Splash** — type letters before they hit the water.
014. **Letter Lanterns** — light matching letters.
015. **Letter Pop** — pop the correct letter targets.
016. **Letter Hunt** — find requested letters in a field.
017. **Letter Maze** — navigate by typing the shown letter.
018. **Alphabet Run** — complete alphabet paths.
019. **Vowel Voyage** — vowel-focused recognition.
020. **Consonant Cave** — consonant recognition challenge.
021. **Two-Key Duel** — alternate between two keys.
022. **Three-Key Trek** — master three-key groups.
023. **Neighbor Keys** — practice adjacent keyboard keys.
024. **Mirror Keys** — left/right paired keys.
025. **Key Bridge** — type the key needed to cross bridges.
026. **Keyboard Islands** — unlock keyboard islands by accuracy.
027. **Finger Rescue** — use the correct finger to rescue icons.
028. **Typing Train** — type target letters to move a train.
029. **Key Balloon** — keep a balloon floating with correct keys.
030. **Key Rocket** — launch with accurate key sequences.
031. **Letter River** — type flowing letters without breaks.
032. **Key Castle** — defeat tiny guards with correct keys.
033. **Keyboard Quest** — complete a guided keyboard route.
034. **Word Builder** — assemble simple words by typing.
035. **Word Blocks** — clear blocks by typing words.
036. **Word Garden** — grow plants by typing target words.
037. **Word Bakery** — complete recipe words.
038. **Word Market** — type item names to stock a market.
039. **Word Factory** — assemble words on a production line.
040. **Word Bridge** — type words to build bridges.
041. **Word Port** — load cargo by typing words.
042. **Word Train** — type words to keep the train moving.
043. **Word Rocket** — fuel a rocket with correct words.
044. **Word River** — cross checkpoints using word sequences.
045. **Word Ninja** — slice word targets accurately.
046. **Word Catcher** — catch falling words.
047. **Word Sprint** — short timed word bursts.
048. **Word Shield** — shield a base with correct words.
049. **Word Tower** — build a tower from accurate words.
050. **Word Harbor** — dock by typing docking words.
051. **Word Jungle** — navigate using common words.
052. **Word Cave** — discover words in cave chambers.
053. **Word Desert** — cross the desert through word gates.
054. **Word Mountain** — climb by completing word sets.
055. **Word Forest** — follow word trails.
056. **Sentence Steps** — type short sentences one step at a time.
057. **Sentence Bridge** — build sentences to cross gaps.
058. **Sentence River** — type sentences while a river flows.
059. **Sentence Run** — run through short sentence checkpoints.
060. **Sentence Garden** — grow a scene by completing sentences.
061. **Sentence Train** — keep a train moving with sentences.
062. **Sentence Flight** — pilot through sentence gates.
063. **Sentence Harbor** — dock after accurate sentence typing.
064. **Sentence Cave** — explore chambers with sentence clues.
065. **Sentence Castle** — unlock castle rooms with sentences.
066. **Minute Dash** — 1-minute typing test.
067. **Two-Minute Trail** — 2-minute typing challenge.
068. **Speed Tunnel** — maintain speed through a tunnel.
069. **Accuracy Temple** — maximize accuracy under time pressure.
070. **Combo Canyon** — build long correct streaks.
071. **No-Mistake Bridge** — finish with a perfect run.
072. **Checkpoint Chase** — beat checkpoints before the timer.
073. **Typing Volcano** — survive escalating typing waves.
074. **Typing Rapids** — type while the current accelerates.
075. **Keyboard Express** — race a train using typing speed.
076. **Sky Typist** — type while flying through targets.
077. **Airship Sprint** — guide an airship through word gates.
078. **Jungle Escape** — escape through timed typing checkpoints.
079. **Desert Rally** — race across a desert by typing.
080. **Arctic Dash** — maintain accuracy in a fast cold-zone course.
081. **Space Run** — type to navigate a space course.
082. **Typing Arena** — score against target benchmarks.
083. **Practice Dojo** — accuracy-first free practice.
084. **Daily Quest** — complete a rotating daily typing objective.
085. **Streak Quest** — complete today’s streak mission.
086. **XP Rush** — earn maximum XP in a limited session.

## 22. Phase 1 Definition of Done

- Student can register into exactly the correct batch.
- Student can log in securely.
- Beginner/Intermediate/Expert onboarding works.
- Keyboard/finger/letter/word/sentence routes work.
- At least 80 launch games exist as templates, with content-driven configuration so additional games do not require new application architecture.
- Locked games can show preview/demo but cannot be played.
- XP, levels, coins, badges and streaks work.
- Batch leaderboard works.
- Teacher and Super Admin workflows work.
- Competition creation works.
- RLS and server-side reward validation are tested.
- R2 asset upload/read paths work.
- Cloudflare Workers deployment works.
- Supabase schema and migrations are version controlled.
- All critical actions have audit records.


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

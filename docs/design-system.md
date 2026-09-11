# Design System (M3)

`@tap/ui` — 29 primitives + 9 game-ready visual patterns. Composable,
server-safe by default (`"use client"` only where state demands it).

## Rules

- All user-facing text arrives via props (host apps pass translations);
  components ship zero hard-coded copy (one documented English default on
  `ToastProvider`'s dismiss label, overridable).
- Plain `<img>` for R2 art (Next optimizer is Workers-incompatible).
- State styling: tokens + `tap-*` classes in `styles/` — hover, focus-visible,
  disabled, keyboard (arrows/Escape/Enter where applicable), `prefers-reduced-motion`.
- Light default; dark via `[data-theme="dark"]` (`ThemeProvider` in the app).
- Display math only (e.g. bar widths from caller-supplied numbers). No
  scoring, XP, unlock or completion logic anywhere in the package.

## Primitives

Button, IconButton, Input, PasswordInput, Select, Checkbox, Radio, Switch,
Dialog (native `<dialog>`), Drawer, Dropdown, Tooltip (CSS-only), Tabs, Card
(+Header/Title/Description/Content/Footer), Badge (incl. rarity tones),
Avatar (initials fallback), ProgressBar, ProgressRing, Skeleton, Alert, Toast
(`ToastProvider` + `useToast`), Modal, EmptyState, LoadingState, ErrorState,
StatCard, Breadcrumb, PageHeader, SectionHeader.

## Game-ready patterns (visual only)

WorldCard, LockedGameCard (why-locked list, XP line, disabled surface),
MissionCard, RewardCard, XpProgress, AchievementBadge, AdventureMapContainer,
GamePreviewContainer, GameHudShell (metric slots; values are display-only —
validation always happens server-side).

## Tokens

`styles/tokens.css` (`:root` + `[data-theme="dark"]`): font stacks (with
Bengali-capable fallbacks), canvas/surface/ink/line, primary/accent/
success/danger/info scales, radius, shadows, motion durations. The web app
imports tokens + components CSS in `styles/globals.css` and maps Tailwind
theme keys to the same vars (`tailwind.config.ts`).

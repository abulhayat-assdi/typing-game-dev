"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Badge, Card, CardContent, EmptyState } from "@tap/ui";
import { type Locale } from "../lib/i18n";
import {
  filterGames,
  sortGames,
  type EnrichedGame,
  type GameSort,
} from "../lib/game-catalog";

export interface ExplorerStrings {
  search: string;
  searchPlaceholder: string;
  filterWorld: string;
  filterDifficulty: string;
  filterMode: string;
  filterStatus: string;
  statusAll: string;
  statusUnlocked: string;
  statusLocked: string;
  statusCompleted: string;
  sortBy: string;
  sortRecommended: string;
  sortEasiest: string;
  sortBest: string;
  noResults: string;
  play: string;
  lockedReason: string;
  bestScore: string;
  beginner: string;
  intermediate: string;
  expert: string;
}

/** Client-side explorer: filter/sort/search over server-fetched catalog. */
export function GamesExplorer({
  locale,
  games,
  worlds,
  modes,
  recommendedSlug,
  strings: s,
}: {
  locale: Locale;
  games: EnrichedGame[];
  worlds: Array<{ slug: string; name: string }>;
  modes: string[];
  recommendedSlug: string | null;
  strings: ExplorerStrings;
}) {
  const [query, setQuery] = useState("");
  const [world, setWorld] = useState("");
  const [difficulty, setDifficulty] = useState("");
  const [mode, setMode] = useState("");
  const [status, setStatus] = useState<"all" | "unlocked" | "locked" | "completed">("all");
  const [sort, setSort] = useState<GameSort>("recommended");

  const visible = useMemo(
    () =>
      sortGames(
        filterGames(games, { query, world, difficulty, mode, status }),
        sort,
        recommendedSlug,
      ),
    [games, query, world, difficulty, mode, status, sort, recommendedSlug],
  );

  const diffLabel = (d: string): string =>
    d === "beginner" ? s.beginner : d === "intermediate" ? s.intermediate : s.expert;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-6">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-semibold">{s.search}</span>
          <input
            type="search"
            value={query}
            onChange={(e) => { setQuery(e.target.value); }}
            placeholder={s.searchPlaceholder}
            className="tap-input-wrap tap-input"
            aria-label={s.search}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-semibold">{s.filterWorld}</span>
          <select
            value={world}
            onChange={(e) => { setWorld(e.target.value); }}
            className="tap-input-wrap tap-input"
          >
            <option value="">{s.statusAll}</option>
            {worlds.map((w) => (
              <option key={w.slug} value={w.slug}>
                {w.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-semibold">{s.filterDifficulty}</span>
          <select
            value={difficulty}
            onChange={(e) => { setDifficulty(e.target.value); }}
            className="tap-input-wrap tap-input"
          >
            <option value="">{s.statusAll}</option>
            {["beginner", "intermediate", "expert"].map((d) => (
              <option key={d} value={d}>
                {diffLabel(d)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-semibold">{s.filterMode}</span>
          <select
            value={mode}
            onChange={(e) => { setMode(e.target.value); }}
            className="tap-input-wrap tap-input"
          >
            <option value="">{s.statusAll}</option>
            {modes.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-semibold">{s.filterStatus}</span>
          <select
            value={status}
            onChange={(e) => { setStatus(e.target.value as typeof status); }
            }
            className="tap-input-wrap tap-input"
          >
            <option value="all">{s.statusAll}</option>
            <option value="unlocked">{s.statusUnlocked}</option>
            <option value="locked">{s.statusLocked}</option>
            <option value="completed">{s.statusCompleted}</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-semibold">{s.sortBy}</span>
          <select
            value={sort}
            onChange={(e) => { setSort(e.target.value as GameSort); }}
            className="tap-input-wrap tap-input"
          >
            <option value="recommended">{s.sortRecommended}</option>
            <option value="easiest">{s.sortEasiest}</option>
            <option value="best">{s.sortBest}</option>
          </select>
        </label>
      </div>

      {visible.length === 0 ? (
        <EmptyState title={s.noResults} />
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((g) => (
            <li key={g.slug}>
              <Card interactive={g.unlocked}>
                <CardContent>
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <h3 className="font-bold">
                      {locale === "bn" && g.titleBn ? g.titleBn : g.titleEn}
                    </h3>
                    {g.slug === recommendedSlug ? (
                      <Badge tone="primary">{s.sortRecommended}</Badge>
                    ) : null}
                  </div>
                  <p className="mb-2 text-sm text-ink-muted">{g.descriptionEn}</p>
                  <div className="mb-3 flex flex-wrap gap-1">
                    <Badge tone="neutral">{diffLabel(g.difficulty)}</Badge>
                    <Badge tone="neutral">{g.mode}</Badge>
                    {g.completed ? (
                      <Badge tone="success">{s.statusCompleted}</Badge>
                    ) : g.unlocked ? null : (
                      <Badge tone="warning">{s.lockedReason}</Badge>
                    )}
                    {g.bestScore !== null ? (
                      <Badge tone="primary">
                        {s.bestScore}: {g.bestScore}
                      </Badge>
                    ) : null}
                  </div>
                  {g.unlocked ? (
                    <Link
                      href={`/${locale}/games/${g.slug}`}
                      className="tap-btn tap-btn-primary tap-btn-sm"
                    >
                      {s.play}
                    </Link>
                  ) : (
                    <Link
                      href={`/${locale}/games/${g.slug}`}
                      className="tap-btn tap-btn-secondary tap-btn-sm"
                    >
                      {s.lockedReason}
                    </Link>
                  )}
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Clan persistence boundary (M10). Routes depend ONLY on ClanStore.
 * Membership/contribution/activity are derived server-side (triggers +
 * SECURITY DEFINER fns); the store never invents XP and never trusts
 * client-reported progress. Clan XP is always sum(contributions).
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export class ForbiddenError extends Error {
  constructor(message = "FORBIDDEN") {
    super(message);
    this.name = "ForbiddenError";
  }
}

export class ConflictError extends Error {
  constructor(message = "CONFLICT") {
    super(message);
    this.name = "ConflictError";
  }
}

export class NotFoundError extends Error {
  constructor(message = "NOT_FOUND") {
    super(message);
    this.name = "NotFoundError";
  }
}

export interface ClanProfile {
  id: string;
  name: string;
  slug: string;
  motto: string;
  description: string;
  batchId: string;
  organizationId: string;
  status: string;
  memberCount: number;
  totalXp: number;
  myRole: string | null;
  myRank: number | null;
}

export interface ClanRosterRow {
  userId: string;
  displayName: string;
  rollNumber: string;
  role: string;
  level: number;
  xpTotal: number;
  bestWpm: number | null;
  bestAccuracy: number | null;
  streakCurrent: number;
  badgeCount: number;
  contribution: number;
  isMe: boolean;
}

export interface ClanBoardEntry {
  clanId: string;
  name: string;
  memberCount: number;
  totalPoints: number;
  rank: number;
}

export interface ClanMission {
  id: string;
  missionId: string;
  slug: string;
  title: string;
  status: string;
  objectives: {
    position: number;
    kind: string;
    current: number;
    target: number;
    completed: boolean;
    participants: number;
  }[];
  periodStart: string;
}

export interface HelpRequest {
  id: string;
  clanId: string;
  mine: boolean;
  context: Record<string, unknown>;
  requested: number;
  fulfilled: number;
  status: string;
  expiresAt: string;
}

export interface ActivityItem {
  kind: string;
  summary: Record<string, unknown>;
  createdAt: string;
}

export interface ClanStore {
  getMyClan(userId: string): Promise<ClanProfile | null>;
  getClan(id: string): Promise<ClanProfile | null>;
  getRoster(clanId: string): Promise<ClanRosterRow[]>;
  getBoard(window: string): Promise<ClanBoardEntry[]>;
  getMissions(clanId: string): Promise<ClanMission[]>;
  startClanMission(id: string): Promise<void>;
  syncClanMission(id: string): Promise<string>;
  getHelpRequests(clanId: string): Promise<HelpRequest[]>;
  getActivity(clanId: string): Promise<ActivityItem[]>;
  createHelpRequest(
    clanId: string,
    context: Record<string, unknown>,
    requested: number,
  ): Promise<string>;
  contributeHelp(requestId: string, amount: number): Promise<void>;
  listClans(): Promise<ClanProfile[]>;
  setClanProfile(id: string, patch: Record<string, unknown>): Promise<void>;
  setClanStatus(id: string, status: string): Promise<void>;
  assignRole(clanId: string, userId: string, role: string): Promise<void>;
  linkMission(clanId: string, missionId: string): Promise<string>;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function str(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

function num(v: unknown, fallback = 0): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

export function mapStoreError(e: unknown): Error {
  const message =
    isRecord(e) && typeof e.message === "string" ? e.message : String(e);
  if (/FORBIDDEN|row-level security|permission denied/i.test(message)) {
    return new ForbiddenError(message);
  }
  if (/NOT_FOUND|NOT_MEMBER|NOT_CLAN_MISSION/i.test(message)) {
    return new NotFoundError(message);
  }
  if (
    /duplicate|unique|already|ALREADY|INVALID|MALFORMED|CLOSED|SELF_FULFILL|DUPLICATE|CROSS_CLAN|SUPPORTER_LIMIT|REQUESTER_LIMIT|INSUFFICIENT_COINS|PREREQUISITE/i.test(
      message,
    )
  ) {
    return new ConflictError(message);
  }
  return e instanceof Error ? e : new Error(message);
}

/** Production store: user-scoped client → RPC fns + RLS reads. */
export function createSupabaseClanStore(client: SupabaseClient): ClanStore {
  async function toProfile(
    c: Record<string, unknown>,
    userId: string,
  ): Promise<ClanProfile | null> {
    const id = str(c.id);
    if (!id) return null;
    const roster = await api.getRoster(id);
    const me = roster.find((r) => r.userId === userId) ?? null;
    const ranked = [...roster].sort(
      (a, b) => b.contribution - a.contribution,
    );
    const myRank = me ? ranked.indexOf(me) + 1 : null;
    return {
      id,
      name: str(c.name),
      slug: str(c.slug),
      motto: str(c.motto),
      description: str(c.description),
      batchId: str(c.batch_id),
      organizationId: str(c.organization_id),
      status: str(c.status),
      memberCount: roster.length,
      totalXp: roster.reduce((s, r) => s + r.contribution, 0),
      myRole: me ? me.role : null,
      myRank,
    };
  }

  const api: ClanStore = {
    async getMyClan(userId: string): Promise<ClanProfile | null> {
      const mem = await client
        .from("clan_members")
        .select("clan_id, clans(id, name, slug, motto, description, batch_id, organization_id, status)")
        .eq("user_id", userId)
        .eq("status", "active")
        .maybeSingle();
      if (mem.error || !isRecord(mem.data)) return null;
      const clan: Record<string, unknown> = isRecord(mem.data.clans)
        ? mem.data.clans
        : {};
      if (!str(clan.id)) return null;
      return toProfile(clan, userId);
    },

    async getClan(id: string): Promise<ClanProfile | null> {
      const res = await client
        .from("clans")
        .select(
          "id, name, slug, motto, description, batch_id, organization_id, status",
        )
        .eq("id", id)
        .maybeSingle();
      if (res.error || !isRecord(res.data)) return null;
      const me = await client.auth.getUser();
      return toProfile(res.data, me.data.user?.id ?? "");
    },

    async getRoster(clanId: string): Promise<ClanRosterRow[]> {
      const res = await client.rpc("fn_clan_roster", { p_clan: clanId });
      if (res.error || !Array.isArray(res.data)) return [];
      return res.data.filter(isRecord).map((r) => ({
        userId: str(r.user_id),
        displayName: str(r.display_name, "Player"),
        rollNumber: str(r.roll_number),
        role: str(r.member_role, "member"),
        level: num(r.level, 1),
        xpTotal: num(r.xp_total),
        bestWpm: typeof r.best_wpm === "number" ? r.best_wpm : null,
        bestAccuracy: typeof r.best_accuracy === "number" ? r.best_accuracy : null,
        streakCurrent: num(r.streak_current),
        badgeCount: num(r.badge_count),
        contribution: num(r.contribution),
        isMe: r.is_me === true,
      }));
    },

    async getBoard(window: string): Promise<ClanBoardEntry[]> {
      const res = await client.rpc("fn_clan_board", {
        p_window: window,
        p_limit: 20,
      });
      if (res.error || !Array.isArray(res.data)) return [];
      return res.data
        .filter(isRecord)
        .map((r) => ({
          clanId: str(r.clan_id),
          name: str(r.clan_name),
          memberCount: num(r.member_count),
          totalPoints: num(r.total_points),
          rank: num(r.rank),
        }))
        .filter((r) => r.clanId.length > 0);
    },

    async getMissions(clanId: string): Promise<ClanMission[]> {
      const res = await client
        .from("clan_missions")
        .select(
          "id, mission_id, status, progress, period_start, missions(slug, title)",
        )
        .eq("clan_id", clanId)
        .order("created_at", { ascending: false });
      if (res.error || !Array.isArray(res.data)) return [];
      return res.data
        .filter(isRecord)
        .map((m) => {
          if (typeof m.id !== "string" || typeof m.mission_id !== "string") {
            return null;
          }
          const def: Record<string, unknown> = isRecord(m.missions)
            ? m.missions
            : {};
          const prog = isRecord(m.progress) ? m.progress : {};
          const list = Array.isArray(prog.objectives) ? prog.objectives : [];
          return {
            id: m.id,
            missionId: m.mission_id,
            slug: str(def.slug),
            title: str(def.title),
            status: str(m.status),
            objectives: list.filter(isRecord).map((o, i) => ({
              position: num(o.position, i),
              kind: str(o.kind),
              current: num(o.current),
              target: num(o.target, 1),
              completed: o.completed === true,
              participants: num(o.participants),
            })),
            periodStart: str(m.period_start),
          };
        })
        .filter((m): m is ClanMission => m !== null);
    },

    async startClanMission(id: string): Promise<void> {
      const res = await client.rpc("fn_start_clan_mission", { p_id: id });
      if (res.error) throw mapStoreError(res.error);
    },

    async syncClanMission(id: string): Promise<string> {
      const res = await client.rpc("fn_sync_clan_mission", { p_id: id });
      if (res.error || typeof res.data !== "string") {
        throw mapStoreError(res.error ?? new Error("SYNC_FAILED"));
      }
      return res.data;
    },

    async getHelpRequests(clanId: string): Promise<HelpRequest[]> {
      const res = await client
        .from("clan_help_requests")
        .select("id, clan_id, requester_user_id, context, requested, fulfilled, status, expires_at")
        .eq("clan_id", clanId)
        .order("created_at", { ascending: false });
      if (res.error || !Array.isArray(res.data)) return [];
      const me = await client.auth.getUser();
      const meId = me.data.user?.id ?? "";
      return res.data
        .filter(isRecord)
        .map((r) => ({
          id: str(r.id),
          clanId: str(r.clan_id),
          mine: str(r.requester_user_id) === meId,
          context: isRecord(r.context) ? r.context : {},
          requested: num(r.requested),
          fulfilled: num(r.fulfilled),
          status: str(r.status),
          expiresAt: str(r.expires_at),
        }))
        .filter((r) => r.id.length > 0);
    },

    async createHelpRequest(
      clanId: string,
      context: Record<string, unknown>,
      requested: number,
    ): Promise<string> {
      const res = await client.rpc("fn_create_help_request", {
        p_clan: clanId,
        p_context: context,
        p_requested: requested,
        p_ttl_hours: 48,
      });
      if (res.error || typeof res.data !== "string") {
        throw mapStoreError(res.error ?? new Error("HELP_FAILED"));
      }
      return res.data;
    },

    async contributeHelp(requestId: string, amount: number): Promise<void> {
      const res = await client.rpc("fn_contribute_help", {
        p_request: requestId,
        p_amount: amount,
      });
      if (res.error) throw mapStoreError(res.error);
    },

    async getActivity(clanId: string): Promise<ActivityItem[]> {
      const res = await client
        .from("clan_activity")
        .select("kind, summary, created_at")
        .eq("clan_id", clanId)
        .order("created_at", { ascending: false })
        .limit(20);
      if (res.error || !Array.isArray(res.data)) return [];
      return res.data
        .filter(isRecord)
        .map((a) => ({
          kind: str(a.kind),
          summary: isRecord(a.summary) ? a.summary : {},
          createdAt: str(a.created_at),
        }));
    },

    async listClans(): Promise<ClanProfile[]> {
      const res = await client
        .from("clans")
        .select("id, name, slug, motto, description, batch_id, organization_id, status")
        .order("created_at", { ascending: false });
      if (res.error || !Array.isArray(res.data)) return [];
      const me = await client.auth.getUser();
      const meId = me.data.user?.id ?? "";
      const out: ClanProfile[] = [];
      for (const c of res.data.filter(isRecord)) {
        const p = await toProfile(c, meId);
        if (p) out.push(p);
      }
      return out;
    },

    async setClanProfile(
      id: string,
      patch: Record<string, unknown>,
    ): Promise<void> {
      const res = await client.rpc("fn_set_clan_profile", {
        p_clan: id,
        p_patch: patch,
      });
      if (res.error) throw mapStoreError(res.error);
    },

    async setClanStatus(id: string, status: string): Promise<void> {
      const res = await client.rpc("fn_set_clan_status", {
        p_clan: id,
        p_status: status,
      });
      if (res.error) throw mapStoreError(res.error);
    },

    async assignRole(
      clanId: string,
      userId: string,
      role: string,
    ): Promise<void> {
      const res = await client.rpc("fn_assign_clan_role", {
        p_clan: clanId,
        p_user: userId,
        p_role: role,
      });
      if (res.error) throw mapStoreError(res.error);
    },

    async linkMission(clanId: string, missionId: string): Promise<string> {
      const res = await client.rpc("fn_link_clan_mission", {
        p_mission: missionId,
        p_clan: clanId,
        p_period_start: new Date().toISOString().slice(0, 10),
      });
      if (res.error || typeof res.data !== "string") {
        throw mapStoreError(res.error ?? new Error("LINK_FAILED"));
      }
      return res.data;
    },
  };
  return api;
}

interface MemoryClan {
  profile: ClanProfile;
  userId: string;
  roster: ClanRosterRow[];
  missions: ClanMission[];
  requests: HelpRequest[];
}

/** Offline store for unit/API tests. */
export function createMemoryClanStore(
  seed: { clans?: MemoryClan[] } = {},
): ClanStore & { __clans: MemoryClan[] } {
  const clans: MemoryClan[] = (seed.clans ?? []).map((c) => ({
    ...c,
    profile: { ...c.profile },
    roster: c.roster.map((r) => ({ ...r })),
    missions: c.missions.map((m) => ({ ...m })),
    requests: c.requests.map((r) => ({ ...r })),
  }));
  const tick = (): Promise<void> => Promise.resolve();
  const mine = (userId: string): MemoryClan | undefined =>
    clans.find((c) =>
      c.roster.some((r) => r.userId === userId),
    );

  return {
    __clans: clans,

    async getMyClan(userId: string): Promise<ClanProfile | null> {
      await tick();
      const c = mine(userId);
      if (!c) return null;
      const me = c.roster.find((r) => r.userId === userId) ?? null;
      return {
        ...c.profile,
        memberCount: c.roster.length,
        totalXp: c.roster.reduce((s, r) => s + r.contribution, 0),
        myRole: me ? me.role : null,
        myRank: me
          ? [...c.roster]
              .sort((a, b) => b.contribution - a.contribution)
              .indexOf(me) + 1
          : null,
      };
    },

    async getClan(id: string): Promise<ClanProfile | null> {
      await tick();
      const c = clans.find((x) => x.profile.id === id);
      return c ? { ...c.profile } : null;
    },

    async getRoster(clanId: string): Promise<ClanRosterRow[]> {
      await tick();
      return (
        clans.find((c) => c.profile.id === clanId)?.roster.map((r) => ({ ...r })) ??
        []
      );
    },

    async getBoard(): Promise<ClanBoardEntry[]> {
      await tick();
      return clans
        .map((c, i) => ({
          clanId: c.profile.id,
          name: c.profile.name,
          memberCount: c.roster.length,
          totalPoints: c.roster.reduce((s, r) => s + r.contribution, 0),
          rank: i + 1,
        }))
        .sort((a, b) => b.totalPoints - a.totalPoints)
        .map((e, i) => ({ ...e, rank: i + 1 }));
    },

    async getMissions(clanId: string): Promise<ClanMission[]> {
      await tick();
      return (
        clans.find((c) => c.profile.id === clanId)?.missions.map((m) => ({ ...m })) ??
        []
      );
    },

    async startClanMission(id: string): Promise<void> {
      await tick();
      for (const c of clans) {
        const m = c.missions.find((x) => x.id === id);
        if (!m) continue;
        if (m.status !== "available") throw new ConflictError("INVALID_STATE");
        m.status = "active";
        return;
      }
      throw new NotFoundError("NOT_FOUND");
    },

    async syncClanMission(id: string): Promise<string> {
      await tick();
      for (const c of clans) {
        const m = c.missions.find((x) => x.id === id);
        if (m) return m.status;
      }
      throw new NotFoundError("NOT_FOUND");
    },

    async getHelpRequests(clanId: string): Promise<HelpRequest[]> {
      await tick();
      return (
        clans.find((c) => c.profile.id === clanId)?.requests.map((r) => ({ ...r })) ??
        []
      );
    },

    async getActivity(): Promise<ActivityItem[]> {
      await tick();
      return [];
    },

    async createHelpRequest(
      clanId: string,
      _context: Record<string, unknown>,
      requested: number,
    ): Promise<string> {
      await tick();
      const c = clans.find((x) => x.profile.id === clanId);
      if (!c) throw new NotFoundError("NOT_FOUND");
      if (requested <= 0 || requested > 50) throw new ConflictError("MALFORMED");
      if (c.requests.some((r) => r.status === "open")) {
        throw new ConflictError("ALREADY_OPEN");
      }
      const n = String(c.requests.length + 1).padStart(12, "0");
      const id = `00000000-0000-4000-8000-${n}`;
      c.requests.push({
        id,
        clanId,
        mine: true,
        context: {},
        requested,
        fulfilled: 0,
        status: "open",
        expiresAt: new Date(Date.now() + 48 * 3600_000).toISOString(),
      });
      return id;
    },

    async contributeHelp(requestId: string, amount: number): Promise<void> {
      await tick();
      for (const c of clans) {
        const r = c.requests.find((x) => x.id === requestId);
        if (!r) continue;
        if (r.status !== "open" && r.status !== "partially_fulfilled") {
          throw new ConflictError("CLOSED");
        }
        if (amount <= 0) throw new ConflictError("MALFORMED");
        r.fulfilled = Math.min(r.requested, r.fulfilled + amount);
        r.status =
          r.fulfilled >= r.requested ? "fulfilled" : "partially_fulfilled";
        return;
      }
      throw new NotFoundError("NOT_FOUND");
    },

    async listClans(): Promise<ClanProfile[]> {
      await tick();
      return clans.map((c) => ({ ...c.profile }));
    },

    async setClanProfile(): Promise<void> {
      await tick();
    },

    async setClanStatus(): Promise<void> {
      await tick();
    },

    async assignRole(clanId: string, userId: string, role: string): Promise<void> {
      await tick();
      const c = clans.find((x) => x.profile.id === clanId);
      const m = c?.roster.find((r) => r.userId === userId);
      if (!c || !m) throw new NotFoundError("NOT_FOUND");
      if (role !== "leader" && role !== "co_leader" && role !== "member") {
        throw new ConflictError("MALFORMED");
      }
      m.role = role;
    },

    async linkMission(): Promise<string> {
      await tick();
      return "00000000-0000-4000-8000-000000000001";
    },
  };
}

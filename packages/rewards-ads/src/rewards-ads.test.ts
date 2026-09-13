/**
 * M17 rewards-ads domain tests: sessions, providers, policy gates.
 * DB-level session/grant cases live in supabase/tests/m17_ads_test.sql.
 */
import { describe, expect, it } from "vitest";
import {
  MockRewardProvider,
  OfferwallProvider,
  canTransitionSession,
  grantKey,
  isTerminalStatus,
  offerAllowed,
  recoveryAllowed,
  DEFAULT_POLICY,
} from "./index";

describe("session lifecycle", () => {
  it("maps the rewarded-ad state machine", () => {
    expect(canTransitionSession("offered", "opted_in")).toBe(true);
    expect(canTransitionSession("opted_in", "started")).toBe(true);
    expect(canTransitionSession("started", "completed")).toBe(true);
    expect(canTransitionSession("completed", "verified")).toBe(true);
    expect(canTransitionSession("verified", "rewarded")).toBe(true);
    expect(canTransitionSession("offered", "rewarded")).toBe(false);
    expect(canTransitionSession("rewarded", "failed")).toBe(false);
    expect(canTransitionSession("started", "verified")).toBe(false);
    expect(isTerminalStatus("rewarded")).toBe(true);
    expect(isTerminalStatus("started")).toBe(false);
  });
  it("builds deterministic grant keys", () => {
    expect(grantKey("mock", "ref-1", "user-1")).toBe(
      "rewarded-ad:mock:ref-1:user-1:v1",
    );
    expect(grantKey("mock", "ref-1", "user-1")).toBe(
      grantKey("mock", "ref-1", "user-1"),
    );
  });
});

describe("mock provider", () => {
  it("signs and verifies completions without trusting booleans", async () => {
    const provider = new MockRewardProvider("test-secret-12345678");
    expect(provider.isConfigured()).toBe(true);
    const event = await provider.signCompletion("sess-1", "mock:sess-1", 1000);
    expect((await provider.verifyCompletion(event)).valid).toBe(true);
    expect(
      (
        await provider.verifyCompletion({
          ...event,
          signature: "forged",
        })
      ).valid,
    ).toBe(false);
    expect(
      (
        await provider.verifyCompletion({
          ...event,
          sessionId: "sess-2",
        })
      ).valid,
    ).toBe(false);
    expect(new MockRewardProvider("short").isConfigured()).toBe(false);
  });
});

describe("offerwall provider", () => {
  it("stays fail-closed without a verifiable callback", async () => {
    const unconfigured = new OfferwallProvider(null);
    expect(unconfigured.isConfigured()).toBe(false);
    const configured = new OfferwallProvider("pub-1234567890123456");
    expect(configured.isConfigured()).toBe(true);
    expect((await configured.verifyCompletion()).verifiable).toBe(false);
  });
});

describe("policy gates", () => {
  it("enforces disabled, limits, and cooldowns", () => {
    expect(
      offerAllowed(DEFAULT_POLICY, {
        sessionsToday: 0,
        rewardsToday: 0,
        minutesSinceLastSession: null,
      }).reason,
    ).toBe("DISABLED");
    const on = { ...DEFAULT_POLICY, enabled: true };
    expect(
      offerAllowed(on, { sessionsToday: 5, rewardsToday: 0, minutesSinceLastSession: null }).reason,
    ).toBe("DAILY_LIMIT");
    expect(
      offerAllowed(on, { sessionsToday: 0, rewardsToday: 5, minutesSinceLastSession: null }).reason,
    ).toBe("REWARD_CAP");
    expect(
      offerAllowed(on, { sessionsToday: 0, rewardsToday: 0, minutesSinceLastSession: 10 }).reason,
    ).toBe("COOLDOWN");
    expect(
      offerAllowed(on, { sessionsToday: 0, rewardsToday: 0, minutesSinceLastSession: 61 }).ok,
    ).toBe(true);
  });
  it("gates streak recovery without hard-coded ratios", () => {
    const policy = DEFAULT_POLICY.recovery;
    expect(
      recoveryAllowed(policy, {
        lapsedDays: 0,
        recoveriesUsed: 0,
        hoursSinceLastRecovery: null,
        alreadyRecoveredDates: 0,
      }).reason,
    ).toBe("NO_LAPSE");
    expect(
      recoveryAllowed(policy, {
        lapsedDays: 5,
        recoveriesUsed: 0,
        hoursSinceLastRecovery: null,
        alreadyRecoveredDates: 0,
      }),
    ).toMatchObject({ ok: true, days: 2 });
    expect(
      recoveryAllowed(policy, {
        lapsedDays: 1,
        recoveriesUsed: 4,
        hoursSinceLastRecovery: null,
        alreadyRecoveredDates: 0,
      }).reason,
    ).toBe("RECOVERY_CAP");
  });
});

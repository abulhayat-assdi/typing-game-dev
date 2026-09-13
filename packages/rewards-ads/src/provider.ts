/**
 * Provider abstraction (M17). The economy depends on this interface,
 * never on a provider SDK. Two implementations:
 *
 * - Google Offerwall: the documented web product. Google renders the
 *   choice + ad + entitlement itself; it exposes NO per-completion
 *   server callback suitable for custom item grants, so verify()
 *   always reports unverifiable and the flow stays fail-closed.
 * - Mock (development only): HMAC-signed completion tokens the server
 *   verifies — full local loop without trusting a bare boolean.
 */
import type { RewardProviderName } from "./types";

export interface ProviderCompletion {
  provider: RewardProviderName;
  sessionId: string;
  providerReference: string;
  completedAtMs: number;
  signature: string;
}

export interface VerificationResult {
  verifiable: boolean;
  valid: boolean;
  reason: string;
}

export interface RewardProvider {
  readonly name: RewardProviderName;
  isConfigured(): boolean;
  issueReference(sessionId: string): string;
  verifyCompletion(event: ProviderCompletion): Promise<VerificationResult>;
}

function toHex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await globalThis.crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await globalThis.crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(message),
  );
  return toHex(sig);
}

export function mockTokenMessage(
  sessionId: string,
  providerReference: string,
  completedAtMs: number,
): string {
  return `mock:${sessionId}:${providerReference}:${String(completedAtMs)}`;
}

/** Development-only mock provider (never production). */
export class MockRewardProvider implements RewardProvider {
  readonly name: RewardProviderName = "mock";
  private readonly secret: string;

  constructor(secret: string) {
    this.secret = secret;
  }

  isConfigured(): boolean {
    return this.secret.length >= 16;
  }

  issueReference(sessionId: string): string {
    return `mock:${sessionId}`;
  }

  async signCompletion(
    sessionId: string,
    providerReference: string,
    completedAtMs: number,
  ): Promise<ProviderCompletion> {
    return {
      provider: "mock",
      sessionId,
      providerReference,
      completedAtMs,
      signature: await hmacHex(
        this.secret,
        mockTokenMessage(sessionId, providerReference, completedAtMs),
      ),
    };
  }

  async verifyCompletion(
    event: ProviderCompletion,
  ): Promise<VerificationResult> {
    if (event.provider !== "mock") {
      return { verifiable: true, valid: false, reason: "WRONG_PROVIDER" };
    }
    if (!event.sessionId || !event.providerReference) {
      return { verifiable: true, valid: false, reason: "MALFORMED" };
    }
    const expected = await hmacHex(
      this.secret,
      mockTokenMessage(
        event.sessionId,
        event.providerReference,
        event.completedAtMs,
      ),
    );
    if (expected !== event.signature) {
      return { verifiable: true, valid: false, reason: "BAD_SIGNATURE" };
    }
    return { verifiable: true, valid: true, reason: "OK" };
  }
}

/**
 * Google Offerwall integration holder. Offerwall (Privacy & messaging
 * builder, metering, dismiss rules) owns the entire choice → ad →
 * entitlement interaction; Google documents no per-completion server
 * callback for custom in-app rewards. Verification is therefore
 * provider-managed, and custom grants stay disabled (fail closed)
 * until/unless Google ships a verifiable hook.
 */
export class OfferwallProvider implements RewardProvider {
  readonly name: RewardProviderName = "google_offerwall";
  private readonly publisherId: string | null;

  constructor(publisherId: string | null) {
    this.publisherId = publisherId;
  }

  isConfigured(): boolean {
    return (
      this.publisherId !== null &&
      this.publisherId.startsWith("pub-") &&
      this.publisherId.length > 8
    );
  }

  issueReference(sessionId: string): string {
    return `offerwall:${sessionId}`;
  }

  async verifyCompletion(): Promise<VerificationResult> {
    return await Promise.resolve({
      verifiable: false,
      valid: false,
      reason: "PROVIDER_MANAGED",
    });
  }
}

export function createProvider(
  name: RewardProviderName,
  options: { secret?: string; publisherId?: string | null },
): RewardProvider {
  if (name === "mock") {
    return new MockRewardProvider(options.secret ?? "");
  }
  return new OfferwallProvider(options.publisherId ?? null);
}

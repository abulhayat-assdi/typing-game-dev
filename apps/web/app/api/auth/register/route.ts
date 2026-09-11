/**
 * POST /api/auth/register — completes student registration AFTER the client
 * created the Supabase Auth user (signUp). Calls the atomic
 * fn_register_with_batch as the user (their JWT → auth.uid() inside).
 * Business logic stays in SQL; this route validates shape + maps errors to
 * localized-safe codes (never leaks internals or account existence).
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSession, unauthorized } from "../../../../lib/server/auth";
import { userDbClient } from "../../../../lib/server/auth";
import enErrors from "../../../../messages/en/errors.json";

const TRACKS = ["beginner", "intermediate", "expert"] as const;

function fail(code: string, status: number): NextResponse {
  return NextResponse.json({ error: code, message: enErrors.requiredField }, { status });
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export async function handleRegister(
  body: unknown,
  deps: {
    session: { userId: string } | null;
    register: (args: {
      joinCode: string;
      rollNumber: string;
      fullName: string;
      skillTrack: string;
    }) => Promise<string>;
  },
): Promise<Response> {
  if (!deps.session) return unauthorized(enErrors.unauthorizedDescription);
  if (!isRecord(body)) return fail("MALFORMED", 400);
  const joinCode = typeof body.joinCode === "string" ? body.joinCode.trim() : "";
  const rollNumber = typeof body.rollNumber === "string" ? body.rollNumber.trim() : "";
  const fullName = typeof body.fullName === "string" ? body.fullName.trim() : "";
  const skillTrack = typeof body.skillTrack === "string" ? body.skillTrack : "";
  if (!joinCode || !rollNumber || !fullName) return fail("MALFORMED", 400);
  if (!(TRACKS as readonly string[]).includes(skillTrack)) {
    return fail("MALFORMED", 400);
  }
  try {
    await deps.register({ joinCode, rollNumber, fullName, skillTrack });
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "REGISTER_FAILED";
    if (message.includes("ROLL_TAKEN")) {
      return NextResponse.json(
        { error: "ROLL_TAKEN", message: enErrors.valuesMismatch },
        { status: 409 },
      );
    }
    if (message.includes("ALREADY_ENROLLED")) {
      return NextResponse.json(
        { error: "ALREADY_ENROLLED", message: enErrors.valuesMismatch },
        { status: 409 },
      );
    }
    if (message.includes("INVALID_JOIN_CODE")) {
      return NextResponse.json(
        { error: "INVALID_JOIN_CODE", message: enErrors.valuesMismatch },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { error: "REGISTER_FAILED", message: enErrors.genericDescription },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest): Promise<Response> {
  const session = await getSession();
  const client = await userDbClient();
  if (!client) {
    return NextResponse.json(
      { error: "SERVICE_UNAVAILABLE", message: enErrors.storageUnavailable },
      { status: 503 },
    );
  }
  let body: unknown = {};
  try {
    body = (await req.json()) as unknown;
  } catch {
    body = {};
  }
  return handleRegister(body, {
    session,
    register: async (args) => {
      const res = await client.rpc("fn_register_with_batch", {
        p_join_code: args.joinCode,
        p_roll_number: args.rollNumber,
        p_full_name: args.fullName,
        p_skill_track: args.skillTrack,
      });
      if (res.error || typeof res.data !== "string") {
        throw new Error(
          typeof res.error?.message === "string" ? res.error.message : "REGISTER_FAILED",
        );
      }
      return res.data;
    },
  });
}

import { NextResponse } from "next/server";

/** Liveness probe for Workers + deploy smoke tests. No secrets, no DB. */
export function GET() {
  return NextResponse.json(
    { status: "ok", service: "typing-adventure-platform", milestone: "M1" },
    { status: 200 },
  );
}

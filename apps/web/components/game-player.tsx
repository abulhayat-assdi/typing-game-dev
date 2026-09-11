"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, GameHudShell } from "@tap/ui";
import { createTypingSession, type TypingSession } from "@tap/game-engine";
import type { ProgressionSummary } from "../lib/server/attempt-store";

export interface PlayStrings {
  tapToFocus: string;
  timeLeft: string;
  wpm: string;
  accuracy: string;
  combo: string;
  progress: string;
  pause: string;
  resume: string;
  restart: string;
  quit: string;
  submitting: string;
  expired: string;
  failedToSubmit: string;
  focusLost: string;
  screenReaderProgress: string;
}

export interface SubmitSnapshot {
  typedText: string;
  elapsedMs: number;
  corrections: number;
  errorStrokes: number;
  incorrectChars: number;
}

export interface ValidatedResult {
  score: number;
  accuracy: number;
  effectiveWpm: number;
  progression: ProgressionSummary | null;
}

type Phase =
  | "ready"
  | "playing"
  | "paused"
  | "submitting"
  | "done"
  | "rejected"
  | "expired"
  | "error";

/**
 * Reusable play shell (M6). ONE shell for every game: definition in, server
 * verdict out. Typing state lives in refs (no app-wide rerenders, no
 * per-keystroke network); the ONLY request is the final submit.
 */
export function GamePlayer({
  attemptId,
  gameSlug,
  gameTitle,
  expectedText,
  timingKind,
  timingLimit,
  strings: s,
  backHref,
  onDone,
}: {
  attemptId: string;
  gameSlug: string;
  gameTitle: string;
  expectedText: string;
  timingKind: string;
  timingLimit: number | null;
  strings: PlayStrings;
  backHref: string;
  onDone: (result: ValidatedResult | null, snap: SubmitSnapshot, extra: { rejectedReason: string | null; expired: boolean }) => void;
}) {
  const sessionRef = useRef<TypingSession | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const submittedRef = useRef(false);
  const endAtRef = useRef(0);
  const [phase, setPhase] = useState<Phase>("ready");
  const [tick, setTick] = useState(0);
  const [focused, setFocused] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(timingLimit ?? 0);
  const [announcement, setAnnouncement] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);

  const expected = useMemo(() => Array.from(expectedText), [expectedText]);

  if (!sessionRef.current) {
    sessionRef.current = createTypingSession(expectedText, {
      allowBackspace: true,
      caseSensitive: true,
    });
  }

  const snap = sessionRef.current.snapshot();
  const typedChars = useMemo(
    () => Array.from(sessionRef.current?.getTypedText() ?? ""),
    [tick],
  );
  const minutes = snap.elapsedMs > 0 ? snap.elapsedMs / 60000 : 0;
  const liveWpm = minutes > 0 ? snap.correctChars / 5 / minutes : 0;
  const liveAcc =
    snap.typedLength > 0 ? (snap.correctChars / snap.typedLength) * 100 : 100;

  const focusInput = (): void => {
    inputRef.current?.focus({ preventScroll: true });
  };

  async function submit(): Promise<void> {
    if (submittedRef.current) return;
    submittedRef.current = true;
    const session = sessionRef.current;
    if (!session) return;
    const final = session.snapshot();
    const payload = {
      typedText: session.getTypedText(),
      elapsedMs: final.elapsedMs,
      corrections: final.corrections,
      errorStrokes: final.errorStrokes,
    };
    setPhase("submitting");
    setAnnouncement(s.submitting);
    try {
      const res = await fetch(
        `/api/games/${encodeURIComponent(gameSlug)}/attempts/${encodeURIComponent(attemptId)}/submit`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      if (res.status === 410) {
        setPhase("expired");
        setAnnouncement(s.expired);
        onDone(null, { ...payload, incorrectChars: final.incorrectChars }, { rejectedReason: null, expired: true });
        return;
      }
      if (res.status === 409) {
        // Rare race (double submit): the run is recorded; stop here with
        // links instead of inventing a result.
        setPhase("error");
        setSubmitError(s.failedToSubmit);
        setAnnouncement(s.failedToSubmit);
        return;
      }
      if (!res.ok) throw new Error(`submit ${String(res.status)}`);
      const body = (await res.json()) as {
        status: string;
        score?: number;
        accuracy?: number;
        effectiveWpm?: number;
        reason?: string | null;
        progression?: ValidatedResult["progression"];
      };
      if (body.status === "validated") {
        setPhase("done");
        setAnnouncement(s.screenReaderProgress);
        onDone(
          {
            score: body.score ?? 0,
            accuracy: body.accuracy ?? 0,
            effectiveWpm: body.effectiveWpm ?? 0,
            progression: body.progression ?? null,
          },
          { ...payload, incorrectChars: final.incorrectChars },
          { rejectedReason: null, expired: false },
        );
      } else {
        setPhase("rejected");
        onDone(null, { ...payload, incorrectChars: final.incorrectChars }, { rejectedReason: body.reason ?? "REJECTED", expired: false });
      }
    } catch {
      submittedRef.current = false;
      setPhase("error");
      setSubmitError(s.failedToSubmit);
      setAnnouncement(s.failedToSubmit);
    }
  }
  const submitRef = useRef(submit);
  submitRef.current = submit;

  // Countdown clock (display only — server expiry is authoritative).
  useEffect(() => {
    if (timingKind !== "countdown" || !timingLimit || phase !== "playing") {
      return;
    }
    if (!endAtRef.current) {
      endAtRef.current = Date.now() + timingLimit * 1000;
    }
    const id = window.setInterval(() => {
      const left = Math.max(
        0,
        Math.ceil((endAtRef.current - Date.now()) / 1000),
      );
      setSecondsLeft(left);
      if (left <= 0) {
        window.clearInterval(id);
        setAnnouncement(s.expired);
        void submitRef.current();
      }
    }, 250);
    return () => { window.clearInterval(id); };
  }, [phase, timingKind, timingLimit, s.expired]);

  function feedKey(key: string): void {
    const session = sessionRef.current;
    if (!session || phase === "submitting" || phase === "done") return;
    if (phase === "ready" || phase === "paused") setPhase("playing");
    const outcome = session.input(key, Date.now());
    setTick((t) => t + 1);
    if (outcome.accepted && outcome.done) {
      setAnnouncement(s.screenReaderProgress);
      void submitRef.current();
    }
  }

  function feedBackspace(): void {
    const session = sessionRef.current;
    if (!session || phase === "submitting" || phase === "done") return;
    if (phase === "ready" || phase === "paused") setPhase("playing");
    session.backspace(Date.now());
    setTick((t) => t + 1);
  }

  function restart(): void {
    sessionRef.current = createTypingSession(expectedText, {
      allowBackspace: true,
      caseSensitive: true,
    });
    endAtRef.current = 0;
    submittedRef.current = false;
    setSecondsLeft(timingLimit ?? 0);
    setSubmitError(null);
    setPhase("ready");
    setTick((t) => t + 1);
    focusInput();
  }

  const currentChar = expected[typedChars.length] ?? "";
  const showPause = timingKind === "untimed" && (phase === "playing" || phase === "paused");

  return (
    <div className="flex flex-col gap-4">
      <GameHudShell
        label={gameTitle}
        score={<span>{Math.round(liveWpm)} {s.wpm}</span>}
        accuracy={<span>{Math.round(liveAcc)}%</span>}
        streak={snap.combo > 1 ? <span>{s.combo}: {snap.combo}</span> : undefined}
        timer={
          timingKind === "countdown" && timingLimit ? (
            <span>{s.timeLeft.replace("{seconds}", String(secondsLeft))}</span>
          ) : undefined
        }
        actions={
          <>
            {showPause ? (
              <button
                type="button"
                className="tap-btn tap-btn-secondary tap-btn-sm"
                onClick={() => {
                  setPhase(phase === "playing" ? "paused" : "playing");
                  if (phase === "paused") focusInput();
                }}
              >
                {phase === "playing" ? s.pause : s.resume}
              </button>
            ) : null}
            <button
              type="button"
              className="tap-btn tap-btn-secondary tap-btn-sm"
              onClick={restart}
              disabled={phase === "submitting"}
            >
              {s.restart}
            </button>
            <a href={backHref} className="tap-btn tap-btn-ghost tap-btn-sm">
              {s.quit}
            </a>
          </>
        }
      >
        <div className="w-full">
          <div
            className="tap-preview"
            role="textbox"
            aria-label={`${gameTitle}. ${s.tapToFocus}`}
            aria-readonly="true"
            tabIndex={-1}
            onClick={focusInput}
            onKeyDown={(e) => {
              if (e.key === "Backspace") {
                e.preventDefault();
                feedBackspace();
              }
            }}
          >
            <p className="max-w-2xl px-6 font-mono text-xl leading-9 md:text-2xl md:leading-10">
              {expected.map((ch, i) => {
                const typed = typedChars[i];
                const cls =
                  typed === undefined
                    ? i === typedChars.length
                      ? "tap-char-current"
                      : "tap-char-todo"
                    : typed === ch
                      ? "tap-char-ok"
                      : "tap-char-bad";
                return (
                  <span key={i} className={cls}>
                    {ch === " " ? " " : ch}
                  </span>
                );
              })}
            </p>
            {!focused && phase !== "done" ? (
              <div className="tap-preview-overlay">
                <button
                  type="button"
                  className="tap-btn tap-btn-primary tap-btn-md"
                  onClick={focusInput}
                >
                  {phase === "paused" ? s.resume : s.tapToFocus}
                </button>
              </div>
            ) : null}
          </div>
          <input
            ref={inputRef}
            value=""
            onChange={(e) => {
              const v = e.target.value;
              e.target.value = "";
              if (!v) return;
              for (const ch of Array.from(v).slice(0, 8)) feedKey(ch);
            }}
            onKeyDown={(e) => {
              if (e.key === "Backspace") {
                e.preventDefault();
                feedBackspace();
              }
              if (e.key === "Tab") e.preventDefault();
            }}
            onFocus={() => { setFocused(true); }}
            onBlur={() => {
              setFocused(false);
              if (phase === "playing") setAnnouncement(s.focusLost);
            }}
            className="sr-only"
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            aria-label={s.tapToFocus}
          />
          <div className="mt-3 flex items-center justify-between gap-3">
            <p className="text-sm text-ink-muted">
              {s.progress}: {Math.round(snap.completionPct)}%
            </p>
            {currentChar ? (
              <p className="text-sm">
                <kbd className="tap-kbd">{currentChar === " " ? "Space" : currentChar}</kbd>
              </p>
            ) : null}
          </div>
        </div>
      </GameHudShell>

      <p role="status" aria-live="polite" className="tap-sr-only">
        {announcement}
      </p>

      {submitError ? <Alert tone="danger">{submitError}</Alert> : null}
      {phase === "error" ? (
        <button
          type="button"
          className="tap-btn tap-btn-secondary tap-btn-md self-start"
          onClick={() => {
            setSubmitError(null);
            setPhase("playing");
            focusInput();
          }}
        >
          {s.resume}
        </button>
      ) : null}
    </div>
  );
}

"use client";

/**
 * Client-side anti-cheat monitors. Browsers cannot fully prevent cheating
 * (e.g. a phone or second device), so this exam is meant to run on lab
 * machines under physical supervision. Prefer Safe Exam Browser for stricter lockdown.
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

type Props = {
  enabled: boolean;
  maxViolations: number;
  onAutoSubmit: () => void;
  children: ReactNode;
};

type StrikeState = {
  open: boolean;
  count: number;
  max: number;
  message: string;
};

export function ProctorGuard({
  enabled,
  maxViolations,
  onAutoSubmit,
  children,
}: Props) {
  const [strike, setStrike] = useState<StrikeState | null>(null);
  const [fsBlock, setFsBlock] = useState(false);
  const lastFocusStrike = useRef(0);
  const reporting = useRef(false);

  const report = useCallback(
    async (
      type: string,
      detail?: string,
      countStrike?: boolean
    ): Promise<{ autoSubmitted: boolean; strikeCount: number } | null> => {
      if (reporting.current) return null;
      reporting.current = true;
      try {
        const res = await fetch("/api/attempt/event", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type, detail, countStrike }),
        });
        if (!res.ok) return null;
        const data = await res.json();
        if (data.autoSubmitted) {
          onAutoSubmit();
        } else if (countStrike !== false && data.strikeCount != null) {
          // Only show modal for strike events
        }
        return data;
      } catch {
        return null;
      } finally {
        reporting.current = false;
      }
    },
    [onAutoSubmit]
  );

  const strikeAndWarn = useCallback(
    async (type: string, detail?: string) => {
      const now = Date.now();
      // Debounce blur + visibility so they count once
      if (
        (type === "TAB_HIDDEN" || type === "WINDOW_BLUR") &&
        now - lastFocusStrike.current < 1500
      ) {
        await report(type, detail, false);
        return;
      }
      if (type === "TAB_HIDDEN" || type === "WINDOW_BLUR") {
        lastFocusStrike.current = now;
      }

      const data = await report(type, detail, true);
      if (!data) return;
      if (data.autoSubmitted) return;
      setStrike({
        open: true,
        count: data.strikeCount,
        max: maxViolations,
        message: `Strike ${data.strikeCount} of ${maxViolations}. Return to the exam.`,
      });
    },
    [maxViolations, report]
  );

  useEffect(() => {
    if (!enabled) return;

    const onVis = () => {
      if (document.visibilityState === "hidden") {
        void strikeAndWarn("TAB_HIDDEN", "document.hidden");
      }
    };
    const onBlur = () => {
      void strikeAndWarn("WINDOW_BLUR", "window.blur");
    };
    const onFs = () => {
      if (!document.fullscreenElement) {
        setFsBlock(true);
        void strikeAndWarn("FULLSCREEN_EXIT");
      } else {
        setFsBlock(false);
      }
    };
    const blockClipboard = (e: Event) => {
      e.preventDefault();
      void report("CLIPBOARD", e.type, false);
    };
    const onContext = (e: Event) => {
      e.preventDefault();
      void report("CONTEXT_MENU", "right-click", false);
    };
    const onKey = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      const ctrl = e.ctrlKey || e.metaKey;
      const blocked =
        e.key === "F12" ||
        e.key === "PrintScreen" ||
        (ctrl && ["c", "v", "x", "p", "s", "u", "a"].includes(key)) ||
        (ctrl && e.shiftKey && ["i", "j", "c"].includes(key));
      if (blocked) {
        e.preventDefault();
        void report("SHORTCUT", e.key, false);
      }
    };
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      void report("RELOAD_OR_CLOSE", "beforeunload", false);
      e.preventDefault();
      e.returnValue = "";
    };

    // DevTools heuristic
    const dtInterval = window.setInterval(() => {
      const widthGap = window.outerWidth - window.innerWidth;
      const heightGap = window.outerHeight - window.innerHeight;
      if (widthGap > 160 || heightGap > 160) {
        void report("DEVTOOLS_SUSPECTED", `gap w=${widthGap} h=${heightGap}`, true).then(
          (data) => {
            if (data && !data.autoSubmitted) {
              setStrike({
                open: true,
                count: data.strikeCount,
                max: maxViolations,
                message: `Strike ${data.strikeCount} of ${maxViolations}. Return to the exam.`,
              });
            }
          }
        );
      }
      const t0 = performance.now();
      // eslint-disable-next-line no-debugger
      debugger;
      if (performance.now() - t0 > 100) {
        void report("DEVTOOLS_SUSPECTED", "debugger timing", true);
      }
    }, 4000);

    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("blur", onBlur);
    document.addEventListener("fullscreenchange", onFs);
    document.addEventListener("copy", blockClipboard);
    document.addEventListener("cut", blockClipboard);
    document.addEventListener("paste", blockClipboard);
    document.addEventListener("contextmenu", onContext);
    window.addEventListener("keydown", onKey);
    window.addEventListener("beforeunload", onBeforeUnload);

    return () => {
      clearInterval(dtInterval);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("fullscreenchange", onFs);
      document.removeEventListener("copy", blockClipboard);
      document.removeEventListener("cut", blockClipboard);
      document.removeEventListener("paste", blockClipboard);
      document.removeEventListener("contextmenu", onContext);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [enabled, maxViolations, report, strikeAndWarn]);

  async function restoreFullscreen() {
    try {
      await document.documentElement.requestFullscreen();
      setFsBlock(false);
    } catch {
      /* user gesture may be required */
    }
  }

  return (
    <>
      {children}
      {fsBlock && enabled && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6 text-white"
          role="alertdialog"
          aria-modal="true"
        >
          <div className="max-w-md text-center">
            <h2 className="text-2xl font-semibold">Fullscreen required</h2>
            <p className="mt-2 text-sm opacity-90">
              Leaving fullscreen counts as a strike. Return to fullscreen to
              continue.
            </p>
            <button
              type="button"
              className="btn btn-primary mt-6"
              onClick={restoreFullscreen}
            >
              Restore fullscreen
            </button>
          </div>
        </div>
      )}
      {strike?.open && enabled && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/85 p-6 text-white"
          role="alertdialog"
          aria-modal="true"
        >
          <div className="max-w-md text-center">
            <h2 className="text-2xl font-semibold text-amber-300">
              Warning
            </h2>
            <p className="mt-3 text-lg">{strike.message}</p>
            <button
              type="button"
              className="btn btn-primary mt-6"
              onClick={() => setStrike(null)}
            >
              I understand — continue
            </button>
          </div>
        </div>
      )}
    </>
  );
}

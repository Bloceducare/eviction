export const EXAM_STATUS = ["DRAFT", "OPEN", "RUNNING", "CLOSED"] as const;
export type ExamStatus = (typeof EXAM_STATUS)[number];

export const ATTEMPT_STATUS = [
  "IN_PROGRESS",
  "SUBMITTED",
  "AUTO_SUBMITTED",
] as const;
export type AttemptStatus = (typeof ATTEMPT_STATUS)[number];

export const VIOLATION_TYPES = [
  "TAB_HIDDEN",
  "WINDOW_BLUR",
  "FULLSCREEN_EXIT",
  "CLIPBOARD",
  "CONTEXT_MENU",
  "SHORTCUT",
  "DEVTOOLS_SUSPECTED",
  "DUPLICATE_SESSION",
  "OFFLINE",
  "RELOAD_OR_CLOSE",
] as const;
export type ViolationType = (typeof VIOLATION_TYPES)[number];

/** Violations that count as strikes (server-side). */
export const STRIKE_TYPES = new Set<string>([
  "TAB_HIDDEN",
  "WINDOW_BLUR",
  "FULLSCREEN_EXIT",
  "DEVTOOLS_SUSPECTED",
]);

// (fork) Time guard of the studio tests that check what a trial or a candidate check computes, not how fast.
// The server's own budget (TRIAL_LIMITS.timeoutMs, check.js's 20 s, [ASSUMED]) stays as it is; these tests give the
// bench / checker this guard instead, and a test that runs N trials gets N × it as its own timeout. A 2 s bond trial
// took 36-88 s on a fully loaded machine (2026-11-11), past both the 20 s budget and WORKER_LOAD_MS (60 s); it only
// stops a real hang. Tests that check the budget itself (timeoutMs 1, 20, 30, 400, 1500) keep their own.
export const STUDIO_TRIAL_MS = 180_000;

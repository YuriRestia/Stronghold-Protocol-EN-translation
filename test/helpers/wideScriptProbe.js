// (fork) Side-effect import for test files whose script plugins are probed only to get past registration: it must be the
// FIRST import, so it runs before server/plugins/scriptPreflight.js reads SP_SCRIPT_PROBE_MS once at load. The server's
// 5 s default stays as it is (test/plugins/script-review.test.js checks it and the ceiling itself). Under load one honest
// probe of the script template took over 5 s (2026-11-11, four busy cores), so these files take the widest ceiling the
// setting allows; it only stops a real hang. Child processes that copy process.env (the CLI test) get it too.
export const WIDE_PROBE_MS = '60000';
process.env.SP_SCRIPT_PROBE_MS ??= WIDE_PROBE_MS;

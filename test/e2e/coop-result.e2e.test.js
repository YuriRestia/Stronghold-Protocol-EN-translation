// Real-server browser E2E, result: a fast-timer solo run to the RESULT screen and back to the room — one of the four runs of test/e2e/coopFlows.mjs (DESIGN §11 "Browser E2E"),
// one per file so a browser run gives them parallel lanes. SP_E2E=1 node --test test/e2e/coop-result.e2e.test.js
import { test, describe } from 'node:test';
import { registerCoopRun } from './coopFlows.mjs';

registerCoopRun('result', { describe, test });

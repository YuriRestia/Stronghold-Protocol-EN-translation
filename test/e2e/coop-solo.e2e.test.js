// Real-server browser E2E, solo: 独立模拟 (绝境) through round 3 incl. the solo 机变 — one of the four runs of test/e2e/coopFlows.mjs (DESIGN §11 "Browser E2E"),
// one per file so a browser run gives them parallel lanes. SP_E2E=1 node --test test/e2e/coop-solo.e2e.test.js
import { test, describe } from 'node:test';
import { registerCoopRun } from './coopFlows.mjs';

registerCoopRun('solo', { describe, test });

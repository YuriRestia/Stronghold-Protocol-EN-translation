// Real-server browser E2E, coop: 2 humans + 1 AI through the rounds — one of the four runs of test/e2e/coopFlows.mjs (DESIGN §11 "Browser E2E"),
// one per file so a browser run gives them parallel lanes. SP_E2E=1 node --test test/e2e/coop-coop.e2e.test.js
import { test, describe } from 'node:test';
import { registerCoopRun } from './coopFlows.mjs';

registerCoopRun('coop', { describe, test });

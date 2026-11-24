## 2026-11-24

### CI runs on Node 24

- The eight test jobs, lint/typecheck and the golden check (and the manual golden refresh) run on Node 24. Each test
  job uploads its JUnit report for 3 days; Node 24's report names each test's file, so ci-shards.json is re-weighed
  from it.
- A temporary Node 22 job keeps the CI guards and the plugin sandbox tests on the version the live servers still run;
  it goes once they run 24.
- Before: the whole suite ran on Node 22 and Node 24 ran only the CI guards.

Kind: internal

Server cost: none

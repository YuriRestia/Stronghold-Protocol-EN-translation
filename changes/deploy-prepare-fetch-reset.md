## 2026-11-13

### Deploy prepare moves the checkout to the release commit

- `prepare` fetches and resets the server checkout to the exact release commit instead of a fast-forward pull, and refuses without changing anything when a tracked file there has local changes.

Kind: internal

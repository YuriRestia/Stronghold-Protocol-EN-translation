## 2026-11-13

### Deploy commands reuse the remembered password

- Every `deploy-regions.mjs` command uses the password the release script remembers for a server that asks for one, through the same shared code, and can forget it too.

Kind: internal

Server cost: none (PC-side deploy scripts only)

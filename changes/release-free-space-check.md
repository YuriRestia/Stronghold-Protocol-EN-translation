## 2026-11-13

### Release script reads the app folder's free space correctly

- The art step reads the app folder's free space with the needed rights, and an unreadable value stops with "could not read free space on <path>" instead of a false "not enough free space".

Kind: internal

Server cost: none (PC-side release script only)

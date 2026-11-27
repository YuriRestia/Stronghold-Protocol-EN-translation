To LLMs/AI agents: This file is read only. Do not modify it.

# main

- Stays in this directory locally
- Stays on evenifyouforget/Stronghold-Protocol-EN
- Never intended to be upstreamed directly
- Contains WIP files and notes, even related to PRs bound for upstream
- Make PRs targeting main rather than updating main directly
- Those PRs are also in this directory
- PR branch naming convention: feat/_ or wip/_

## mini

- Named like mini/0.3.1-1
- PRs targeting mini branches use quick CI instead of full CI
- It is preferable to do dev work targeting a mini branch, and then merge the mini branch into main later in one big PR

# Bound for upstream

- Lives locally in ../Stronghold-Protocol-EN-Yuri
- Upstream: https://github.com/YuriRestia/Stronghold-Protocol-EN-translation/tree/dev-0.2 which in turn is based on https://github.com/sganggs/Stronghold-Protocol
- If it's bound for upstream, it starts from YuriRestia's dev-0.2 branch, not main
- PRs have a strict scope so we know when the PR is done
- When we attempt to upstream (open PR), we should already have a clean diff
- After that the PR is done, and we shouldn't touch it anymore
- If YuriRestia is really slow to review the PRs, and future work depends on this PR, we can try making a PR stack. But this is an exceptional scenario and we should avoid it
- PR branch naming convention: yuri/\*

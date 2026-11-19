# Qodefest Hack 2026

Team workspace for **Qodefest Hack 2026**.

## Repository layout

| Path | What it is |
| --- | --- |
| `Reference Repo/muba2026/` | Reference project **SHOU** — _Scam-Halting On-chain Utility_ (MUBA Blockchain Hackathon 2026 · Sui Track 01 · Gonka "AI for Society"). This is a separate git clone, **not** part of this repository's history. |

The reference clone is not committed here. To recreate it:

```bash
git clone https://github.com/mewHacks/muba2026.git "Reference Repo/muba2026"
```

Start with `Reference Repo/muba2026/README.md` and `Reference Repo/muba2026/docs/`
(`shou-architecture.md`, `DECISIONS.md`, `RUNBOOK.md`).

## Team server

- Ubuntu 24.04, shared `team` account with passwordless sudo.
- Key-only SSH:

  ```bash
  ssh -i ~/.ssh/id_ed25519 team@172.104.41.120
  ```

- The box is currently bare: only SSH is exposed and no services, containers,
  or data are deployed yet.

## Team — TEAM WEB 1.5

1. **Daniel anak Boniface Alin** — Research, business and financial value, target users, statistics, regulatory.
2. **Hana Tang** — Overall planning, Move contracts, TEE enclave, driver SDK, zkLogin and recovery.
3. **Shermaine Yap Shi Min** — Gonka Router integration, Chrome extension, guardian dashboard.
4. **Liaw Yi Wen** — Research, business and financial value, target users, statistics, regulatory.

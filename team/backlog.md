# Backlog

One section per person. **Edit only your own section.** To ask someone for something, add a task in their
section with `requested-by: <you>`. IDs are global: use the next free `T-###`.

Status: `todo` · `doing` · `blocked` · `done`

## williamkee51

| ID | Task | Status | Blocked by | Requested by | Due |
| --- | --- | --- | --- | --- | --- |
| T-036 | Confirm your area in `roles.md` as part of the M0 ownership split | done | | | |

## Shermaine Yap

| ID | Task | Status | Blocked by | Requested by | Due |
| --- | --- | --- | --- | --- | --- |
| T-037 | Confirm your area in `roles.md` as part of the M0 ownership split | todo | | | |
| T-039 | Build Ask SHOU v1: bounded check agent, standalone `panel/`, Vercel API, docs and tests (branch `ask-shou`, PR #1) | done | | | |
| T-041 | Deploy the Lantern Assistant on Vercel as `lantern-assistant` — dropped: the panel uses the gateway's `/agent/message` instead (D-014) | done | | | |

## Fahreza Alghifari

| ID | Task | Status | Blocked by | Requested by | Due |
| --- | --- | --- | --- | --- | --- |
| T-034 | Implement the backend: API gateway, scoring service, `/risk/link` and agent endpoints; agree the API contract with Fihkri (D-002) | doing | | Fihkri | |
| T-038 | Decide what runs on the team server and how the backend deploys | done | | | |
| T-042 | Redeploy the enclave (`./deploy.sh`) to ship the brand/deny-list floors from D-012 | todo | | Shermaine Yap | |

## Fihkri

| ID | Task | Status | Blocked by | Requested by | Due |
| --- | --- | --- | --- | --- | --- |
| T-033 | Scaffold the Chrome MV3 extension: content script, service worker, URL normaliser, warning page, assistant panel | done | | | |
| T-040 | Wire the extension service worker to `POST /risk/link` per the contract in `server/README.md` (base URL, `NOT_CHECKED` handling, no green on failure). Ask Fahreza for the current tunnel host; raise CORS/origin needs as a task if `host_permissions` is not enough | done | | Fahreza Alghifari | |
| T-043 | Reload the extension and smoke-test the side panel: a pasted message goes to the Lantern Assistant; a link shows the badge plus "Ask Lantern Assistant to explain" (D-012, D-014) | todo | | Shermaine Yap | |
| T-044 | Re-theme the warning page and side panel to `design/DESIGN.md`: tokens only, bundled IBM Plex, SVG tier marks, light/dark, reduced motion | done | | | |
| T-045 | `npm run sim`: 3 checks fail on main (IP-literal `/verify` and `maybank2u.com.my@evil-site.top` expected 🔴, scored 🟡 because their floors are 60/70; the address-bar case follows). Decide: raise those floors to HIGH, or expect MEDIUM in the sim | todo | | Shermaine Yap | |

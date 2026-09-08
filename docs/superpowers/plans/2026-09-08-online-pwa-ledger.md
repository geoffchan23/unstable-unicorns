# SDD ledger — plan: docs/superpowers/plans/2026-09-08-online-pwa.md
Branch: online-pwa (from main @ bb2d406). Spec: docs/superpowers/specs/2026-09-08-online-pwa-design.md

Ruling: implement on branch `online-pwa` in the primary checkout instead of a separate worktree — the checkout had no other work in progress and the user works in this directory — costs nothing if wrong beyond a branch switch.

## Pre-flight scan
| Pair / task | Produces vs consumes | Finding |
|---|---|---|
| T3 → T9 | GameScreen props `banner`, `renderWin`, `youLabel` | consistent |
| T4 → T10 | build.mjs copies `src/ui/pwa/*` only if present; sw precache injection | consistent |
| T4 → T7 | dev.mjs spawns `src/server/index.ts` only if present | consistent |
| T5 → T9 | local.spec clicks Home button that T9 adds; plan says comment out until T9 | consistent |
| T6 → T7 | Room API (create/join/rejoin/disconnect/handle/seatOf), RoomError.code | consistent |
| T6/T7 → T9 | HOST_GRACE_MS env: T9 needs `startServer({hostGrace})` and dev.mjs env; T7 interface lacks `hostGrace` | CONFLICT → ruling A |
| T6 → T8/T9 | On win, Room pushes `lobby{status:'finished'}`; GameClient nulls `state` when status!=='playing'; App shows OnlineGame only when status==='playing' → win overlay never visible online, online.spec expects it | CONFLICT → ruling B |
| T6 → T9 | Room.rejoin pushes state only when 'playing'; a rejoin after the win would land in Lobby without the result | ruling B (3) |
| T8 → T9 | Snapshot shape, `useClient` singleton | consistent |
| T10 → T11 | icons committed in T10; CI also runs `npm run icons` | harmless redundancy |
| T1 | scripts block, venv path `.cache/venv` (gitignored) | self-consistent |
| T2 | test expects `[2,1,1]` with babies + rainbow | self-consistent |
| T6 | `afterChange()` must be public for the finished test; `.catch?.` line replaced by try/catch | self-consistent w/ note |
| T7 | server.test shared server uses dev:true; rate-limit test spins its own | self-consistent |

Ruling A: `ServerOptions` gains `hostGrace?: number` (and `botDelay?: number`) passed into RoomDeps; `src/server/index.ts` reads `HOST_GRACE_MS`/`BOT_DELAY_MS` env when set; T9 sets `HOST_GRACE_MS=3000` in dev.mjs — costs nothing if wrong (defaults unchanged).
Ruling B: keep the win overlay online. (1) GameClient nulls `state` only when a `lobby` message has `status === 'lobby'`; (2) App renders OnlineGame whenever `snap.state` is non-null; (3) Room.rejoin pushes state whenever `status !== 'lobby'`; (4) online.spec finishes via the win overlay's `playagain` button. Spec §3.2 "finished" + §4.1 OnlineGame renderWin are the authority. Cost if wrong: a redundant Lobby 'finished' branch.

## Progress
Task 1: complete (commits bb2d406..3ffb727, review clean)
Task 2: complete (commits 3ffb727..6a51995, review clean)
Task 3: complete (commits 6a51995..dfe3172, review clean)
Ruling: dev.mjs must forward SIGINT/SIGTERM to its spawned children (static server, tsx server) and exit — Task 4 implementer observed children outlive a plain kill; Playwright's webServer teardown relies on clean shutdown — carried into Task 5 dispatch; cost if wrong: an extra signal handler.
Task 4: minor (deferred): static.mjs decodeURIComponent can throw URIError on malformed percent-encoding and crash the dev static server; wrap in try/catch → 404.
Task 4: minor (deferred): build.mjs sw/precache branch is untested until Task 10 lands; verify relative paths then.
Task 4: complete (commits dfe3172..625ea97, review clean)
Ruling: dev.mjs builds to dist/dev/unicorns and serves dist/dev on 5173, so the dev watcher and the production build (dist/unicorns, served on 5174 for the pwa spec) never write the same folder — cost if wrong: a path in dev.mjs.
Ruling: the ipad Playwright project runs on WebKit (the 'iPad (gen 7)' device default; implementer installed webkit) for Safari fidelity; CI keeps chromium + pixel only — cost if wrong: one extra browser install locally.
Task 5: complete (commits 625ea97..844ae01, review clean; seed 4 used for the vs-bot spec)
Task 6: fix round 1/5 (4 addressed, 0 open — bot-as-host after leave; makeHost to disconnected human; vacuous bot test; bot timer error path; commits 025b309..851a1c1)
Task 6: minor (deferred): null-return path of greedyBotAction fallback untested in isolation; removeSeat may hand host to a disconnected human before searching for a connected one (self-corrects after grace).
Task 6: complete (commits 844ae01..851a1c1, review clean after 1 fix round)
Ruling C: the passphrase check applies whenever a passphrase is configured, dev or not; dev only relaxes origins and the per-IP rate limit, and allows create with no passphrase configured. Reason: the brief's shared dev-mode test server asserts a wrong-passphrase error. Cost if wrong: one env var in dev.mjs.
Ruling D: empty-room expiry is measured from the moment the last connected human leaves — Room tracks `emptySince` (set on the transition to zero connected humans, cleared on any human connection); RoomRegistry.sweep reaps when `now - emptySince > emptyMs`, idle when `now - lastActivity > idleMs`, or when no human seats remain; the brief's sweep test is adjusted to that semantics. Reason: spec §3.2 promises a 10 min reconnect grace. Cost if wrong: a field on Room.
Task 7: fix round 1/5 (4 addressed + minors, 0 open — close() room teardown; emptySince grace; cross-room rejoin; XFF last entry; commits 46ed614..0a7d8cc)
Task 7: minor (deferred): x-forwarded-for handling has no dedicated test; replaceWithBot emptySince path untested (idempotent).
Task 7: complete (commits 851a1c1..0a7d8cc, review clean after 1 fix round)
Task 8: fix round 1/5 (2 addressed, 0 open — stuck rejoining flag; JSON.parse guard; commits 4da36fa..3baea43)
Task 8: complete (commits 0a7d8cc..3baea43, review clean after 1 fix round)
Ruling E: scripts/dev.mjs sets UNICORNS_PASSPHRASE=dev and HOST_GRACE_MS=3000 for the spawned dev server so the create form and host transfer are exercised deterministically by e2e — cost if wrong: two env vars.
Task 9: minor (deferred): `Leave room` while the socket is closed queues a `leave` that errors on reconnect (self-heals on next joined).
Task 9: minor (deferred): nothing calls client.close(); the socket and reconnect loop live for the tab (intentional for "Back to my game", revisit).
Task 9: minor (deferred): on reload with a stored session the Lobby form flashes for one frame before OnlineGame (server sends lobby before joined).
Task 9: minor (deferred, product): no way to leave a room outside lobby status; a player whose host vanished has no exit but clearing storage — raise in the UX iteration with the user.
Task 9: minor (deferred): useClient re-subscribes each render (new closure); hoist the subscribe fn.
Task 9: fix round 1/5 (4 important + 2 small addressed, 0 open — banner grid-area; unforced first click; scoped timeout; 30 s playagain wait; commits 6d4bf33..25181e0)
Task 9: complete (commits 3baea43..25181e0, review clean after 1 fix round)
Task 10: Ruling: sw.js shell detection misses a bare `/unicorns` (no trailing slash) — deferred as minor; GitHub Pages 301-redirects directory paths to the slash form and static.mjs 404s it, so it is unreachable — cost if wrong: one extra `endsWith` in sw.js.
Task 10: minor (deferred): .topbar safe-area padding stacks on .game padding (cosmetic).
Task 10: complete (commits 25181e0..0452faa, review clean)
Task 11: note for deploy session: Caddy apt-repo URLs in docs/DEPLOY.md not live-verified; deploy/ingress.json SSH rule reconstructed, confirm against the live OCI security list before applying.
Task 11: minor (deferred): CLAUDE.md says ingress.json is copied to the VM (it is a local OCI CLI input); deploy-web.sh aborts on nothing-to-commit (guard with git diff --quiet); report's rationale for build:server CI step inaccurate (harmless health check).
Task 11: complete (commits 0452faa..e39b9ed, review clean)
Final review (opus): With fixes — Important: (1) no validation of msg.seat/msg.action at Room.handle; (2) no exit from an online room outside lobby status (deferred #17 promoted); (3) no per-connection message throttle / conns cap / failed-join limit; (4) CI flakiness: retries 0, reuseExistingServer unconditional. Minors folded into the fix wave: heartbeat one-miss drop, SW deletes uu-fonts, bind address, pm2 env + art notes in DEPLOY.md, deploy-web nothing-to-commit guard, CLAUDE.md ingress wording, Setup dead expression, CLAUDE.md known-gap note (prompt options visible in views).
Ruling F: server-side `leave` stays lobby-only (splicing mid-game desyncs engine player indices); the client gets `forget()` (clear session, close socket, reset snapshot) surfaced as "Leave this game" on Home (when a session exists) and in the Lobby for non-lobby statuses — cost if wrong: one client method and two buttons.
Final fix wave: complete (commits e39b9ed..51667a1, re-review clean). Residual low observations: DEPLOY.md HOST wording overstates dev behaviour; CLIENT_MESSAGE_TYPES is a hand-maintained mirror of the union; join-failure counter also counts non-attack errors; Lobby forget button near-dead (win overlay has no quit control — UX iteration item); maxConns untested.

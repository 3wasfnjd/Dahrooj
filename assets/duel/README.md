# Dahrooj online duel preview

Aboden Games — https://github.com/3wasfnjd/Dahrooj

Dahrooj is the projectile: swipe the live character and release at the opponent. No arrows, aiming sliders, Fire button, instruction panels or new in-match menu. The original renderer, paper background, faces, skins and swipe trail are retained. Launch calculation is shared with goal/hoop/cans in `shot.js`; gravity (13), drag (0.9), floor bounce (0.55), release-point targeting, last-120ms swipe speed and gesture curve follow those modes.

A small score in the original counter font shows successful hits, local player first, with Arabic numerals. Three hearts and six rounds remain. Room creation displays the room code itself as a copy target; tapping it copies just the code and briefly shows a checkmark. The same code stays available after joining. The join icon reveals the input and also submits it; Enter works too. The separate copy and submit buttons are removed.

Six rounds contain one shot per player (12 shots maximum). Host shoots first; turns alternate. A hit removes exactly one of the opponent's three hearts, with a pop animation. Zero hearts ends the match immediately. Otherwise the player with more hearts after 12 shots wins; equal hearts is a draw. Both online players must request a rematch; offline rematches start immediately. The AI uses the same projectile rules with variable aim error, and does not read player health to adjust accuracy. Leaving or losing the connection stops the match without awarding a win.

## Transport and trust

PeerJS 1.5.5 is vendored with its MIT license and loaded only when connecting. The default public PeerJS Cloud service performs signaling. Gameplay uses a reliable ordered WebRTC data channel. The room owner validates turns, match IDs, input ranges and duplicate shots, computes collisions using shared deterministic rules, and sends authoritative snapshots. This is a casual friend-match prototype: a modified host can cheat. It is not a ranked authoritative-server implementation.

No Firebase rules, accounts or existing modes are changed. No paid service or backend deployment is provisioned. A connection times out with an actionable message; network loss freezes and closes the room. Public signaling availability and direct WebRTC reachability depend on the network. A production release needs two-device testing across Wi-Fi/mobile networks and a managed TURN relay for networks where direct connections fail. Deployments may define `window.DAHROOJ_PEER_OPTIONS` before connecting to supply a private PeerServer and `config.iceServers`. Do not put long-lived private TURN credentials in source; obtain short-lived credentials from a backend.

## Verification

Run `node tools/test-duel.mjs` `node tools/test-duel-session.mjs` and `node tools/test-fast-return.mjs`.

Before merging, test two real devices: create/join by code and invitation link, each style, alternate shots, third-hit knockout, six-round tie and win, simultaneous rematch requests, room full/invalid, pointer cancel, leave, connection loss, portrait and landscape. Cloud-browser verification completed for direct entry, original live character rendering (jelly, fabric and fur), the prior prototype, a swipe against the AI, the AI reply and advancement to round two. The browser has no WebGL, so this exercised the Canvas fallback; GPU rendering and real-device touch performance still require checking. Online room creation succeeded, but a two-tab WebRTC connection timed out in this browser. Do not claim online connectivity is verified or merge before real-device testing.


Ball-mode verification (2026-10-04): cloud browser at 390×844, swiped the actual Dahrooj at the visible opponent, confirmed score ١ — ٠ and round-two progression after AI reply. Created a real signaling room and observed the copy checkmark after clicking the code; the browser automation clipboard is virtual, so native clipboard contents are additionally covered by the controller test. 874 ball-rule/launch assertions, controller/session tests (including exact code-copy payload and score text), and 162 existing fast-return assertions pass. No runtime game errors observed in the cloud browser. Online match connectivity remains unverified; this is still a draft preview.

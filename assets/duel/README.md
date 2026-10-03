# Dahrooj online duel preview

Aboden Games — https://github.com/3wasfnjd/Dahrooj

Rebuilt after visual review: the crossed-arrows mode reuses the game's five original ball renderers and paper background. Create a room and share its invitation link, or enter its eight-character code on another device. Each player chooses a style before joining. Press Play for an offline AI opponent; invite/join controls remain separate. Swipe upward to aim and release to fire. There are no in-match panels, sliders or Fire button. Keyboard arrows adjust aim/power and Space fires. Hearts stay above each character and six small dots show rounds. The character uses the original live skin/face/material rendering, and the arrow is a rounded Three.js mesh with matching materials for all five styles.

Six rounds contain one shot per player (12 shots maximum). Host shoots first; turns alternate. A hit removes exactly one of the opponent's three hearts, with a pop animation. Zero hearts ends the match immediately. Otherwise the player with more hearts after 12 shots wins; equal hearts is a draw. Both online players must request a rematch; offline rematches start immediately. The AI uses the same projectile rules with variable aim error, and does not read player health to adjust accuracy. Leaving or losing the connection stops the match without awarding a win.

## Transport and trust

PeerJS 1.5.5 is vendored with its MIT license and loaded only when connecting. The default public PeerJS Cloud service performs signaling. Gameplay uses a reliable ordered WebRTC data channel. The room owner validates turns, match IDs, input ranges and duplicate shots, computes collisions using shared deterministic rules, and sends authoritative snapshots. This is a casual friend-match prototype: a modified host can cheat. It is not a ranked authoritative-server implementation.

No Firebase rules, accounts or existing modes are changed. No paid service or backend deployment is provisioned. A connection times out with an actionable message; network loss freezes and closes the room. Public signaling availability and direct WebRTC reachability depend on the network. A production release needs two-device testing across Wi-Fi/mobile networks and a managed TURN relay for networks where direct connections fail. Deployments may define `window.DAHROOJ_PEER_OPTIONS` before connecting to supply a private PeerServer and `config.iceServers`. Do not put long-lived private TURN credentials in source; obtain short-lived credentials from a backend.

## Verification

Run `node tools/test-duel.mjs` `node tools/test-duel-session.mjs` and `node tools/test-fast-return.mjs`.

Before merging, test two real devices: create/join by code and invitation link, each style, alternate shots, third-hit knockout, six-round tie and win, simultaneous rematch requests, room full/invalid, pointer cancel, leave, connection loss, portrait and landscape. Local browser automation in the implementation environment was blocked by socket permissions; actual WebRTC and visual verification remain outstanding.

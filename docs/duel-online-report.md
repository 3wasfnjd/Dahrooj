# Duel online verification

Branch: `feature/cans-ai-opponent`. The six original modes retain their local game logic.

## Passed

- Nine server tests: FIFO pairing, isolated scores and messages, odd-player waiting, leave/requeue, both players scoring, rejected out-of-turn and simultaneous requests, mirrored coordinates, malformed/stale/replayed input, style synchronization, miss/return, idle hibernation restoration, heartbeat expiry, rate limits, real WebSockets, and origin rejection.
- Gravity, launch velocity, curve, drag, and flight integration match the existing cans mode numerically. Both characters retain radius `0.24` with normal camera perspective.
- Five separate Chromium contexts: players 1+2 and 3+4 pair independently; player 5 waits and is automatically paired with a remaining player after a departure.
- Trusted touch swipe reaches the other browser; a canceled gesture does not shoot.
- Turns alternate after a hit, miss, or off-screen return; the server rejects the waiting player’s shots. A small label below the score identifies the turn.
- Both camera orientations can hit and score. All five original styles synchronize, with pop particles and sound, no pop outline, and synchronized reset/score.
- Dropped connections reconnect and rematch; leaving Duel closes the connection. Other modes never join matchmaking.
- Layout and projected radius verified at 320×568, 390×844, 844×390, and 1280×800. No browser script errors.
- `wrangler deploy --dry-run` builds the Worker and its static assets successfully.

Commands: `npm test`, `npm run test:browser`, `npx wrangler deploy --dry-run`.

Browser evidence is generated in `test-results/duel-*`. Browser checks use the real local WebSocket server and Chromium mobile/desktop emulation. They do not establish performance on physical mobile devices or on a public network. A public online test requires the deployed Worker URL, not a static GitHub mirror.

# Duel online verification

Branch: `feature/cans-ai-opponent`. The six original modes retain their local game logic.

## Passed

- Server tests: FIFO pairing, isolated scores and messages, odd-player AI practice, leave/requeue, both players scoring, rejected out-of-turn and simultaneous requests, mirrored coordinates, malformed/stale/replayed input, style synchronization, miss/return, idle hibernation restoration, heartbeat expiry, rate limits, real WebSockets, and origin rejection.
- Gravity, launch velocity, curve, drag, and flight integration match the existing cans mode numerically. Both characters retain radius `0.24` with normal camera perspective.
- Five separate Chromium contexts: players 1+2 and 3+4 pair independently; player 5 plays AI and is automatically paired with a remaining player after a departure.
- Trusted touch swipe reaches the other browser; a canceled gesture does not shoot.
- Turns alternate after a hit, miss, or off-screen return; the server rejects the waiting player’s shots. A small black outline icon below the score identifies the turn: crosshair for the local turn, hourglass for the opponent. Accessible labels remain available to screen readers.
- Both camera orientations can hit and score. All five original styles synchronize, with pop particles and sound, no pop outline, and synchronized reset/score.
- Dropped connections reconnect and rematch; leaving Duel closes the connection. Other modes never join matchmaking.
- Layout and projected radius verified at 320×568, 390×844, 844×390, and 1280×800. No browser script errors.
- `wrangler deploy --dry-run` builds the Worker and its static assets successfully.

Commands: `npm test`, `npm run test:browser`, `npx wrangler deploy --dry-run`.

Browser evidence is generated in `test-results/duel-*`. Browser checks use the real local WebSocket server and Chromium mobile/desktop emulation. They do not establish performance on physical mobile devices or on a public network. A public online test requires the deployed Worker URL, not a static GitHub mirror.

## Health and damage

Both players start with 100 health. A character hit removes 40; any distraction hit removes 20. The server simulates shared projectile physics and checks swept contacts once per projectile. Misses do not cause damage. Health persists between turns; only zero health causes a pop and score. Full health returns after the defeated round resets. Two small ink-colored lines below the turn icon show health without visible text, following the score order (self left, opponent right). Regression coverage includes half damage, misses, lethal hits, round resets, hibernation, room isolation and synchronized browser health.

## Touch controls and AI

Both grounded players can move horizontally by dragging their character. Movement remains bounded and speed-limited on the server, predicted locally, and shared with the other client. On the shooter's turn, an upward swipe throws the main character. Horizontal movement stops being available once that character is airborne, preserving launch physics.

The waiting player taps the opponent's screen location to throw a small ink-colored ball. The target uses the opponent's current depth and the touched position; it never follows them after release. The projectile uses the same gravity, drag and bounce with a smaller collision radius (`0.085`), and still deals half damage. All three former objects, buttons, icons and water effects are removed. Canceled or dragged target taps do not shoot.

A lone visitor gets a server-controlled opponent immediately while remaining in the human queue. AI uses normal movement, reaction delay, imperfect one-time aim, and normal damage. Existing throws finish before human matchmaking replaces the practice match. A departed human is replaced with AI if no other visitor is available. Solo health and AI timers survive Durable Object hibernation; quiet practice can hibernate after the AI action. AI requires the Duel server connection.

Coverage includes AI turns, return to AI, FIFO human handoff during a throw, canceled handoff, restored practice state, touches at different targets, main-shot versus lateral-movement gestures, cooldown, cancellation and no projectile UI.

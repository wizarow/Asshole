# Asshole

The card game, online. 3 to 8 players, bots fill empty seats.
v1 · Ishan Atul's render

## Run locally
    node server.js      # http://localhost:3000   (Node 18+, no dependencies)
    npm test            # rule checks and simulated games, 3 to 8 players, every bot level
    node build.js       # writes dist/asshole-demo.html (whole app in one page, plays against bots)

## Deploy on Render (same as Judgement)
1. Push this folder to a GitHub repo.
2. Render > New > Web Service > pick the repo.
3. Build command: leave empty. Start command: `node server.js`. Free plan is fine.
4. Open the URL, tap Start a table, share the room code or invite link.
Don't redeploy mid-game: live rooms are held in memory and drop on restart. The free plan sleeps when idle.

## Files
- `server.js`          rooms, live updates (server-sent events), static files
- `public/engine.js`   all the rules and the bots; shared by server and browser
- `public/index.html`  the whole UI (the org-chart design)
- `test/engine.test.js` rule checks and full simulated games
- `build.js`           makes the single-page demo

## Rules as built
- 3 to 8 players (bots count). The whole 52-card deck is dealt round-robin. 2 is highest, then Ace, King ... down to 3.
- Wording: a **game** is one deal, played until one player is left holding cards. Inside a game you play **rounds**: one player leads,
  the others beat it or pass, and the last player to play wins the round and leads the next. (The code still calls a round a "trick"
  and a game a "round" internally; only the screens and this README use the table wording.)
- The 3 of clubs holder leads game 1. After that the Asshole leads.
- Lead one card or a set of one rank (pair, three, four). Everyone after must play the same number of cards of a strictly higher rank, or pass.
  A pass lasts until someone plays again. When everyone else has passed, the last player to play wins the round and leads.
- A 2 is the highest card but does not win the round by itself. The next player can pass or put another 2 (same count) on top of it,
  and so on. A round is only won when everyone else has passed.
- Finish order sets the titles. Up to 5 players: President, Citizens, Asshole. From 6 players: President, Vice President, Citizens,
  Vice Asshole, Asshole.
- Before the next game comes a card swap screen. The Asshole picks their best cards to give the President, the President picks
  their lowest to give back: 3 cards from 6 players, 2 cards with 4 or 5 players, 1 card with 3. From 6 players the Vice Asshole and
  Vice President also swap 2 cards the same way.
  Both sides choose by hand; the server refuses anything else ("You have to give your 2 highest cards" / "You can only give your 2 lowest cards").
  The two sides see what they gave and got, everyone else just sees that the swap is happening (no card faces). Away players and bots are handled
  automatically, and with a turn timer the swap is done for anyone who runs out of time. Anyone taps Start playing to carry on (it also carries on after 10 s).
- Games go on until the host ends the night. Most Asshole games is the Asshole of the night (fewest Presidencies breaks a tie).

## Start with roles
For when everyone drops and you don't want to restart. Tick **Start with roles** on the first page (or in the lobby, host only),
then pick President, Vice President, Vice Asshole and Asshole for the players in the room (Citizen is the default).
Any title nobody picked goes to a bot. The hand-downs then happen before game one and the Asshole leads.
Needs: President and Asshole up to 5 players; all four titles from 6 players up (bots can cover the gaps).

## Settings
Name, text size, host: bot level (Easy, Medium, Hard), turn timer (Off, 30 s, 45 s, 1 min, 2 min), remove a player (a bot takes the seat mid-game).

## Notes
- Name is required to create or join. Rejoin after a refresh is automatic on the same device. `/?r=CODE` prefills the room code.
- Turn timer: when it runs out a bot plays that turn and a note appears in the chat.
- A disconnected human who is up to play (or to hand cards down) is auto-played after 25 seconds, at Medium.
- Connection: same handling as Judgement. SSE with a 10 s heartbeat, resync on wake, polling fallback, `/health` for an uptime pinger.

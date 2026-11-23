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
- The 3 of clubs holder leads round 1. After that the Asshole leads.
- Lead one card or a set of one rank (pair, three, four). Everyone after must play the same number of cards of a strictly higher rank, or pass.
  A pass lasts until someone plays again. When everyone else has passed, the last player to play takes the trick and leads.
- A 2 can't be beaten, so it takes the trick at once.
- Finish order sets the titles: President, Vice President, Citizen(s), Vice Asshole, Asshole.
  3 players: President, Citizen, Asshole.
- Next round the Asshole gives the President their best 2 cards and the President hands back any 2.
  Vice Asshole gives Vice President their best 1 and gets 1 back. (3 players: 1 card, President and Asshole only.)
- Rounds go on until the host ends the night. Most Asshole rounds is the Asshole of the night (fewest Presidencies breaks a tie).

## Start with roles
For when everyone drops and you don't want to restart. Tick **Start with roles** on the first page (or in the lobby, host only),
then pick President, Vice President, Vice Asshole and Asshole for the players in the room (Citizen is the default).
Any title nobody picked goes to a bot. The hand-downs then happen in round one and the Asshole leads.
Needs: President and Asshole with 3 players; all four titles from 4 players up (bots can cover the gaps).

## Settings
Name, text size, host: bot level (Easy, Medium, Hard), turn timer (Off, 30 s, 45 s, 1 min, 2 min), remove a player (a bot takes the seat mid-game).

## Notes
- Name is required to create or join. Rejoin after a refresh is automatic on the same device. `/?r=CODE` prefills the room code.
- Turn timer: when it runs out a bot plays that turn and a note appears in the chat.
- A disconnected human who is up to play (or to hand cards down) is auto-played after 25 seconds, at Medium.
- Connection: same handling as Judgement. SSE with a 10 s heartbeat, resync on wake, polling fallback, `/health` for an uptime pinger.

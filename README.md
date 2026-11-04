# WALEN TAP — Telegram Mini App starter

This is a working starter for a Telegram tap-to-earn Mini App. It includes:
- Telegram Mini App `initData` signature verification on the server
- Player registration and persistent SQLite balances
- Tap-to-earn with server-side energy checks
- Energy regeneration (1 energy every 3 seconds)
- Daily reward (1,000 in-game points once per 24 hours)
- Referral attribution and starter bonuses (500 inviter / 250 new player)
- Basic leaderboard

## Important
`WALEN COIN` is an in-game points balance only. It is not a cryptocurrency, has no cash value, and cannot be withdrawn or traded. Future token integration is intentionally not enabled.

## Run locally
1. Install Node.js 20+.
2. Copy `.env.example` to `.env`.
3. Create a Telegram bot with **@BotFather** and paste its token into `BOT_TOKEN`.
4. Set `BOT_USERNAME` to the bot username without `@`.
5. Run `npm install` then `npm start`.
6. Deploy to a public HTTPS host with persistent disk storage for `walen-tap.sqlite`.
7. In @BotFather, configure the bot's Mini App / menu button URL to your deployed HTTPS URL.

## Telegram setup
- Create a bot using `/newbot` in @BotFather.
- Use `/setmenubutton` (or BotFather's Mini App settings) and set the web app URL.
- Your website must use HTTPS.
- Keep the bot token secret. Never put it in `public/index.html` or share it publicly.

## Deployment notes
The host must support Node.js and persistent storage. If the filesystem is ephemeral, configure `DB_FILE` to a persistent volume path. Set:
- `BOT_TOKEN`
- `BOT_USERNAME`
- `PORT` (provided by many hosts)
- `DB_FILE` (optional)

## Before public launch
- Add admin authentication and moderation tools.
- Add rate limiting, abuse monitoring, backups and privacy/terms pages.
- Add task verification before paying task rewards.
- Have a security review before any real-money or token functionality.
- Do not promise token listing, exchange value, or cash withdrawals.

# Pulse Monitor — live dashboard (Vercel)

A **read-only** public view of the project's ThingSpeak channel, built to run on
Vercel without changing the local project.

- `api/feeds.js` — serverless function. Reads the channel server-side with the
  Read API Key (never sent to the browser), normalises entries and applies the
  legacy feed flags. The browser applies the documented review rules separately.
- `public/` — the dashboard page (HTML/CSS/JS, same visual language as the
  local dashboard).
- `dev-server.js` — local preview server, so you can test without Vercel.

The dashboard includes a browser-local symptom journal, CSV/JSON exports,
configurable review bands, evidence reports and optional browser notifications.
It has no server database, device bridge or connected Isolation Forest model.
See [review design, sources and limitations](REVIEW.md). Run `npm test` to check
the review engine.

## Deploy (GitHub import — recommended)

1. Push this repository to GitHub (already done if you followed the project
   `DEPLOYMENT.md`).
2. Go to <https://vercel.com/new> and import the repository.
3. Set **Root Directory** to `live_demo`.
4. Framework preset: **Other** (no build step needed).
5. Add environment variables:
   - `THINGSPEAK_CHANNEL_ID` — your channel ID
   - `THINGSPEAK_READ_API_KEY` — your channel's Read API Key (private channel)
   - `THINGSPEAK_RESULTS` — optional, default `60`
6. **Deploy**. Your dashboard is live at `https://<project>.vercel.app`.

Every visit calls `/api/feeds`, which pulls fresh entries from ThingSpeak
(cached ~20 s to respect rate limits).

## Local preview

```powershell
cd live_demo
copy .env.example .env      # fill in channel id + read key
npm run dev                 # http://localhost:4173
```

No key yet? Render the UI with synthetic data:

```powershell
$env:MOCK=1; npm run dev
```

## Deploy with the Vercel CLI (optional)

```powershell
npm i -g vercel
vercel login
cd live_demo
vercel --prod
```

The CLI prompts for the project name and lets you add environment variables in
the Vercel dashboard afterwards.

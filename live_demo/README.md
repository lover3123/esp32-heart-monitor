# Pulse Monitor — live dashboard (Vercel)

A **read-only** public view of the project's ThingSpeak channel, built to run on
Vercel without changing the local project.

- `api/feeds.js` — serverless function. Reads the channel server-side with the
  Read API Key (never sent to the browser), normalises entries and applies the
  same threshold rules as the local AI service.
- `public/` — the dashboard page (HTML/CSS/JS, same visual language as the
  local dashboard).
- `dev-server.js` — local preview server, so you can test without Vercel.

> This deployment has **no database, no symptom journal, no bridge and no
> Isolation Forest**. Those run in the full local stack. The page says so.

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

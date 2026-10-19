# Deploying this project

There are two different things you can put online, and they are not the same:

| | Full local stack | Live dashboard (Vercel) |
|---|---|---|
| Node API + SQLite | ✅ localhost:3000 | ❌ (serverless has no persistent disk) |
| Python AI service (Isolation Forest) | ✅ localhost:8000 | ❌ (stateful, local-only) |
| ThingSpeak → local bridge | ✅ local script | ❌ (replaced by a serverless fetch) |
| Symptom journal | ✅ SQLite | ❌ read-only page |
| Live readings from ThingSpeak | ✅ via bridge | ✅ via `/api/feeds` proxy |
| Threshold review flags | ✅ AI service | ✅ same rules, computed in the function |

So: **GitHub stores the whole project; Vercel hosts a read-only live view** of
the ThingSpeak channel. The local system stays exactly as it is.

## 1. GitHub

```powershell
cd C:\Users\userc\Downloads\esp32_heart_monitor_ai_integrated\esp32_heart_monitor
gh repo create <repo-name> --public --source . --remote origin --push
```

Already initialised and committed in this working copy. Change the visibility
later with `gh repo edit --visibility private` if needed.

**Never commit keys.** `.gitignore` excludes `server/.env`, `integrations/.env`,
`live_demo/.env`, the SQLite database and runtime state. The Wokwi sketch keeps
a placeholder Write API key — paste your real key only in the Wokwi editor.

If a key ever leaks (screenshot, repo, chat), rotate it in ThingSpeak:
*Channel Settings → API Keys → Regenerate*.

## 2. Vercel (live dashboard)

1. Open <https://vercel.com/new> → **Import Git Repository** → pick the repo.
2. **Root Directory:** `live_demo`
3. Framework preset: **Other** (static + one function, no build step).
4. Environment variables:
   - `THINGSPEAK_CHANNEL_ID`
   - `THINGSPEAK_READ_API_KEY`
   - `THINGSPEAK_RESULTS` = `60` (optional)
5. **Deploy** → open the `*.vercel.app` URL.

Notes:
- The read key is used only inside the serverless function; it is never sent to
  the browser. The page has no write access.
- Responses are cached for ~20 s to stay well inside ThingSpeak's free limits.
- If the feed shows **"Feed unavailable"**, check the environment variables and
  redeploy.

## 3. Full stack online (optional, later)

If you want the *complete* system (API + database + AI) on the internet, Vercel
alone is not enough. A practical setup is:

- **Render / Railway / Fly.io** for the Node API *and* the Python AI service
  (long-running containers), with a persistent volume for SQLite or a managed
  Postgres/Turso database.
- The bridge as a small worker on the same platform (or a scheduled job).
- Vercel can still host the dashboard, pointed at the hosted API.

That is a re-architecture, not a deployment — do it after the project is
validated, and only with a clear plan for rate limits, auth and data privacy.

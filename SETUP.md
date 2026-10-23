# Making the whole system work

The app already works on its own. Until you do the steps below, everything it records stays on the phone.
Once these steps are done, records upload automatically and prices update every week.

```
 phone app ──(anonymous records)──► Supabase database          (free)
     ▲                                      │
     │                                      ▼ every Sunday 04:00
     └──(prices.json)── GitHub repo ◄── GitHub Actions job      (free)
```

Expect about 30–45 minutes. You need a Google or GitHub account and nothing else. No credit card.

---

## Step 1 — Database (Supabase)

1. Go to **supabase.com** → *Start your project* → sign in with GitHub.
2. *New project*. Name: `apple-estimator`. Pick a strong database password (keep it, the app never needs it). Region: **West EU (Paris or Frankfurt)**, the closest to Morocco. Plan: **Free**.
3. When it's ready, open **SQL Editor** → *New query*. Paste the whole of [`server/supabase.sql`](server/supabase.sql) → **Run**. It should say *Success*.
4. Open **Project Settings → API Keys** (sometimes *Settings → API*) and copy:
   - the **Project URL** (`https://xxxx.supabase.co`)
   - the **publishable key** (`sb_publishable_…`), or on older projects the **anon public** key. **This one goes in the app.**
   - the **secret key** (`sb_secret_…`), or on older projects **service_role**. **This one goes ONLY in GitHub (Step 2). Never put it in the app.**

Check: in **Table Editor** you'll see an empty `records` table.

## Step 2 — Price file and weekly job (GitHub)

1. On **github.com** create a new repository, e.g. `apple-estimator`. Make it **Public**: the app must be able to download `prices.json` without logging in. No personal data is ever stored in the repo, and the signing key is excluded by `.gitignore`.
2. Upload this `android-app` folder to it (GitHub Desktop is easiest: *Add existing repository* → *Publish*).
   Double-check that **`release.keystore` is NOT uploaded.** Keep it safe somewhere else, like a USB stick or a private cloud folder.
3. In the repo: **Settings → Secrets and variables → Actions → New repository secret**, twice:
   - `SUPABASE_URL` = your Project URL
   - `SUPABASE_SERVICE_KEY` = the **secret** key
4. **Settings → Actions → General → Workflow permissions** → choose *Read and write permissions* → Save. This lets the job commit the new price file.
5. Test it: **Actions** tab → *Weekly price update* → **Run workflow**. With no records yet, it ends green with "Kept version 1 …".

Your price file address is:
`https://raw.githubusercontent.com/YOUR-NAME/apple-estimator/main/server/prices.json`
Open it in a browser. You should see `"version": 1`.

## Step 3 — Connect the app

Edit [`config.js`](config.js):

```js
supabaseUrl: 'https://xxxx.supabase.co',
supabaseKey: 'sb_publishable_xxxxxxxx',
pricesUrl:   'https://raw.githubusercontent.com/YOUR-NAME/apple-estimator/main/server/prices.json',
appVersion:  '1.1'
```

Rebuild (see README.md) and install the new APK. Because it's signed with the same key, it updates the old app and keeps users' data.

Check: open the app, answer **Yes** to "Share my purchases and sales", and record a test deal. In Supabase → Table Editor → `records`, the row appears within seconds. Then delete it from the app with *Data sharing → Delete my data*, and it disappears.

## Step 4 — Share the APK

Send `dist/UsedAppleEstimator.apk` by WhatsApp or Telegram, or put it on Google Drive. People install it with *Install unknown apps* allowed.
For the Play Store later, you'd need a $25 developer account and a few extra changes (an `.aab` file and a newer Android target).

---

## What happens each week, automatically

1. Phones send records whenever the app is open and online. If they're offline, records wait in a queue and go out next time.
2. Sunday 04:00 Morocco time, GitHub runs [`server/fit.mjs`](server/fit.mjs):
   - throws out typos, joke prices, unknown models and repeats, and caps each phone at 20 records a week
   - turns every price back into a "clean device" price by undoing the app's own deductions
   - computes new base prices, blended with the old ones (a price moves at most 15% a week, and only with 3+ records)
   - **tests** old vs new prices on the newest deals of each model
   - publishes `prices.json` version N+1 **only if the new prices are more accurate**, and keeps the old version in `server/history/`
3. Phones download the new file on their next launch. Prices users typed themselves are never overwritten.

You can read every run's report in the **Actions** tab (which models changed, by how much, and the error before and after).

### Settings you might change

At the top of `server/fit.mjs`:

| Setting | Default | Meaning |
|---|---|---|
| `MIN_TEST` | 8 | Deals needed before any update is allowed. Lower it to 4 for the first weeks while there are few users. |
| `MIN_N` | 3 | Records a model needs before its price can move |
| `MAX_STEP` | 0.15 | Biggest weekly change (15%) |
| `ASK_FACTOR` | 0.95 | Asking prices are treated as 5% above real sale prices |
| `K` | 10 | How strongly the old price resists change |

To roll back a bad week: copy `server/history/prices-vN.json` over `server/prices.json`, raise its `version` above the current one, and commit.

## Costs

All free at the start:
- Supabase free plan: 500 MB of database is about 1.5 million records.
- GitHub Actions: free for public repos.
- raw.githubusercontent.com: free.

You'd only pay with tens of thousands of active users (Supabase Pro, about $25/month).
One catch: Supabase pauses a free project after about a week with no activity. Weekly uploads and the Sunday job normally keep it awake. If it does pause, press *Restore* in the dashboard.

## Privacy, in short

- Sent only after the user says yes: device model and condition, the asking or final price, the app's estimate, the language, and a random install code.
- Never collected: name, phone number, contacts, location, photos, IMEI.
- Each user can switch any of this off in *Data sharing*, or delete everything from the server with *Delete my data*.
- If you publish widely in Morocco, add a short privacy page. Law 09-08 (CNDP) covers personal data. This design avoids identifying people, which keeps you on the safe side.

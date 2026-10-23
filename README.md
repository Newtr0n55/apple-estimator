# Used Apple Estimator — Android app

`dist/UsedAppleEstimator.apk` is the installable app (Android 8+). It works fully offline.
To connect it to the shared database and the weekly price updates, follow **[SETUP.md](SETUP.md)**.

## What the app does

- The estimator page, adapted for phones, in English, French and **Moroccan Darija** (Arabic letters).
- **First launch:** five yes/no questions (share asking prices, share deals, deal reminders, price updates, personal adjustment). Each can be changed later under *Data sharing*.
- **Record a deal** under the receipt (bought or sold, final price). It uploads at once if the user agreed and is online; otherwise it's queued.
- **Asking prices** the user types are recorded automatically, once per device and price, if they agreed.
- **"Did you make the deal?"** card on a later launch, for devices checked in the last 7 days.
- **Personal adjustment:** after 2+ recorded deals, estimates shift toward that user's own prices (at most ±15%). This stays on the phone.
- **Weekly prices:** downloads the newest `prices.json` when online.
- **Delete my data:** removes the user's records from the server and the phone.
- Native Copy and Share, a back button that closes the open panel first, and system bars that follow the theme.

## Folders

| Path | What |
|---|---|
| `page/used-apple-estimator.html` | the original desktop page (price logic, untouched) |
| `tools/mobile.css`, `tools/mobile.js` | phone layout, Copy/Share, back button |
| `tools/sync.js` | consent, deals, upload queue, price updates, personal adjustment |
| `tools/darija.json` | Darija text, in the same order as the page's Arabic strings |
| `tools/strings-new.json` | app-only strings in French and Darija |
| `config.js` | server addresses (empty = offline only) |
| `src/` | Android wrapper (manifest, Java, icon) |
| `server/` | database schema, weekly fitting job, `prices.json` |
| `.github/workflows/weekly-prices.yml` | runs the job every Sunday |

## Rebuild

    JAVA_HOME=.../jdk17 BUILD_TOOLS=.../build-tools ANDROID_JAR=.../android-35/android.jar bash build.sh

Needs JDK 17, Android build-tools 35 and the android-35 platform (no Gradle or Android Studio).
To raise the version, bump `versionCode`/`versionName` in `src/AndroidManifest.xml` and in `build.sh`.

**Keep `release.keystore` safe and private.** Android only installs an update over the app if it's signed with the same key, and anyone holding the key could ship fake updates.

# Panel — Manga Collection Catalog

A responsive manga collection manager built with React, TypeScript, and Vite. The app now supports two persistence modes: browser-local prototype mode when Firebase is not configured, and Google sign-in with private Firestore storage when Firebase is configured.

## Run locally

1. Install Node.js 20 or newer.
2. Run `npm install`.
3. Run `npm run dev` and open the local URL Vite prints.
4. Without Firebase environment values, the app uses `localStorage` in this browser profile. The data is not cloud-backed or shared across devices.

This checkout is connected locally to the `mangaCatalog` Firebase project (`mangacatalog-83f34`). The local web app config is in `.env.local`, which is git-ignored. GitHub Pages gets the same public web config from GitHub Actions repository variables. Firebase web config identifies the project and is included in client builds. User data access is protected by Authentication and Firestore Security Rules. Never add service account credentials to the frontend. If you clone the repo for your own Firebase project, copy `.env.example` to `.env.local` and provide your web app config there.

In the Firebase Console:

1. Create a Firebase project and register a Web app.
2. Enable Google in Authentication → Sign-in method. Firebase Authentication handles identity; this app requests no Gmail, Drive, contacts, or other Google scopes.
3. Add the local and deployed site domains under Authentication → Settings → Authorized domains.
4. Create the Cloud Firestore database.
5. Deploy the included rules with `npm run deploy:rules` (or `npx firebase deploy --only firestore:rules --project YOUR_PROJECT_ID`). The CLI default is `mangacatalog-83f34` in this checkout.
6. For another Firebase project, configure `.env.local` with all five `VITE_FIREBASE_*` values shown in `.env.example`.

Google sign-in uses Firebase’s popup flow on desktop and mobile. This avoids redirect sign-in’s cross-site storage dependency when the app is hosted on GitHub Pages. The app does not handle Google passwords. Authentication cannot work until a project is configured, Google sign-in is enabled, the domain is authorized, and Firestore is provisioned.

## Development commands

- `npm run dev` — start Vite.
- `npm run build` — TypeScript check and production build.
- `npm test` — deterministic unit and UI tests.
- `npm run test:rules` — run Firestore Security Rules tests with the local emulator. Requires Java and downloads/runs the Firebase emulator on first use.
- `npm run deploy:rules` — deploy Firestore rules with Firebase CLI after selecting the project.
- `npm run preview` — preview a production build.

## Publish on GitHub Pages

The `.github/workflows/deploy-pages.yml` workflow runs the unit tests and Firestore rules emulator tests, builds the Vite app with the repository subpath, then deploys `dist` to GitHub Pages on every push to `main`. It uses Java 21 in CI for the Firestore emulator.

One-time GitHub setup:

1. Open this repository on GitHub and go to **Settings → Pages**.
2. Under **Build and deployment**, set **Source** to **GitHub Actions**.
3. Open **Settings → Secrets and variables → Actions → Variables** and add these five repository variables using the matching values from Firebase Project settings → General → Your apps → Web app config: `VITE_FIREBASE_API_KEY` (`apiKey`), `VITE_FIREBASE_AUTH_DOMAIN` (`authDomain`), `VITE_FIREBASE_PROJECT_ID` (`projectId`), `VITE_FIREBASE_APP_ID` (`appId`), and `VITE_FIREBASE_MESSAGING_SENDER_ID` (`messagingSenderId`). These Firebase web config values are public identifiers; do not put service account credentials in repository variables or the frontend.
4. Push to `main` or manually run **Actions → Test and deploy GitHub Pages → Run workflow**.
5. When the workflow succeeds, the site is available at `https://marcelolamenza.github.io/manga-collection/`.
6. In Firebase Console → **Authentication → Settings → Authorized domains**, add `marcelolamenza.github.io` so Google sign-in works from the Pages domain.

Every later push to `main` automatically reruns the tests and deploys the new site. Firebase's client configuration is public; Firestore Security Rules provide the data access control.

### Run Firestore rules tests on Windows

Install a Java 21 JDK, such as Eclipse Temurin 21 for Windows x64, and select the MSI installer. During setup, enable the options to add Java to `PATH` and set `JAVA_HOME` if offered. Close and reopen PowerShell, verify `java -version`, then run `npm run test:rules`. The GitHub Actions workflow installs Java 21 automatically, so local Java is only needed to run the emulator tests on your computer.

## Architecture

- `src/model.ts` validates manga and volume status records and calculates progress.
- `src/repository.ts` defines the persistence interface and browser-local adapter.
- `src/firebase/client.ts` initializes Firebase only when all config values are provided.
- `src/firebase/auth.ts` contains Google identity sign-in/out and user-readable Firebase errors.
- `src/firebase/FirestoreMangaRepository.ts` stores records under `users/{uid}/manga`; UI components use the same repository boundary in either mode.
- `firestore.rules` denies access unless the authenticated UID owns the requested user path and validates manga document fields.
- `tests/firestore.rules.test.ts` checks cross-user isolation, unauthenticated access, and schema rejection in the Firestore emulator.
- `src/provider.ts` contains the modular external metadata providers; external catalog fields stay separate from edition metadata.

After signing in, if local prototype records exist and this account has not completed migration, the app asks before importing. Migration copies stable local IDs, skips IDs already in the account, reports the result, and retains the browser-local copy. Import is limited to 400 writes per batch and marks completion only after the batches finish; if interrupted, retry skips already-created IDs.

## Catalog features

- Search online using Kitsu with Open Library fallback, with manual entry always available.
- Add from search or manually; edit, remove, and keep separate editions intentionally.
- Track a status for every numbered volume: Read, Bought, In transit, or Don't have. Read and Bought count as owned.
- Move manga manually between In progress, Complete, and Read sections.
- Search, sort, filter by progress, and review edition ISBN/publisher details.
- Cover loading is independent of search results and uses a fallback when an image is absent or broken.

## Limitations

- Without Firebase configuration, persistence is limited to the current browser profile and is not shared across devices.
- Firebase Google sign-in and Firestore have been implemented but are not operational until configured against a Firebase project and verified with real credentials.
- Firebase duplicate-title checks run before writes; simultaneous additions from multiple devices can race. Rules still isolate users and validate record structure.
- Online catalog metadata may omit localized schedules or describe another printing. Verify volume counts, publisher and ISBN before applying suggestions.
- AniList is not integrated; its published terms prohibit use in competing manga list/tracker services unless authorized.


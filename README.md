# Panel — Manga Collection Catalog

A responsive Phase 1 prototype for keeping track of manga editions and volume statuses. Built with React, TypeScript, and Vite. It uses browser `localStorage`; data is local to this browser profile and is not cloud-backed or shared across devices. There is no sign-in.

## Run locally

1. Install Node.js 20 or newer.
2. From this folder, run `npm install`.
3. Start the development server with `npm run dev` and open the URL Vite prints.

Use `npm test` for the business-logic tests and `npm run build` to type-check and create a production build.

## Features

- Collection list with cover fallbacks, responsive volume indicators, owned count, and progress.
- Three manually managed collection sections: In progress, Complete, and Read. Section placement changes only when the user chooses it; volume statuses never move a manga automatically.
- Each volume indicator shows its volume number alongside the status icon.
- Four volume statuses: Read, Bought, In transit, and Don't have. Read and Bought count as owned.
- Clicking a volume opens a compact floating menu with all four status choices. Status changes save without a success notification.
- Search by title, alphabetical/owned/progress sorting, and progress filters.
- Add manga using the Kitsu public manga catalog, with Open Library as a no-key fallback, or enter manually. Edit metadata and remove entries. If both online catalogs are unavailable, matching built-in sample results are offered where possible.
- Online search starts after 300 ms of typing, ignores/cancels stale requests, limits results, and caches successful normalized queries in memory for five minutes. Open Library starts if Kitsu has no useful result or is still pending after a short 300 ms hedge. Covers load independently from results and use a built-in fallback if a source cover is missing or fails.
- Search Open Library for editions of a selected volume number. Results expose edition-specific publisher, publication date, ISBNs, and a link to the source record; the user chooses what to save. Check Kitsu for a series volume count to explicitly resize an existing grid. These are catalog suggestions, so review the returned series or edition before applying it.
- Duplicate title prevention with an explicit separate-edition option, and confirmation before a volume-count reduction discards saved statuses.
- Starter sample collection on first launch (13, 35, and 7 volumes). Remove all sample entries to reach the empty state. Browser storage failures show an error.

## Architecture

- `src/model.ts`: validated catalog types, creation, resizing, and progress calculations.
- `src/repository.ts`: `MangaRepository` interface and `LocalMangaRepository` adapter. UI components depend on this boundary rather than storage calls.
- `src/provider.ts`: provider interfaces, Kitsu series catalog adapter, Open Library search fallback and edition lookup, five-minute search/edition metadata caches, bounded requests, and offline sample provider. Provider identity is stored separately from edition fields.
- `src/ui/SearchResultCover.tsx`: fixed-size, lazy-loaded search/edition thumbnails with fallback artwork and alternate Kitsu image variants.
- `src/ui/`: collection interface, dialogs, status controls, and responsive design tokens/styles.

The repository/provider seams allow other providers and persistence adapters to be added. Different printings and regional editions are represented as separate records with optional edition notes. Kitsu may not know Brazilian or other localized publication schedules; always review the returned volume count and edition details before saving.

## Limitations

- This prototype has no Firebase, authentication, cloud sync, or cross-device sharing.
- Online search requires internet access and the Kitsu and/or Open Library catalogs. Kitsu is manga-specific; Open Library is a broad book catalog and may have weaker manga coverage. Catalog records may describe another language, publisher, or printing, so verify the ISBN and source record against the volume you own or intend to buy.
- AniList was evaluated as a possible source but is not integrated. Its published terms prohibit use in competing manga list/tracker services unless authorized, so this collection app must not use it without approval from AniList.
- Data lives in this browser's local storage and can be cleared by browser settings.

import { collection, deleteDoc, doc, getDoc, getDocs, runTransaction, setDoc, writeBatch, type Firestore } from 'firebase/firestore';
import { createManga, normalizeMangaRecord, resizeManga, validateSection, validateStatus, type CollectionSection, type Manga, type MangaInput, type VolumeEdition, type VolumeStatus } from '../model';
import type { MangaRepository } from '../repository';

const clean = (value: unknown) => JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
const sameTitle = (a: string, b: string) => a.trim().replace(/\s+/g, ' ').toLocaleLowerCase() === b.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
const CHUNK_SIZE = 400;
export interface MigrationResult { added: number; skipped: number; alreadyCompleted: boolean }

/** A user-scoped adapter. Every collection path is derived from the verified Auth UID. */
export class FirestoreMangaRepository implements MangaRepository {
  private readonly mangaCollection;
  private readonly migrationRef;
  constructor(private readonly db: Firestore, readonly uid: string) {
    if (!uid || uid.includes('/')) throw new Error('A valid signed-in user is required for cloud storage.');
    this.mangaCollection = collection(db, 'users', uid, 'manga');
    this.migrationRef = doc(db, 'users', uid, 'migrations', 'local-storage-v1');
  }

  async list(): Promise<Manga[]> {
    const snapshot = await getDocs(this.mangaCollection);
    return snapshot.docs.map(item => normalizeMangaRecord(item.data(), item.id));
  }

  async add(input: MangaInput, allowSeparateEdition = false): Promise<Manga> {
    const item = createManga(input);
    const ref = doc(this.mangaCollection, item.id);
    if (!allowSeparateEdition) {
      const existing = await getDocs(this.mangaCollection);
      if (existing.docs.some(record => sameTitle(String(record.data().title ?? ''), item.title))) {
        throw new Error('This title is already in your collection. Choose “Add as a separate edition” to keep both editions.');
      }
    }
    await setDoc(ref, clean(item));
    return item;
  }

  async update(id: string, input: MangaInput, confirmDrop = false): Promise<Manga> {
    const ref = doc(this.mangaCollection, id);
    const all = await getDocs(this.mangaCollection);
    if (all.docs.some(record => record.id !== id && sameTitle(String(record.data().title ?? ''), input.title))) throw new Error('Another entry already uses this title.');
    return runTransaction(this.db, async transaction => {
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists()) throw new Error('That manga could not be found.');
      const prior = normalizeMangaRecord(snapshot.data(), snapshot.id);
      const changed = resizeManga(prior, input, confirmDrop);
      transaction.set(ref, clean(changed));
      return changed;
    });
  }

  async setStatus(id: string, volumeIndex: number, status: VolumeStatus): Promise<Manga> {
    if (!validateStatus(status)) throw new Error('Choose a valid volume status.');
    const ref = doc(this.mangaCollection, id);
    return runTransaction(this.db, async transaction => {
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists()) throw new Error('That manga could not be found.');
      const manga = normalizeMangaRecord(snapshot.data(), snapshot.id);
      if (!Number.isInteger(volumeIndex) || volumeIndex < 0 || volumeIndex >= manga.totalVolumes) throw new Error('That volume could not be found.');
      const changed = { ...manga, statuses: manga.statuses.map((current, index) => index === volumeIndex ? status : current), updatedAt: new Date().toISOString() };
      transaction.set(ref, clean(changed));
      return changed;
    });
  }

  async setAllStatuses(id: string, status: VolumeStatus): Promise<Manga> {
    if (!validateStatus(status)) throw new Error('Choose a valid volume status.');
    const ref = doc(this.mangaCollection, id);
    return runTransaction(this.db, async transaction => {
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists()) throw new Error('That manga could not be found.');
      const manga = normalizeMangaRecord(snapshot.data(), snapshot.id);
      const changed = { ...manga, statuses: Array(manga.totalVolumes).fill(status), updatedAt: new Date().toISOString() };
      transaction.set(ref, clean(changed));
      return changed;
    });
  }

  async setVolumeEdition(id: string, volumeIndex: number, edition: VolumeEdition): Promise<Manga> {
    if (!edition || !['google-books', 'open-library'].includes(edition.provider) || !edition.providerId || !edition.title) throw new Error('Choose a valid catalog result.');
    const ref = doc(this.mangaCollection, id);
    return runTransaction(this.db, async transaction => {
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists()) throw new Error('That manga could not be found.');
      const manga = normalizeMangaRecord(snapshot.data(), snapshot.id);
      if (!Number.isInteger(volumeIndex) || volumeIndex < 0 || volumeIndex >= manga.totalVolumes) throw new Error('That volume could not be found.');
      const volumeEditions = [...manga.volumeEditions!];
      volumeEditions[volumeIndex] = edition;
      const changed = { ...manga, volumeEditions, updatedAt: new Date().toISOString() };
      transaction.set(ref, clean(changed));
      return changed;
    });
  }

  async setSection(id: string, section: CollectionSection): Promise<Manga> {
    if (!validateSection(section)) throw new Error('Choose a valid collection section.');
    const ref = doc(this.mangaCollection, id);
    return runTransaction(this.db, async transaction => {
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists()) throw new Error('That manga could not be found.');
      const changed = { ...normalizeMangaRecord(snapshot.data(), snapshot.id), section, updatedAt: new Date().toISOString() };
      transaction.set(ref, clean(changed));
      return changed;
    });
  }

  async remove(id: string): Promise<void> { await deleteDoc(doc(this.mangaCollection, id)); }

  async hasCompletedLocalMigration(): Promise<boolean> { return (await getDoc(this.migrationRef)).exists(); }

  /** Imports only after an explicit UI confirmation; stable local IDs prevent repeat imports. */
  async importLocalCollection(entries: Manga[]): Promise<MigrationResult> {
    if ((await getDoc(this.migrationRef)).exists()) return { added: 0, skipped: entries.length, alreadyCompleted: true };
    const existing = new Set((await getDocs(this.mangaCollection)).docs.map(item => item.id));
    const candidates = entries.map(item => normalizeMangaRecord(item)).filter(item => {
      if (existing.has(item.id)) return false;
      existing.add(item.id);
      return true;
    });
    const skipped = entries.length - candidates.length;
    for (let offset = 0; offset < candidates.length; offset += CHUNK_SIZE) {
      const batch = writeBatch(this.db);
      for (const item of candidates.slice(offset, offset + CHUNK_SIZE)) batch.set(doc(this.mangaCollection, item.id), clean(item));
      await batch.commit();
    }
    await setDoc(this.migrationRef, { completedAt: new Date().toISOString(), importedCount: candidates.length, skippedCount: skipped });
    return { added: candidates.length, skipped, alreadyCompleted: false };
  }
}


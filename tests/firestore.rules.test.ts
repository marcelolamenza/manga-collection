import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, doc, getDoc, getDocs, setDoc } from 'firebase/firestore';
import { createManga } from '../src/model';

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'demo-manga-catalog',
    firestore: {
      rules: readFileSync(resolve(process.cwd(), 'firestore.rules'), 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
  });
});

afterEach(async () => { if (testEnv) await testEnv.clearFirestore(); });
afterAll(async () => { if (testEnv) await testEnv.cleanup(); });

const mangaData = (id: string) => createManga({ title: 'Naruto', coverUrl: '', totalVolumes: 3 }, id);

describe('Firestore user isolation rules', () => {
  it('allows a user to create and read only their own manga', async () => {
    const alice = testEnv.authenticatedContext('alice').firestore();
    await assertSucceeds(setDoc(doc(alice, 'users/alice/manga/naruto'), mangaData('naruto')));
    await assertSucceeds(getDoc(doc(alice, 'users/alice/manga/naruto')));
    await assertFails(getDoc(doc(alice, 'users/bob/manga/naruto')));
    await assertFails(getDocs(collection(alice, 'users/bob/manga')));
  });

  it('denies unauthenticated access and cross-user writes', async () => {
    const alice = testEnv.authenticatedContext('alice').firestore();
    const bob = testEnv.authenticatedContext('bob').firestore();
    const unauthenticated = testEnv.unauthenticatedContext().firestore();
    await assertSucceeds(setDoc(doc(alice, 'users/alice/manga/naruto'), mangaData('naruto')));
    await assertFails(setDoc(doc(bob, 'users/alice/manga/forged'), mangaData('forged')));
    await assertFails(getDoc(doc(unauthenticated, 'users/alice/manga/naruto')));
    await assertFails(setDoc(doc(unauthenticated, 'users/alice/manga/forged'), mangaData('forged')));
  });

  it('rejects invalid status values and mismatched record IDs', async () => {
    const alice = testEnv.authenticatedContext('alice').firestore();
    const invalidStatus = mangaData('naruto');
    invalidStatus.statuses[0] = 'want-to-read' as typeof invalidStatus.statuses[number];
    await assertFails(setDoc(doc(alice, 'users/alice/manga/naruto'), invalidStatus));
    await assertFails(setDoc(doc(alice, 'users/alice/manga/other'), mangaData('naruto')));
  });
});

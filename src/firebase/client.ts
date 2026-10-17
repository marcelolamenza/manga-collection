import { getApp, getApps, initializeApp, type FirebaseApp, type FirebaseOptions } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';

export interface FirebaseServices { app: FirebaseApp; auth: Auth; db: Firestore }
export type FirebaseSetup = { mode: 'local'; message?: string } | { mode: 'firebase'; services: FirebaseServices };

/** Firebase is initialized only when the complete public web-app config is supplied. */
export function createFirebaseSetup(env: Record<string, string | undefined> = import.meta.env): FirebaseSetup {
  const values = {
    apiKey: env.VITE_FIREBASE_API_KEY,
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: env.VITE_FIREBASE_PROJECT_ID,
    appId: env.VITE_FIREBASE_APP_ID,
    messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  };
  const supplied = Object.values(values).filter(Boolean).length;
  if (supplied === 0) return { mode: 'local' };
  if (supplied !== Object.keys(values).length) return { mode: 'local', message: 'Firebase setup is incomplete. Add all required VITE_FIREBASE values to .env.local; the app is using browser-local storage.' };
  const options: FirebaseOptions = values as FirebaseOptions;
  try {
    const app = getApps().length ? getApp() : initializeApp(options);
    return { mode: 'firebase', services: { app, auth: getAuth(app), db: getFirestore(app) } };
  } catch {
    return { mode: 'local', message: 'Firebase could not be initialized. Check .env.local; the app is using browser-local storage.' };
  }
}

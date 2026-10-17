import { browserLocalPersistence, GoogleAuthProvider, setPersistence, signInWithPopup, signOut, type Auth } from 'firebase/auth';

export function firebaseErrorMessage(error: unknown): string {
  const code = (error as { code?: string })?.code ?? '';
  if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return 'Google sign-in was cancelled.';
  if (code === 'auth/popup-blocked') return 'Your browser blocked the Google sign-in window. Allow pop-ups for this site and try again.';
  if (code === 'auth/unauthorized-domain') return 'This site domain is not authorized in Firebase Authentication settings.';
  if (code === 'auth/operation-not-allowed') return 'Google sign-in is not enabled in the Firebase Console yet.';
  if (code === 'auth/web-storage-unsupported') return 'This browser is blocking sign-in storage. Open the site in full Safari or Chrome, not a private or in-app browser.';
  if (code === 'auth/operation-not-supported-in-this-environment') return 'This browser cannot complete Google sign-in here. Open the site in full Safari or Chrome.';
  if (code === 'auth/unauthorized-continue-uri') return 'Firebase rejected this site address. Add the exact site domain to Firebase Authentication’s authorized domains.';
  if (code === 'auth/network-request-failed') return 'Could not reach Firebase Authentication. Check your internet connection.';
  if (code === 'permission-denied' || code === 'firestore/permission-denied') return 'Firebase denied access to this collection. Check your sign-in and Firestore Security Rules.';
  if (code === 'unavailable' || code === 'firestore/unavailable') return 'Cloud storage is temporarily unavailable. Your change was not saved; try again.';
  return code ? `Firebase sign-in failed (${code}). Please try again in the full browser.` : 'Firebase could not complete that request. Please try again.';
}

export async function signInWithGoogle(auth: Auth): Promise<void> {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  // GitHub Pages cannot proxy Firebase's auth helper to the app origin. On
  // mobile browsers that block third-party storage, signInWithRedirect can
  // return without restoring the session; a popup avoids that cross-site step.
  await setPersistence(auth, browserLocalPersistence);
  await signInWithPopup(auth, provider);
}

export async function signOutGoogle(auth: Auth): Promise<void> { await signOut(auth); }


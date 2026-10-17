import { GoogleAuthProvider, signInWithPopup, signInWithRedirect, signOut, type Auth } from 'firebase/auth';

export function firebaseErrorMessage(error: unknown): string {
  const code = (error as { code?: string })?.code ?? '';
  if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return 'Google sign-in was cancelled.';
  if (code === 'auth/popup-blocked') return 'Your browser blocked the Google sign-in window. Allow pop-ups for this site and try again.';
  if (code === 'auth/unauthorized-domain') return 'This site domain is not authorized in Firebase Authentication settings.';
  if (code === 'auth/operation-not-allowed') return 'Google sign-in is not enabled in the Firebase Console yet.';
  if (code === 'auth/network-request-failed') return 'Could not reach Firebase Authentication. Check your internet connection.';
  if (code === 'permission-denied' || code === 'firestore/permission-denied') return 'Firebase denied access to this collection. Check your sign-in and Firestore Security Rules.';
  if (code === 'unavailable' || code === 'firestore/unavailable') return 'Cloud storage is temporarily unavailable. Your change was not saved; try again.';
  return 'Firebase could not complete that request. Please try again.';
}

export async function signInWithGoogle(auth: Auth): Promise<void> {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  if (/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) await signInWithRedirect(auth, provider);
  else await signInWithPopup(auth, provider);
}

export async function signOutGoogle(auth: Auth): Promise<void> { await signOut(auth); }

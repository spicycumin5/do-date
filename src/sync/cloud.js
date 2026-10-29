// Google sign-in + Firestore sync. One document per user at users/{uid} holding the whole state.
// localStorage stays the local cache; this module mirrors it to the signed-in account.

import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signInWithRedirect, signOut } from 'firebase/auth';
import { getFirestore, doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';
import { firebaseConfig } from './config.js';
import { emptyState, normalize } from '../state/model.js';
import { state, commit, subscribe, replaceState } from '../state/store.js';

const UPLOAD_DELAY_MS = 800;
const PENDING_KEY = 'dodate.pending'; // set while this browser has edits the cloud hasn't seen

function setPending(on) {
  try { on ? localStorage.setItem(PENDING_KEY, '1') : localStorage.removeItem(PENDING_KEY); } catch (e) { /* storage unavailable */ }
}
function hasPending() {
  try { return localStorage.getItem(PENDING_KEY) === '1'; } catch (e) { return false; }
}

/**
 * `onStatus({ user, status })` reports the account (or null) and one of
 * 'signed-out' | 'loading' | 'saving' | 'saved' | 'offline' | 'error'.
 */
export function initCloud({ onStatus, onMessage }) {
  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getFirestore(app);
  const clientId = Math.random().toString(36).slice(2);

  let user = null, ref = null, unsubRemote = null;
  let applyingRemote = false, timer = 0, lastRemoteAt = 0;

  const report = status => onStatus({ user, status });

  function applyRemote(data) {
    const s = normalize(data.state);
    if (!s) return;
    lastRemoteAt = data.updatedAt || 0;
    applyingRemote = true;
    replaceState(s);
    commit({ list: true, settings: true });
    applyingRemote = false;
  }

  async function upload() {
    if (!ref) return;
    report(navigator.onLine ? 'saving' : 'offline');
    try {
      // Firestore rejects undefined values; a JSON round trip drops them.
      const updatedAt = Date.now();
      await setDoc(ref, { state: JSON.parse(JSON.stringify(state)), updatedAt, clientId });
      lastRemoteAt = updatedAt;
      setPending(false);
      report('saved');
    } catch (e) {
      console.error('[do-date] save failed', e);
      report('error');
    }
  }

  subscribe(() => {
    if (!ref || applyingRemote) return;
    clearTimeout(timer);
    setPending(true);
    report('saving');
    timer = setTimeout(() => { timer = 0; upload(); }, UPLOAD_DELAY_MS);
  });

  window.addEventListener('beforeunload', () => {
    if (timer) upload();
  });

  onAuthStateChanged(auth, async u => {
    unsubRemote?.();
    unsubRemote = null;
    clearTimeout(timer);
    user = u;
    ref = null;
    lastRemoteAt = 0;
    if (!u) return report('signed-out');

    report('loading');
    const userRef = doc(db, 'users', u.uid);
    try {
      const snap = await getDoc(userRef);
      ref = userRef;
      if (snap.exists() && !hasPending()) {
        applyRemote(snap.data());
      } else if (snap.exists()) {
        // This browser has edits that never reached the cloud (e.g. tab closed mid-save): they win.
        await upload();
      } else {
        // First sign-in on this account: keep what's in this browser and upload it.
        await upload();
        onMessage('Signed in. Your tank is now saved to your account.');
      }
      report('saved');
    } catch (e) {
      console.error('[do-date] load failed', e);
      return report('error');
    }

    // Live updates from other devices.
    unsubRemote = onSnapshot(userRef, snap => {
      if (snap.metadata.hasPendingWrites || !snap.exists()) return;
      const data = snap.data();
      if (data.clientId === clientId || (data.updatedAt || 0) <= lastRemoteAt) return;
      applyRemote(data);
    });
  });

  window.addEventListener('online', () => ref && upload());
  window.addEventListener('offline', () => ref && report('offline'));

  return {
    async signIn() {
      const provider = new GoogleAuthProvider();
      try {
        await signInWithPopup(auth, provider);
      } catch (e) {
        if (e.code === 'auth/popup-blocked') return signInWithRedirect(auth, provider);
        if (e.code !== 'auth/popup-closed-by-user' && e.code !== 'auth/cancelled-popup-request') {
          console.error('[do-date] sign-in failed', e);
          onMessage("Couldn't sign in. Please try again.");
        }
      }
    },
    async signOut() {
      if (timer) {
        clearTimeout(timer);
        timer = 0;
        await upload();
      }
      unsubRemote?.();
      unsubRemote = null;
      ref = null;
      await signOut(auth);
      setPending(false);
      // The data lives in the account now; don't leave it behind in this browser.
      replaceState(emptyState());
      commit({ list: true, settings: true });
      onMessage('Signed out. Your tank is saved to your account.');
    },
  };
}

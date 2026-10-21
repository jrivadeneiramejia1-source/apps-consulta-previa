// Módulo falso de Firebase Authentication (solo para pruebas locales): inicio anónimo con un uid por teléfono.
const KEY = '__auth_uid';
const auth = { currentUser: null };
export function getAuth() { if (!auth.currentUser) { const u = localStorage.getItem(KEY); if (u) auth.currentUser = { uid: u, isAnonymous: true }; } return Object.assign(auth, { authStateReady: async () => {} }); }
export function connectAuthEmulator() {}
export async function signInAnonymously(a) {
  if (window.__authFallar) { const e = new Error('falla simulada'); e.code = window.__authFallar; throw e; }
  const uid = 'u-' + Math.random().toString(36).slice(2, 10); localStorage.setItem(KEY, uid); a.currentUser = { uid, isAnonymous: true }; return { user: a.currentUser };
}
export async function signOut(a) { localStorage.removeItem(KEY); a.currentUser = null; }

const KEY = 'macrowire_auth';

export function getAuth() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setAuth(email) {
  localStorage.setItem(KEY, JSON.stringify({ email, at: Date.now() }));
}

export function clearAuth() {
  localStorage.removeItem(KEY);
}

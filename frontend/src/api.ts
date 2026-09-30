const apiBaseUrl = import.meta.env.VITE_API_URL ?? "http://localhost:5000";

export function apiFetch(path: string, init?: RequestInit) {
  return fetch(`${apiBaseUrl}${path}`, init);
}

const configuredApiUrl =
  import.meta.env.VITE_API_URL ?? "https://pharmasense-api-mtei.onrender.com";
const apiBaseUrl = configuredApiUrl.includes("://")
  ? configuredApiUrl
  : `https://${configuredApiUrl}`;

export function apiFetch(path: string, init?: RequestInit) {
  return fetch(`${apiBaseUrl}${path}`, init);
}

type PaginatedResponse<T> = {
  success?: boolean;
  data?: T[];
  meta?: { totalPages?: number };
  error?: string | { message?: string };
};

/** Read every page from an API collection so screens never silently omit older records. */
export async function fetchAllPages<T>(path: string, init?: RequestInit): Promise<T[]> {
  return readAllPages(await apiFetch(pagePath(path, 1), init), path, init);
}

function pagePath(path: string, page: number) {
  const [pathname, query = ""] = path.split("?", 2);
  const params = new URLSearchParams(query);
  params.set("page", String(page));
  params.set("pageSize", "100");
  return `${pathname}?${params.toString()}`;
}

export async function readAllPages<T>(
  firstResponse: Response,
  path: string,
  init?: RequestInit,
): Promise<T[]> {
  const first = (await firstResponse.json()) as PaginatedResponse<T>;
  if (!firstResponse.ok || !first.success || !Array.isArray(first.data)) {
    const message = typeof first.error === "string" ? first.error : first.error?.message;
    throw new Error(message || `Unable to load ${path}.`);
  }
  const totalPages = first.meta?.totalPages ?? 1;
  if (totalPages <= 1) return first.data;
  const pages = await Promise.all(
    Array.from({ length: totalPages - 1 }, async (_, index) => {
      const response = await apiFetch(pagePath(path, index + 2), init);
      const result = (await response.json()) as PaginatedResponse<T>;
      if (!response.ok || !result.success || !Array.isArray(result.data)) {
        const message = typeof result.error === "string" ? result.error : result.error?.message;
        throw new Error(message || `Unable to load ${path}.`);
      }
      return result.data;
    }),
  );
  return first.data.concat(...pages);
}

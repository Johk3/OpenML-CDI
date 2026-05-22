export const POST_AUTH_REDIRECT_STORAGE_KEY = 'openml.postAuthRedirectPath';
export const DEFAULT_POST_AUTH_REDIRECT_PATH = '/datasets';

type LocationLike = {
  pathname?: unknown;
  search?: unknown;
  hash?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function getSessionStorage(): Storage | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function isSafeInternalPath(path: string): boolean {
  return path.startsWith('/') && !path.startsWith('//') && !path.includes('\\');
}

function pathFromLocationLike(location: LocationLike): string | null {
  if (typeof location.pathname !== 'string' || !isSafeInternalPath(location.pathname)) {
    return null;
  }

  const search =
    typeof location.search === 'string' && location.search.startsWith('?') ? location.search : '';
  const hash =
    typeof location.hash === 'string' && location.hash.startsWith('#') ? location.hash : '';

  return `${location.pathname}${search}${hash}`;
}

export function postAuthRedirectPathFromState(state: unknown): string | null {
  if (!isRecord(state) || !isRecord(state.from)) {
    return null;
  }

  return pathFromLocationLike(state.from);
}

export function storePostAuthRedirectFromState(state: unknown): void {
  const path = postAuthRedirectPathFromState(state);
  if (!path) {
    return;
  }

  getSessionStorage()?.setItem(POST_AUTH_REDIRECT_STORAGE_KEY, path);
}

export function consumePostAuthRedirectPath(
  fallbackPath = DEFAULT_POST_AUTH_REDIRECT_PATH,
): string {
  const storage = getSessionStorage();
  if (!storage) {
    return fallbackPath;
  }

  const path = storage.getItem(POST_AUTH_REDIRECT_STORAGE_KEY);
  storage.removeItem(POST_AUTH_REDIRECT_STORAGE_KEY);

  if (!path || !isSafeInternalPath(path)) {
    return fallbackPath;
  }

  return path;
}

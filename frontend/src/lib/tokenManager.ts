import { TokenPayload } from '@/types/token';
import { jwtDecode } from 'jwt-decode';

class TokenManager {
  private static instance: TokenManager;
  private accessToken: string | null = null;
  private refreshPromise: Promise<string> | null = null;
  private onUnauthenticated: (() => void) | null = null;
  private initialized: boolean = false;

  private constructor() {}

  static getInstance(): TokenManager {
    if (!TokenManager.instance) {
      TokenManager.instance = new TokenManager();
    }
    return TokenManager.instance;
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  markInitialized(): void {
    this.initialized = true;
  }

  registerUnauthenticatedHandler(fn: () => void) {
    this.onUnauthenticated = fn;
  }

  triggerUnauthenticated() {
    this.onUnauthenticated?.();
  }

  setToken(token: string): void {
    this.accessToken = token;
  }

  clearToken(): void {
    this.accessToken = null;
  }

  getToken(): string | null {
    return this.accessToken;
  }

  isTokenExpired(): boolean {
    if (!this.accessToken) return true;
    try {
      const payload = jwtDecode<TokenPayload>(this.accessToken);
      return payload.exp * 1000 < Date.now() + 10_000; // 10 sec buffer to refresh early
    } catch {
      return true;
    }
  }

  async ensureFreshToken(refreshFn: () => Promise<string>): Promise<string> {
    // If token is valid
    if (this.accessToken && !this.isTokenExpired()) {
      return this.accessToken;
    }

    // If there is already a refresh in progress join the queue
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    this.refreshPromise = refreshFn()
      .then((newToken) => {
        this.setToken(newToken);
        return newToken;
      })
      .finally(() => {
        this.refreshPromise = null;
      });

    return this.refreshPromise;
  }
}

export const tokenManager = TokenManager.getInstance();

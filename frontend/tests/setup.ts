import '@testing-library/jest-dom/vitest';
import { beforeEach, vi } from 'vitest';
import { mockNavigate, navigationMocks } from './mocks/navigation';
import { mockDatasetService, resetDatasetServiceMocks } from './mocks/datasetService';
import { PropsWithChildren } from 'react';

// Prevents HTML dump on error message

vi.setConfig({ testTimeout: 15000 });

beforeEach(() => {
  resetDatasetServiceMocks();
});

// Global mock for dataset service
vi.mock('@/services/datasetService', () => ({
  DatasetService: mockDatasetService,
}));

// Global mock for navigation
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => (navigationMocks.useActualNavigate ? actual.useNavigate() : mockNavigate),
  };
});

// Global mock for motion/react
vi.mock('motion/react', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('motion/react');

  type ReactMod = {
    createElement: (...args: unknown[]) => unknown;
    Fragment: unknown;
    forwardRef: (...args: unknown[]) => unknown;
    default?: {
      createElement: (...args: unknown[]) => unknown;
      Fragment: unknown;
      forwardRef: (...args: unknown[]) => unknown;
    };
  };
  const ReactModule = (await import('react')) as unknown as ReactMod;
  const createElement = ReactModule.createElement || ReactModule.default?.createElement;
  const Fragment = ReactModule.Fragment || ReactModule.default?.Fragment;
  const forwardRef = ReactModule.forwardRef || ReactModule.default?.forwardRef;

  const componentCache = new Map();

  return {
    ...actual,
    AnimatePresence: ({ children }: { children: unknown }) =>
      createElement(Fragment, null, children),
    motion: new Proxy(actual.motion as object, {
      get: (target: Record<string, unknown>, prop: string) => {
        if (typeof prop === 'string') {
          if (!componentCache.has(prop)) {
            const MockComponent = forwardRef((props: Record<string, unknown>, ref: unknown) => {
              const rest = { ...props };
              delete rest.initial;
              delete rest.animate;
              delete rest.exit;
              delete rest.transition;
              return createElement(prop, { ...rest, ref }, props.children);
            }) as { displayName?: string };
            MockComponent.displayName = `motion.${prop}`;
            componentCache.set(prop, MockComponent);
          }
          return componentCache.get(prop);
        }
        return target[prop as keyof typeof target];
      },
    }),
  };
});

// Global mock for AuthContext
vi.mock('@/contexts/AuthContext', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@/contexts/AuthContext');

  return {
    ...actual,
    AuthProvider: ({ children }: { children: PropsWithChildren }) => children,
  };
});

vi.mock('@/hooks/useAuth', async () => {
  return {
    useAuth: vi.fn().mockReturnValue({
      isAuthenticated: false,
      loginWithGithub: vi.fn().mockResolvedValue(''),
      login: vi.fn(),
      logout: vi.fn(),
    }),
  };
});

// Centralized ResizeObserver mock required by Radix UI components
class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}
window.ResizeObserver = ResizeObserverMock;

// Centralized PointerEvent mock required by Radix UI interactive components
if (typeof window.PointerEvent === 'undefined') {
  class PointerEvent extends MouseEvent {
    pointerId: number;
    pointerType: string;
    isPrimary: boolean;
    constructor(type: string, params: PointerEventInit = {}) {
      super(type, params);
      this.pointerId = params.pointerId ?? 1;
      this.pointerType = params.pointerType ?? 'mouse';
      this.isPrimary = params.isPrimary ?? true;
    }
  }
  window.PointerEvent = PointerEvent as unknown as typeof window.PointerEvent;
}

// Stub scrollIntoView, pointer capture helpers
window.HTMLElement.prototype.scrollIntoView = () => {};
window.HTMLElement.prototype.releasePointerCapture = () => {};
window.HTMLElement.prototype.hasPointerCapture = () => false;

if (typeof window.localStorage.clear !== 'function') {
  const storage = new Map<string, string>();
  const localStorageMock: Storage = {
    get length() {
      return storage.size;
    },
    clear: () => storage.clear(),
    getItem: (key: string) => storage.get(key) ?? null,
    key: (index: number) => Array.from(storage.keys())[index] ?? null,
    removeItem: (key: string) => storage.delete(key),
    setItem: (key: string, value: string) => storage.set(key, String(value)),
  };

  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: localStorageMock,
  });
}

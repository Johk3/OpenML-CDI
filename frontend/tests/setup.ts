import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';
import { mockNavigate } from './mocks/navigation';

// Global mock for navigation
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
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
vi.mock('../src/context/AuthContext', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('../src/context/AuthContext');

  type ReactMod = {
    createElement: (...args: unknown[]) => unknown;
    Fragment: unknown;
    default?: { createElement: (...args: unknown[]) => unknown; Fragment: unknown };
  };
  const ReactModule = (await import('react')) as unknown as ReactMod;
  const createElement = ReactModule.createElement || ReactModule.default?.createElement;
  const Fragment = ReactModule.Fragment || ReactModule.default?.Fragment;

  return {
    ...actual,
    useAuth: (await import('vitest')).vi.fn().mockReturnValue({
      user: { id: 'test-user', name: 'Test User', role: 'user' },
      login: (await import('vitest')).vi.fn(),
      logout: (await import('vitest')).vi.fn(),
    }),
    AuthProvider: ({ children }: { children: unknown }) => createElement(Fragment, null, children),
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

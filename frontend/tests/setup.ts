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

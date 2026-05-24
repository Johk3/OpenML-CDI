import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createRootMock, renderMock } = vi.hoisted(() => ({
  createRootMock: vi.fn(() => ({ render: renderMock })),
  renderMock: vi.fn(),
}));

vi.mock('react-dom/client', () => ({
  createRoot: createRootMock,
}));

vi.mock('react-router-dom', () => ({
  RouterProvider: () => null,
}));

vi.mock('../src/routes', () => ({
  router: {},
}));

const loadMain = async ({
  savedTheme,
  prefersDark,
}: {
  savedTheme?: 'dark' | 'light';
  prefersDark: boolean;
}) => {
  vi.resetModules();
  document.body.innerHTML = '<div id="root"></div>';
  document.documentElement.classList.remove('dark');
  localStorage.clear();
  if (savedTheme) {
    localStorage.setItem('theme', savedTheme);
  }
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn().mockReturnValue({
      matches: prefersDark,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }),
  });

  await import('../src/main');
};

describe('startup theme', () => {
  beforeEach(() => {
    createRootMock.mockClear();
    renderMock.mockClear();
  });

  it('uses light mode by default even when the system prefers dark', async () => {
    await loadMain({ prefersDark: true });

    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('applies the saved dark preference before rendering', async () => {
    await loadMain({ savedTheme: 'dark', prefersDark: false });

    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('keeps a saved light preference when the system prefers dark', async () => {
    await loadMain({ savedTheme: 'light', prefersDark: true });

    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });
});

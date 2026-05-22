import { screen } from '@testing-library/react';
import { Navigate } from 'react-router-dom';
import { tokenManager } from '@/lib/tokenManager';
import { UserService } from '@/services/userService';
import type { User } from '@/types/auth';
import { mockDatasetService } from '../mocks/datasetService';
import { navigationMocks } from '../mocks/navigation';
import { routes } from '../../src/routes';
import { mockNavigate, navigateTo } from '../utils';
import { useAuth } from '@/hooks/useAuth';
import { AuthContextValue } from '@/contexts/AuthContext';

vi.mock('@/services/userService', () => ({
  UserService: {
    getMe: vi.fn(),
  },
}));

const expectedRoutePaths = [
  '/',
  '/datasets',
  '/datasets/:id',
  '/expert-queue',
  '/login',
  '/login/callback',
  '/about',
  '/account',
  '/metadata',
  '/profile',
  '/*',
];

const childRoutePaths = () =>
  routes[0].children?.map((route) => (route.index ? '/' : `/${route.path}`)) ?? [];

const encodeTokenPart = (value: object) =>
  btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const validAccessToken = [
  encodeTokenPart({ alg: 'none', typ: 'JWT' }),
  encodeTokenPart({ exp: 9_999_999_999 }),
  'test-signature',
].join('.');

const authenticatedUser: User = {
  id: 'test-user',
  first_name: 'Test',
  last_name: 'User',
  role: 'user' as const,
  email: 'test@test.com',
  username: 'testuser',
  datasets: [],
  created_at: '2026-01-01',
};

const authenticateAs = (user: User = authenticatedUser) => {
  tokenManager.setToken(validAccessToken);
  vi.mocked(UserService.getMe).mockResolvedValue(user);
};

describe('Router', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tokenManager.clearToken();
    mockNavigate.mockClear();
    navigationMocks.useActualNavigate = false;
    mockDatasetService.listDatasets.mockResolvedValue([]);
  });

  it('defines the expected frontend route table', () => {
    expect(childRoutePaths()).toEqual(expectedRoutePaths);
  });

  it.each([
    { path: '/', heading: /share your dataset/i },
    { path: '/about', heading: /about openml cdi/i },
    { path: '/login', heading: /welcome to openml cdi/i },
    { path: '/datasets', heading: /authentication required/i },
    { path: '/datasets/example-dataset', heading: /authentication required/i },
  ])('renders the expected page for $path', ({ path, heading }) => {
    navigateTo(path);

    expect(screen.getByRole('heading', { name: heading })).toBeInTheDocument();
  });

  it.each(['/account', '/metadata', '/expert-queue'])(
    'redirects unauthenticated visitors from %s to login',
    (path) => {
      navigateTo(path);

      expect(screen.getByRole('heading', { name: /welcome to openml cdi/i })).toBeInTheDocument();
      expect(screen.getByText('Please sign in to continue.')).toBeInTheDocument();
    },
  );

  it.each([
    { path: '/account', heading: /manage your account/i },
    { path: '/metadata', heading: /dataset metadata/i },
  ])('renders authenticated protected route $path', async ({ path, heading }) => {
    vi.mocked(useAuth).mockReturnValue({ isAuthenticated: true } as AuthContextValue);
    authenticateAs({ ...authenticatedUser, role: 'user' });

    navigateTo(path);

    expect(await screen.findByRole('heading', { name: heading })).toBeInTheDocument();
  });

  it('renders authenticated expert queue route for expert users', async () => {
    authenticateAs({ ...authenticatedUser, role: 'expert' });

    navigateTo('/expert-queue');

    expect(
      await screen.findByRole('heading', { name: /expert review queue/i }),
    ).toBeInTheDocument();
  });

  it('routes GitHub callback visits without OAuth params back to the login screen', async () => {
    navigationMocks.useActualNavigate = true;
    navigateTo('/login/callback');

    expect(
      await screen.findByRole('heading', { name: /welcome to openml cdi/i }),
    ).toBeInTheDocument();
    expect(screen.getByText('No authorization code provided.')).toBeInTheDocument();
  });

  it('renders the not found page for an invalid route', () => {
    navigateTo('/invalid-route');

    expect(screen.getByRole('heading', { name: /page not found/i })).toBeInTheDocument();
  });

  it('redirects the retired profile route to account', () => {
    const profileRoute = routes[0].children?.find((route) => route.path === 'profile');

    expect(profileRoute?.element).toEqual(<Navigate to="/account" replace />);
  });
});

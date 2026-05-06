import { createBrowserRouter, RouteObject } from 'react-router-dom';
import App from '../App';
import { UploadPage } from '../pages/UploadPage';
import { MyDatasetsPage } from '../pages/MyDatasetsPage';
import { LoginPage } from '../pages/LoginPage';
import { AboutPage } from '../pages/AboutPage';
import { DatasetDetailPage } from '../pages/DatasetDetailPage';
import { GitHubCallbackPage } from '../pages/GitHubCallbackPage';
import { NotFoundPage } from '../pages/NotFoundPage';
import { MainLayout } from '../components/MainLayout';
import { CroissantMetadataPage } from '../pages/CroissantMetadataPage';
import { AccountPage } from '../pages/AccountPage';
import { ProtectedRoute } from '../components/ProtectedRoute';
import { UserPage } from '../pages/UserPage';
import { Providers } from '../providers/Providers';

export const routes: RouteObject[] = [
  {
    path: '/',
    element: (
      <Providers>
        <App />
      </Providers>
    ),
    errorElement: (
      <Providers>
        <MainLayout>
          <NotFoundPage />
        </MainLayout>
      </Providers>
    ),
    children: [
      {
        index: true,
        element: <UploadPage />,
      },

      {
        path: 'datasets',
        element: <MyDatasetsPage />,
      },
      {
        path: 'datasets/:id',
        element: <DatasetDetailPage />,
      },
      {
        path: 'login',
        element: <LoginPage />,
      },
      {
        path: 'login/callback',
        element: <GitHubCallbackPage />,
      },
      {
        path: 'about',
        element: <AboutPage />,
      },
      {
        path: 'account',
        element: (
          <ProtectedRoute>
            <AccountPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'metadata',
        element: (
          <ProtectedRoute>
            <CroissantMetadataPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'profile',
        element: (
          <ProtectedRoute>
            <UserPage />
          </ProtectedRoute>
        ),
      },
      {
        path: '*',
        element: <NotFoundPage />,
      },
    ],
  },
];

export const router = createBrowserRouter(routes);

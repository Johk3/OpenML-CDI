import { createBrowserRouter } from 'react-router-dom';
import App from '../App';
import { UploadPage } from '../pages/UploadPage';
import { MyDatasetsPage } from '../pages/MyDatasetsPage';
import { LoginPage } from '../pages/LoginPage';
import { AboutPage } from '../pages/AboutPage';
import { NotFoundPage } from '../pages/NotFoundPage';
import { MainLayout } from '../components/MainLayout';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
    errorElement: (
      <MainLayout>
        <NotFoundPage />
      </MainLayout>
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
        path: 'login',
        element: <LoginPage />,
      },
      {
        path: 'about',
        element: <AboutPage />,
      },
      {
        path: '*',
        element: <NotFoundPage />,
      },
    ],
  },
]);

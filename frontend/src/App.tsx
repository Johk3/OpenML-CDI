import { AuthProvider } from './providers/AuthProvider';
import { Outlet } from 'react-router-dom';
import { MainLayout } from './components/MainLayout';
import { UserProvider } from './providers/UserProvider';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const queryClient = new QueryClient();

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <UserProvider>
          <MainLayout>
            <Outlet />
          </MainLayout>
        </UserProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;

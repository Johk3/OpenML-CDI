import { AuthProvider } from './context/AuthContext';
import { Outlet } from 'react-router-dom';
import { MainLayout } from './components/MainLayout';

function App() {
  return (
    <AuthProvider>
      <MainLayout>
        <Outlet />
      </MainLayout>
    </AuthProvider>
  );
}

export default App;

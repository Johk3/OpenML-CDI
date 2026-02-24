import { useState } from 'react';
import { MainLayout } from './components/MainLayout';
import { UploadPage } from './pages/UploadPage';
import { MyDatasetsPage } from './pages/MyDatasetsPage';
import { LoginPage } from './pages/LoginPage';
import { AuthProvider } from './context/AuthContext';

export type Page = 'upload' | 'datasets' | 'login';

function AppContent() {
  const [currentPage, setCurrentPage] = useState<Page>('upload');

  return (
    <MainLayout currentPage={currentPage} onNavigate={setCurrentPage}>
      {currentPage === 'upload' && <UploadPage />}
      {currentPage === 'datasets' && <MyDatasetsPage />}
      {currentPage === 'login' && <LoginPage onNavigate={setCurrentPage} />}
    </MainLayout>
  );
}

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;

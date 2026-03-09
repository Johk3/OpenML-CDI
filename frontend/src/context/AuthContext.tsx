import React, { createContext, useState, ReactNode, useContext } from 'react';
import { User, UserRole } from '../types/auth';

interface AuthContextType {
  user: User | null;
  login: (role: UserRole) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);

  const login = (role: UserRole) => {
    // Generate a mock user based on the selected role
    const mockUser: User = {
      id: role === 'expert' ? 'exp-1' : 'cus-1',
      name: role === 'expert' ? 'Expert' : 'Customer',
      role,
    };
    setUser(mockUser);
  };

  const logout = () => {
    setUser(null);
  };

  return <AuthContext.Provider value={{ user, login, logout }}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export { AuthContext };

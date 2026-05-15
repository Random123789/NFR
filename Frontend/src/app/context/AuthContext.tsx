import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { getCurrentUser, login as loginApi, logout as logoutApi, setStoredToken, clearStoredAuth, getStoredToken, type AuthUser } from "../data/apiClient";

interface AuthContextType {
  user: AuthUser | null;
  token: string | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  setSessionUser: (user: AuthUser | null) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(() => getStoredToken());
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function bootstrapUser() {
      if (!token) {
        if (mounted) {
          setUser(null);
          setIsLoading(false);
        }
        return;
      }

      try {
        const current = await getCurrentUser();
        if (mounted) {
          setUser(current);
        }
      } catch {
        clearStoredAuth();
        if (mounted) {
          setToken(null);
          setUser(null);
        }
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    }

    void bootstrapUser();

    return () => {
      mounted = false;
    };
  }, [token]);

  const value = useMemo<AuthContextType>(() => ({
    user,
    token,
    isLoading,
    setSessionUser: setUser,
    login: async (email: string, password: string) => {
      const result = await loginApi(email, password);
      setStoredToken(result.token);
      setToken(result.token);
      setUser(result.user);
    },
    logout: async () => {
      try {
        await logoutApi();
      } catch {
        // Local logout should still complete if API logout fails.
      }
      clearStoredAuth();
      setToken(null);
      setUser(null);
    },
  }), [isLoading, token, user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}

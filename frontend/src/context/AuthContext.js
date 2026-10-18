import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { Platform } from "react-native";
import { getCurrentUser, onSessionExpired } from "../services/api";

const AUTH_TOKEN_KEY = "auth_token";
const PENDING_INVITATION_KEY = "cyanea_pending_invitation";

// expo-secure-store no funciona en web; usamos localStorage como fallback
const storage = {
  async getItem(key) {
    if (Platform.OS === "web") {
      return typeof localStorage !== "undefined" ? localStorage.getItem(key) : null;
    }
    const SecureStore = await import("expo-secure-store");
    return SecureStore.getItemAsync(key);
  },
  async setItem(key, value) {
    if (Platform.OS === "web") {
      if (typeof localStorage !== "undefined") localStorage.setItem(key, value);
      return;
    }
    const SecureStore = await import("expo-secure-store");
    return SecureStore.setItemAsync(key, value);
  },
  async removeItem(key) {
    if (Platform.OS === "web") {
      if (typeof localStorage !== "undefined") localStorage.removeItem(key);
      return;
    }
    const SecureStore = await import("expo-secure-store");
    return SecureStore.deleteItemAsync(key);
  },
};

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [pendingInvitation, setPendingInvitation] = useState(null);

  useEffect(() => {
    async function loadToken() {
      try {
        const pending = await storage.getItem(PENDING_INVITATION_KEY).catch(() => null);
        setPendingInvitation(pending);
        const stored = await storage.getItem(AUTH_TOKEN_KEY);

        if (!stored) {
          setToken(null);
          return;
        }

        // Lo ponemos temporalmente para que authHeaders() lo use
        setToken(stored);

        try {
          const currentUser = await getCurrentUser(); // valida el token contra backend
          setUser(currentUser);
        } catch {
          await storage.removeItem(AUTH_TOKEN_KEY);
          setToken(null);
          setUser(null);
        }
      } catch {
        setToken(null);
      } finally {
        setIsLoading(false);
      }
    }

    loadToken();
  }, []);

  const login = useCallback(async (newToken) => {
    await storage.setItem(AUTH_TOKEN_KEY, newToken);
    setToken(newToken);

    const currentUser = await getCurrentUser();
    setUser(currentUser);
  }, []);

  const logout = useCallback(async () => {
    await storage.removeItem(AUTH_TOKEN_KEY);
    setToken(null);
    setUser(null);
  }, []);

  // US 101: el token dejó de valer (p. ej. se cambió la contraseña en otro
  // dispositivo): se cierra la sesión y la app vuelve al login.
  useEffect(() => {
    if (!token || typeof onSessionExpired !== "function") return undefined;
    return onSessionExpired(() => {
      logout();
    });
  }, [token, logout]);

  const rememberInvitation = useCallback(async (invitationToken) => {
    setPendingInvitation(invitationToken || null);
    if (invitationToken) await storage.setItem(PENDING_INVITATION_KEY, invitationToken);
    else await storage.removeItem(PENDING_INVITATION_KEY);
  }, []);

  return (
    <AuthContext.Provider value={{ token, user, isLoading, login, logout, pendingInvitation, rememberInvitation }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth debe usarse dentro de AuthProvider");
  return ctx;
}

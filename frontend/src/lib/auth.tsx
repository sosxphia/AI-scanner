import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { Platform } from "react-native";
import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";
import Purchases from "react-native-purchases";

import { storage } from "@/src/utils/storage";
import { BACKEND_URL, TOKEN_KEY, setAuthToken } from "./api";
import { rcEnabled } from "./revenuecat";

WebBrowser.maybeCompleteAuthSession();

export type User = {
  user_id: string;
  email: string;
  name?: string;
  picture?: string;
};

const sentSessionIds = new Set<string>();

const extractSessionId = (url?: string | null): string | null => {
  if (!url) return null;
  const m = url.match(/[?#&]session_id=([^&#]+)/);
  return m ? m[1] : null;
};

const cleanWebUrl = () => {
  try {
    const u = new URL(window.location.href);
    u.searchParams.delete("session_id");
    let hash = u.hash;
    if (hash.includes("session_id")) {
      const params = new URLSearchParams(hash.replace(/^#/, ""));
      params.delete("session_id");
      const rest = params.toString();
      hash = rest ? `#${rest}` : "";
    }
    window.history.replaceState(window.history.state, "", u.pathname + u.search + hash);
  } catch {}
};

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  token: string | null;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  purchaseIdentityError: string | null;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [purchaseIdentityError, setPurchaseIdentityError] = useState<string | null>(null);
  const rcIdentityRef = useRef<string | null>(null);

  const exchangeSession = useCallback(async (sessionId: string): Promise<boolean> => {
    if (sentSessionIds.has(sessionId)) return false;
    sentSessionIds.add(sessionId);
    try {
      const res = await fetch(`${BACKEND_URL}/api/auth/session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId }),
      });
      if (!res.ok) return false;
      const data = await res.json();
      await storage.secureSet(TOKEN_KEY, data.session_token);
      setAuthToken(data.session_token);
      setToken(data.session_token);
      setUser(data.user);
      return true;
    } catch (e) {
      console.warn("Session exchange failed:", e);
      return false;
    }
  }, []);

  const checkStored = useCallback(async () => {
    const stored = await storage.secureGet<string | null>(TOKEN_KEY, null);
    if (!stored || typeof stored !== "string") return;
    setAuthToken(stored);
    try {
      const res = await fetch(`${BACKEND_URL}/api/auth/me`, {
        headers: { Authorization: `Bearer ${stored}` },
      });
      if (res.ok) {
        setToken(stored);
        setUser(await res.json());
      } else {
        await storage.secureRemove(TOKEN_KEY);
        setAuthToken(null);
      }
    } catch {}
  }, []);

  useEffect(() => {
    let sub: { remove: () => void } | undefined;
    (async () => {
      try {
        if (Platform.OS === "web") {
          const sid =
            extractSessionId(window.location.hash) ?? extractSessionId(window.location.search);
          if (sid) {
            const ok = await exchangeSession(sid);
            if (ok) cleanWebUrl();
            else await checkStored();
          } else {
            await checkStored();
          }
        } else {
          sub = Linking.addEventListener("url", ({ url }) => {
            const sid = extractSessionId(url);
            if (sid) exchangeSession(sid);
          });
          const initial = await Linking.getInitialURL();
          const sid = extractSessionId(initial);
          if (sid) {
            const ok = await exchangeSession(sid);
            if (!ok) await checkStored();
          } else {
            await checkStored();
          }
        }
      } finally {
        setLoading(false);
      }
    })();
    return () => sub?.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = useCallback(async () => {
    const redirectUrl =
      Platform.OS === "web" ? window.location.origin + "/" : Linking.createURL("");
    const authUrl = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
    if (Platform.OS === "web") {
      window.location.href = authUrl;
      return;
    }
    try {
      const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUrl);
      let sid = extractSessionId((result as { url?: string }).url);
      if (!sid) sid = extractSessionId(await Linking.getInitialURL());
      if (sid) await exchangeSession(sid);
    } catch (e) {
      console.warn("Login failed:", e);
    }
  }, [exchangeSession]);

  const logout = useCallback(async () => {
    try {
      if (token) {
        await fetch(`${BACKEND_URL}/api/auth/logout`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        });
      }
    } catch {}
    await storage.secureRemove(TOKEN_KEY);
    setAuthToken(null);
    setToken(null);
    setUser(null);
  }, [token]);

  // RevenueCat identity binding — COMPULSORY on every auth path
  useEffect(() => {
    if (!rcEnabled) return;
    (async () => {
      try {
        if (user?.user_id && rcIdentityRef.current !== user.user_id) {
          const { customerInfo } = await Purchases.logIn(user.user_id);
          rcIdentityRef.current = user.user_id;
          setPurchaseIdentityError(null);
          console.log("[RevenueCat] identity bound:", customerInfo.originalAppUserId);
        } else if (!user?.user_id && rcIdentityRef.current) {
          await Purchases.logOut();
          rcIdentityRef.current = null;
        }
      } catch (e) {
        setPurchaseIdentityError(String(e));
      }
    })();
  }, [user?.user_id]);

  return (
    <AuthContext.Provider
      value={{ user, loading, token, login, logout, purchaseIdentityError }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}

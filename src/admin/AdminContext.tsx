import React, { createContext, useContext, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import {
  flushSiteAssetsPending,
  forceSiteAssetsHydrateGateIfPending,
  hasSiteAssetsHydrateSettled,
  hydrateSiteAssets,
  initSiteAssetsFromLocalStorage,
  setServerAssetWritesEnabled,
  subscribeSiteAssets,
} from './siteAssetsStore';

export type UserRole = 'guest' | 'customer' | 'admin';

type AdminContextValue = {
  role: UserRole;
  isAdmin: boolean;
  login: (email: string, password: string) => Promise<boolean>;
  signupCustomer: (input: { name: string; email: string; password: string; company?: string }) => Promise<boolean>;
  logout: () => Promise<void>;
  assetsVersion: number;
  bumpAssetsVersion: () => void;
  adminEnabled: boolean;
};

const AdminContext = createContext<AdminContextValue | null>(null);

const ROLE_KEY = 'aiag:role';
const LEGACY_SESSION_IS_ADMIN_KEY = 'aiag:isAdmin';

function readSessionRole(): UserRole {
  try {
    // Use localStorage so new tabs keep the same UI role.
    const role = localStorage.getItem(ROLE_KEY);
    if (role === 'admin' || role === 'customer' || role === 'guest') return role;
    // legacy migration
    const legacyIsAdmin = sessionStorage.getItem(LEGACY_SESSION_IS_ADMIN_KEY) === '1';
    return legacyIsAdmin ? 'admin' : 'guest';
  } catch {
    return 'guest';
  }
}

function writeSessionRole(role: UserRole) {
  try {
    localStorage.setItem(ROLE_KEY, role);
    // keep legacy key in sync for older builds
    sessionStorage.setItem(LEGACY_SESSION_IS_ADMIN_KEY, role === 'admin' ? '1' : '0');
  } catch {
    // ignore
  }
}

export function AdminProvider({ children }: { children: React.ReactNode }) {
  const adminEnabled = true;

  const [role, setRole] = useState<UserRole>(() => (adminEnabled ? readSessionRole() : 'guest'));
  const [assetsVersion, setAssetsVersion] = useState(0);
  const [siteAssetsReady, setSiteAssetsReady] = useState(() => hasSiteAssetsHydrateSettled());

  useLayoutEffect(() => {
    initSiteAssetsFromLocalStorage();
    const unsub = subscribeSiteAssets(() => {
      setAssetsVersion((v) => v + 1);
      if (hasSiteAssetsHydrateSettled()) setSiteAssetsReady(true);
    });
    return unsub;
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      forceSiteAssetsHydrateGateIfPending();
    }, 8000);
    void hydrateSiteAssets().finally(() => {
      window.clearTimeout(timeoutId);
    });
    return () => window.clearTimeout(timeoutId);
  }, []);

  useEffect(() => {
    if (role === 'admin') {
      setServerAssetWritesEnabled(true);
      return () => {
        void flushSiteAssetsPending();
        setServerAssetWritesEnabled(false);
      };
    }
    setServerAssetWritesEnabled(false);
    return undefined;
  }, [role]);

  async function syncRoleFromServer(signal?: AbortSignal): Promise<void> {
    if (!adminEnabled) return;
    const res = await fetch('/api/auth/me', { credentials: 'include', signal });
    const data = (await res.json().catch(() => null)) as any;
    if (!res.ok || !data?.ok) {
      // 401: sunucu oturumu yok — eski rol localStorage'da kalmış olabilir.
      if (res.status === 401) {
        setRole('guest');
        writeSessionRole('guest');
      }
      return;
    }
    const nextRole =
      data?.role === 'admin' || data?.role === 'customer'
        ? (data.role as UserRole)
        : 'customer';
    setRole(nextRole);
    writeSessionRole(nextRole);
  }

  // Sync role from server session cookie (works across tabs).
  useEffect(() => {
    if (!adminEnabled) return;
    const ctrl = new AbortController();
    const run = async () => {
      // A few retries help when the first request races with cold start.
      for (let i = 0; i < 3; i++) {
        try {
          await syncRoleFromServer(ctrl.signal);
          return;
        } catch {
          // ignore
        }
        await new Promise((r) => setTimeout(r, 350));
      }
    };
    void run();
    const onFocus = () => {
      void syncRoleFromServer(ctrl.signal).catch(() => {});
    };
    window.addEventListener('focus', onFocus);
    return () => {
      ctrl.abort();
      window.removeEventListener('focus', onFocus);
    };
  }, [adminEnabled]);

  const value = useMemo<AdminContextValue>(() => {
    const isAdmin = role === 'admin';
    return {
      role,
      isAdmin,
      adminEnabled,
      login: async (email: string, password: string) => {
        if (!adminEnabled) return false;
        try {
          const res = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ email, password }),
          });
          const data = (await res.json().catch(() => null)) as any;
          if (!res.ok || !data?.ok) return false;
          // Prefer server session truth (handles role changes done in DB).
          try {
            await syncRoleFromServer();
          } catch {
            const nextRole =
              data?.role === 'admin' || data?.role === 'customer'
                ? (data.role as UserRole)
                : 'customer';
            setRole(nextRole);
            writeSessionRole(nextRole);
          }
          return true;
        } catch {
          return false;
        }
      },
      signupCustomer: async (input) => {
        if (!adminEnabled) return false;
        try {
          const res = await fetch('/api/auth/signup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(input),
          });
          const data = (await res.json().catch(() => null)) as any;
          if (!res.ok || !data?.ok) return false;
          // Signup can return admin (first user bootstrap). Keep UI in sync with server.
          const nextRole =
            data?.role === 'admin' || data?.role === 'customer'
              ? (data.role as UserRole)
              : 'customer';
          setRole(nextRole);
          writeSessionRole(nextRole);
          void syncRoleFromServer().catch(() => {});
          return true;
        } catch {
          return false;
        }
      },
      logout: async () => {
        try {
          await flushSiteAssetsPending();
        } catch {
          // ignore
        }
        try {
          await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
        } catch {
          // ignore
        }
        setRole('guest');
        writeSessionRole('guest');
      },
      assetsVersion,
      bumpAssetsVersion: () => setAssetsVersion((v) => v + 1),
    };
  }, [adminEnabled, assetsVersion, role]);

  return (
    <AdminContext.Provider value={value}>
      {!siteAssetsReady ? (
        <div
          className="min-h-[100dvh] w-full bg-black"
          aria-busy="true"
          aria-label="İçerik yükleniyor"
        />
      ) : (
        children
      )}
    </AdminContext.Provider>
  );
}

export function useAdmin() {
  const ctx = useContext(AdminContext);
  if (!ctx) throw new Error('useAdmin must be used within AdminProvider');
  return ctx;
}

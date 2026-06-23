import React, { createContext, useContext, useLayoutEffect, useMemo, useState } from 'react';
import {
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

export function AdminProvider({ children }: { children: React.ReactNode }) {
  const adminEnabled = true;
  const [role, setRole] = useState<UserRole>('guest');
  const [assetsVersion, setAssetsVersion] = useState(0);
  const [siteAssetsReady, setSiteAssetsReady] = useState(() => hasSiteAssetsHydrateSettled());

  useLayoutEffect(() => {
    initSiteAssetsFromLocalStorage();
    const unsub = subscribeSiteAssets(() => {
      setAssetsVersion((v) => v + 1);
      if (hasSiteAssetsHydrateSettled()) setSiteAssetsReady(true);
    });
    const timeoutId = window.setTimeout(() => {
      forceSiteAssetsHydrateGateIfPending();
      setSiteAssetsReady(true);
    }, 8000);
    void hydrateSiteAssets().finally(() => {
      window.clearTimeout(timeoutId);
      setSiteAssetsReady(true);
    });
    setServerAssetWritesEnabled(false);
    return () => {
      window.clearTimeout(timeoutId);
      setServerAssetWritesEnabled(false);
      unsub();
    };
  }, []);

  const value = useMemo<AdminContextValue>(() => {
    return {
      role,
      isAdmin: false,
      adminEnabled,
      login: async (email: string, password: string) => {
        void email;
        void password;
        return true;
      },
      signupCustomer: async (input) => {
        void input;
        return true;
      },
      logout: async () => {
        setRole('guest');
      },
      assetsVersion,
      bumpAssetsVersion: () => setAssetsVersion((v) => v + 1),
    };
  }, [adminEnabled, assetsVersion, role]);

  return (
    <AdminContext.Provider value={value}>
      {!siteAssetsReady ? (
        <div className="min-h-[100dvh] w-full bg-black" aria-busy="true" aria-label="Icerik yukleniyor" />
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

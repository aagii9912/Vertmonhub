'use client';

import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import type { User, Session } from '@supabase/supabase-js';
import type { UserRole, RolePermissions } from '@/lib/rbac';
import { ROLE_PERMISSIONS } from '@/lib/rbac';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';

const isDev = process.env.NODE_ENV === 'development';
const ACTIVE_SHOP_KEY = 'vertmonhub_active_shop_id';

// Shared browser Supabase client (cookie session, trimmed env, single GoTrueClient)
function createClient() {
  return createSupabaseBrowserClient();
}

export interface Shop {
  id: string;
  name: string;
  owner_name: string | null;
  phone: string | null;
  facebook_page_id: string | null;
  facebook_page_name: string | null;
  setup_completed: boolean;
  is_active: boolean;
  bank_name?: string | null;
  account_number?: string | null;
  account_name?: string | null;
  description?: string | null;
  ai_emotion?: string | null;
  ai_instructions?: string | null;
  instagram_business_account_id?: string | null;
  instagram_access_token?: string | null;
  instagram_username?: string | null;
}

interface AuthContextType {
  user: { id: string; email: string; fullName: string | null; role: UserRole; permissions: RolePermissions } | null;
  shop: Shop | null;
  shops: Shop[];
  loading: boolean;
  isLoaded: boolean;
  isSignedIn: boolean;
  refreshShop: () => Promise<void>;
  switchShop: (shopId: string) => Promise<void>;
  refreshShops: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  shop: null,
  shops: [],
  loading: true,
  isLoaded: false,
  isSignedIn: false,
  refreshShop: async () => { },
  switchShop: async () => { },
  refreshShops: async () => { },
  signOut: async () => { },
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [supabase] = useState(() => createClient());
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<{ id: string; email: string; fullName: string | null; role: UserRole; permissions: RolePermissions } | null>(null);
  const [shop, setShop] = useState<Shop | null>(null);
  const [shops, setShops] = useState<Shop[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch all shops for user
  const fetchShops = useCallback(async () => {
    if (!session) return [];

    try {
      const res = await fetch('/api/user/shops');
      const data = await res.json();
      const userShops = data.shops || [];
      setShops(userShops);
      return userShops;
    } catch (err) {
      if (isDev) console.error('Fetch shops error:', err);
      return [];
    }
  }, [session]);

  // Дүр + эрх + shop-ууд — /api/me нэг хүсэлтээр (сервер user_roles-оос тооцно).
  // Өмнө нь browser-оос user_roles → roles/role_permissions → /api/user/shops гэж
  // 4–5 дараалсан хүсэлт явдаг байв (review M3/M24).
  const fetchMe = useCallback(async (): Promise<{ role: UserRole; permissions: RolePermissions; fullName: string | null; shops: Shop[] } | null> => {
    try {
      const res = await fetch('/api/me', { cache: 'no-store' });
      if (!res.ok) return null;
      const data = await res.json();
      const roleName = (data.role as string) || 'viewer';
      return {
        role: roleName as UserRole,
        permissions: (data.permissions as RolePermissions) || ROLE_PERMISSIONS[roleName] || ROLE_PERMISSIONS['viewer'],
        fullName: (data.user?.fullName as string | null) ?? null,
        shops: Array.isArray(data.shops) ? (data.shops as Shop[]) : [],
      };
    } catch {
      return null;
    }
  }, []);

  // Set active shop (with localStorage persistence)
  const setActiveShop = useCallback((shopData: Shop | null) => {
    setShop(shopData);
    if (shopData) {
      localStorage.setItem(ACTIVE_SHOP_KEY, shopData.id);
    } else {
      localStorage.removeItem(ACTIVE_SHOP_KEY);
    }
  }, []);

  // Initialize active shop from localStorage or default to first shop
  const initializeActiveShop = useCallback((userShops: Shop[]) => {
    if (userShops.length === 0) {
      setActiveShop(null);
      return;
    }

    const savedShopId = localStorage.getItem(ACTIVE_SHOP_KEY);
    const savedShop = savedShopId ? userShops.find(s => s.id === savedShopId) : null;

    setActiveShop(savedShop || userShops[0]);
  }, [setActiveShop]);

  // Switch to a different shop
  const switchShop = useCallback(async (shopId: string) => {
    try {
      const res = await fetch('/api/user/switch-shop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shopId }),
      });

      const data = await res.json();

      if (data.success && data.shop) {
        setActiveShop(data.shop);
        window.location.reload();
      }
    } catch (err) {
      if (isDev) console.error('Switch shop error:', err);
    }
  }, [setActiveShop]);

  const refreshShops = useCallback(async () => {
    const userShops = await fetchShops();
    initializeActiveShop(userShops);
  }, [fetchShops, initializeActiveShop]);

  const refreshShop = useCallback(async () => {
    await refreshShops();
  }, [refreshShops]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setSession(null);
    setUser(null);
    setShop(null);
    setShops([]);
    localStorage.removeItem(ACTIVE_SHOP_KEY);
    window.location.href = '/auth/login';
  }, [supabase]);



  // Listen for auth state changes
  useEffect(() => {
    let lastUserId: string | null = null;

    const applyMe = async (s: Session) => {
      const me = await fetchMe();
      setUser({
        id: s.user.id,
        email: s.user.email || '',
        fullName: me?.fullName ?? (s.user.user_metadata?.full_name || null),
        role: me?.role ?? 'viewer',
        permissions: me?.permissions ?? ROLE_PERMISSIONS['viewer'],
      });
      if (me) {
        setShops(me.shops);
        initializeActiveShop(me.shops);
      }
    };

    // Get initial session
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setSession(session);
      if (session?.user) {
        lastUserId = session.user.id;
        await applyMe(session);
      }
      setLoading(false);
    });

    // Listen for auth changes (TOKEN_REFRESHED зэрэгт ижил хэрэглэгчийн хувьд дахин татахгүй)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
        if (session?.user) {
          if (session.user.id !== lastUserId) {
            lastUserId = session.user.id;
            void applyMe(session);
          }
        } else {
          lastUserId = null;
          setUser(null);
        }
      }
    );

    return () => subscription.unsubscribe();
  }, [supabase, fetchMe, initializeActiveShop]);

  return (
    <AuthContext.Provider value={{
      user,
      shop,
      shops,
      loading,
      isLoaded: !loading,
      isSignedIn: !!session,
      refreshShop,
      switchShop,
      refreshShops,
      signOut,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};

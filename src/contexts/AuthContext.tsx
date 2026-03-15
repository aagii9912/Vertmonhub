'use client';

import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import type { User, Session } from '@supabase/supabase-js';
import type { UserRole, RolePermissions } from '@/lib/rbac';
import { fetchRolePermissions, ROLE_PERMISSIONS } from '@/lib/rbac';

const isDev = process.env.NODE_ENV === 'development';
const ACTIVE_SHOP_KEY = 'vertmonhub_active_shop_id';

// Create browser Supabase client
function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
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

  // Fetch user role and permissions from DB
  const fetchUserRoleAndPermissions = useCallback(async (userId: string): Promise<{ role: UserRole; permissions: RolePermissions }> => {
    try {
      const { data, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId)
        .single();

      const roleName = (error || !data) ? 'viewer' : data.role as UserRole;

      // Fetch dynamic permissions
      let permissions: RolePermissions;
      try {
        permissions = await fetchRolePermissions(roleName, supabase);
      } catch {
        permissions = ROLE_PERMISSIONS[roleName] || ROLE_PERMISSIONS['viewer'];
      }

      return { role: roleName, permissions };
    } catch {
      return { role: 'viewer', permissions: ROLE_PERMISSIONS['viewer'] };
    }
  }, [supabase]);

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
    // Get initial session
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setSession(session);
      if (session?.user) {
        const { role, permissions } = await fetchUserRoleAndPermissions(session.user.id);
        setUser({
          id: session.user.id,
          email: session.user.email || '',
          fullName: session.user.user_metadata?.full_name || null,
          role,
          permissions,
        });
      }
      setLoading(false);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
        if (session?.user) {
          fetchUserRoleAndPermissions(session.user.id).then(({ role, permissions }) => {
            setUser({
              id: session.user.id,
              email: session.user.email || '',
              fullName: session.user.user_metadata?.full_name || null,
              role,
              permissions,
            });
          });
        } else {
          setUser(null);
        }
      }
    );

    return () => subscription.unsubscribe();
  }, [supabase]);

  // Fetch shops when session changes
  useEffect(() => {
    if (session) {
      fetchShops().then(initializeActiveShop);
    }
  }, [session, fetchShops, initializeActiveShop]);

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

"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from "react";
import { supabase } from "@/lib/supabase-client";
import { User } from "@supabase/supabase-js";
import { useRouter, usePathname } from "next/navigation";

interface Role {
  role_id: number;
  name: string;
}

interface AuthContextType {
  user: User | null;
  roles: Role[];
  permissions: string[];
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const router = useRouter();
  const pathname = usePathname();

  const fetchUserRoles = async (authUserId: string): Promise<Role[]> => {
    const { data, error } = await supabase
      .from("users")
      .select("user_roles(role_id, roles(role_id, name))")
      .eq("id", authUserId)
      .maybeSingle();

    if (error) {
      console.error("Failed to fetch roles:", error.message);
      return [];
    }

    return (data?.user_roles ?? []).map((r: any) => ({
      role_id: r.roles.role_id,
      name: r.roles.name,
    }));
  };

  const fetchUserPermissions = async (authUserId: string) => {
    const { data, error } = await supabase.rpc("get_user_permissions", {
      user_uuid: authUserId,
    });

    if (error) {
      console.error("Failed to fetch permissions:", error.message);
      return [];
    }

    return data.map((p: any) => p.permission_name);
  };

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      const currentUser = data.session?.user ?? null;
      setUser(currentUser);

      if (currentUser) {
        const fetchedRoles = await fetchUserRoles(currentUser.id);
        const fetchedPermissions = await fetchUserPermissions(currentUser.id);

        setRoles(fetchedRoles);
        setPermissions(fetchedPermissions);
      } else {
        setRoles([]);
        setPermissions([]);
      }

      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      const currentUser = session?.user ?? null;
      setUser(currentUser);

      if (currentUser) {
        const fetchedRoles = await fetchUserRoles(currentUser.id);
        const fetchedPermissions = await fetchUserPermissions(currentUser.id);

        setRoles(fetchedRoles);
        setPermissions(fetchedPermissions);
      } else {
        setRoles([]);
        setPermissions([]);
      }

      setLoading(false);

      if (event === "SIGNED_IN" && pathname === "/login") {
        router.push("/");
      }
    });

    return () => subscription.unsubscribe();
  }, [router, pathname]);

  const signIn = async (email: string, password: string) => {
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) throw error;
    } finally {
      setLoading(false);
    }
  };

  const signOut = async () => {
    try {
      await supabase.auth.signOut();
    } catch (error) {
      console.error("Logout error:", error);
    } finally {
      localStorage.clear();
      sessionStorage.clear();
      window.location.href = "/login";
    }
  };

  return (
    <AuthContext.Provider
      value={{ user, roles, permissions, loading, signIn, signOut }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
};

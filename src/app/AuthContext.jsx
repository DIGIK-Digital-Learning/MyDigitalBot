"use client";
import { createContext, use, useContext, useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";

const AuthContext = createContext({
  user: null,
  loading: true,
  setUser: () => {},
});

export function AuthProvider({ children }) {
  const supabase = createClient();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function init() {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      setUser(session?.user ?? null);
      setLoading(false);
    }

    init();

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session) => setUser(session?.user ?? null)
    );
    return () => listener.subscription.unsubscribe();
  }, [supabase]);

  return (
    <AuthContext.Provider value={{ user, loading, supabase, setUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);

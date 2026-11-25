"use client";
import { createContext, use, useContext, useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";

const AuthContext = createContext({
  user: null,
  loading: true,
  setUser: () => {},
});

/* A mesma conta, sem nada que o ecrã mostre mudado. */
export function sameUser(a, b) {
  if (!a || !b) return a === b;
  return (
    a.id === b.id &&
    a.email === b.email &&
    a.updated_at === b.updated_at &&
    a.last_sign_in_at === b.last_sign_in_at
  );
}

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

    /*
     * O Supabase volta a avisar a cada regresso ao separador (e ao renovar a
     * sessão), sempre com um objeto novo para a mesma pessoa. Trocar o
     * objeto fazia toda a app reler a organização e as páginas por trás das
     * permissões desapareciam e voltavam, perdendo o que estava escrito
     * (#247). Só se troca quando a conta muda mesmo.
     */
    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        const next = session?.user ?? null;
        setUser((current) => (sameUser(current, next) ? current : next));
      }
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

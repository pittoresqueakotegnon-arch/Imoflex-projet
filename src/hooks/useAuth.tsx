import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase, UserProfile, UserRole } from '../lib/supabase';
import { logAction } from '../lib/audit';

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  profile: UserProfile | null;
  role: UserRole | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (params: SignUpParams) => Promise<void>;
  verifySignupOtp: (email: string, token: string) => Promise<void>;
  resendSignupOtp: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

export interface SignUpParams {
  email: string;
  password: string;
  full_name: string;
  phone: string;
  role: 'locataire' | 'proprietaire';
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = useCallback(async (userId: string) => {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .maybeSingle();
    if (error) {
      console.error('Erreur fetchProfile:', error);
      throw new Error('Impossible de charger le profil utilisateur. ' + error.message);
    }
    if (data) {
      setProfile(data as UserProfile);
    }
  }, []);

  const refreshProfile = useCallback(async () => {
    if (user) await fetchProfile(user.id);
  }, [user, fetchProfile]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) {
        fetchProfile(s.user.id).catch(console.error).finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, s) => {
        (async () => {
          setSession(s);
          setUser(s?.user ?? null);
          if (s?.user) {
            await fetchProfile(s.user.id).catch(console.error);
          } else {
            setProfile(null);
          }
          setLoading(false);
        })();
      }
    );

    return () => subscription.unsubscribe();
  }, [fetchProfile]);

  const signIn = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message);
    if (data?.user) {
      await fetchProfile(data.user.id);
      
      logAction({
        userId: data.user.id,
        action: 'connexion',
        entityType: 'users',
        entityId: data.user.id,
      }).catch(console.error);
    }
  };

  const signUp = async ({ email, password, full_name, phone, role }: SignUpParams) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name, phone, role },
        emailRedirectTo: undefined,
      },
    });
    if (error) throw new Error(error.message);
    if (!data.user) throw new Error('Erreur lors de la création du compte');

    // Upsert profile — trigger already ran but client upsert ensures phone is set correctly
    // (trigger may have gotten the phone from metadata; this is a safety net)
    try {
      await supabase.from('users').upsert(
        { id: data.user.id, full_name, phone: phone || null, email, role },
        { onConflict: 'id' }
      );
    } catch {
      // Profile will be created by trigger; ignore client-side upsert errors
    }
  };

  const verifySignupOtp = async (email: string, token: string) => {
    // Vérifie le code à 6 chiffres reçu par email. En cas de succès,
    // Supabase crée directement une session active — la personne est
    // connectée automatiquement, sans jamais retaper son mot de passe.
    const { data, error } = await supabase.auth.verifyOtp({
      email,
      token,
      type: 'signup',
    });
    if (error) throw new Error('Code incorrect ou expiré');
    
    if (data?.user) {
      logAction({
        userId: data.user.id,
        action: 'inscription',
        entityType: 'users',
        entityId: data.user.id,
      });
    }
  };

  const resendSignupOtp = async (email: string) => {
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email,
    });
    if (error) throw new Error(error.message);
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setProfile(null);
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        user,
        profile,
        role: profile?.role ?? null,
        loading,
        signIn,
        signUp,
        verifySignupOtp,
        resendSignupOtp,
        signOut,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

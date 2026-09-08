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
  signUp: (params: SignUpParams) => Promise<any>;
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
    } else {
      // Le profil est créé exclusivement par le trigger auth côté base. Une
      // écriture de secours depuis le navigateur permettrait de choisir un rôle.
      throw new Error('Profil utilisateur introuvable. Réessayez dans quelques instants.');
    }
  }, []);

  const refreshProfile = useCallback(async () => {
    if (user) await fetchProfile(user.id);
  }, [user, fetchProfile]);

  useEffect(() => {
    let userSubscription: any = null;

    const setupRealtimeProfile = (userId: string) => {
      if (userSubscription) {
        supabase.removeChannel(userSubscription);
      }
      userSubscription = supabase.channel(`public:users:id=eq.${userId}`)
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'users', filter: `id=eq.${userId}` },
          (payload) => {
            const newProfile = payload.new as UserProfile;
            setProfile(newProfile);
            
            if (newProfile.account_status === 'banni' || newProfile.account_status === 'suspendu') {
              supabase.auth.signOut().then(() => {
                setSession(null);
                setUser(null);
                setProfile(null);
                window.location.href = '/login?banned=true';
              });
            }
          }
        )
        .subscribe();
    };

    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) {
        fetchProfile(s.user.id).catch(console.error).finally(() => setLoading(false));
        setupRealtimeProfile(s.user.id);
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
            setupRealtimeProfile(s.user.id);
          } else {
            setProfile(null);
            if (userSubscription) {
              supabase.removeChannel(userSubscription);
              userSubscription = null;
            }
          }
          setLoading(false);
        })();
      }
    );

    return () => {
      subscription.unsubscribe();
      if (userSubscription) supabase.removeChannel(userSubscription);
    };
  }, [fetchProfile]);

  const syncLocalFavorites = async (userId: string) => {
    try {
      const stored = localStorage.getItem('favorites');
      if (stored) {
        const localFavs: string[] = JSON.parse(stored);
        if (Array.isArray(localFavs) && localFavs.length > 0) {
          const payload = localFavs.map(id => ({ user_id: userId, listing_id: id }));
          await supabase.from('favorites').upsert(payload, { onConflict: 'user_id,listing_id', ignoreDuplicates: true });
        }
        localStorage.removeItem('favorites');
      }
    } catch (err) {
      console.warn('Failed to sync local favorites:', err);
    }
  };

  const signIn = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message);
    if (data?.user) {
      await fetchProfile(data.user.id);
      await syncLocalFavorites(data.user.id);
      
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

    // Détection de compte déjà existant (Protection contre l'énumération d'email Supabase)
    if (data.user.identities && data.user.identities.length === 0) {
      throw new Error('Cette adresse email est déjà associée à un compte. Veuillez vous connecter.');
    }

    await syncLocalFavorites(data.user.id);

    return data;
  };

  const verifySignupOtp = async (email: string, token: string) => {
    // Vérifie le code reçu par email. En cas de succès,
    // Supabase crée directement une session active — la personne est
    // connectée automatiquement, sans jamais retaper son mot de passe.
    const { data, error } = await supabase.auth.verifyOtp({
      email,
      token,
      type: 'signup',
    });
    if (error) {
      console.error('[verifySignupOtp] Erreur brute Supabase:', error);
      throw error;
    }

    if (data?.session) {
      setSession(data.session);
      setUser(data.user);
      if (data.user) {
        await fetchProfile(data.user.id);

        logAction({
          userId: data.user.id,
          action: 'inscription',
          entityType: 'users',
          entityId: data.user.id,
        }).catch(console.error);
      }
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

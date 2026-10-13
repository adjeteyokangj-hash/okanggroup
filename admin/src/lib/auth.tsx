import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from './supabase';

type Profile = {
  id: string;
  email: string;
  full_name: string;
  account_kind: string;
  account_status: string;
  mfa_required: boolean;
  must_change_password: boolean;
};

type AuthState = {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  permissions: string[];
  loading: boolean;
  mfaRequired: boolean;
  mfaEnrolled: boolean;
  aal: string | null;
  mustChangePassword: boolean;
  can: (code: string) => boolean;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [aal, setAal] = useState<string | null>(null);
  const [sessionNeedsMfa, setSessionNeedsMfa] = useState(false);
  const [mfaEnrolled, setMfaEnrolled] = useState(false);

  async function refreshProfile() {
    const { data: userData } = await supabase.auth.getUser();
    const uid = userData.user?.id;
    if (!uid) {
      setProfile(null);
      setPermissions([]);
      setSessionNeedsMfa(false);
      setMfaEnrolled(false);
      return;
    }
    const [
      { data },
      { data: codes, error: permErr },
      { data: aalData },
      { data: needsMfa },
      { data: factors },
    ] = await Promise.all([
      supabase
        .from('profiles')
        .select(
          'id, email, full_name, account_kind, account_status, mfa_required, must_change_password',
        )
        .eq('id', uid)
        .maybeSingle(),
      supabase.rpc('my_permission_codes'),
      supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
      supabase.rpc('session_requires_mfa'),
      supabase.auth.mfa.listFactors(),
    ]);
    setProfile((data as Profile | null) ?? null);
    if (permErr) {
      console.warn('permissions load failed', permErr.message);
      setPermissions([]);
    } else {
      setPermissions((codes as string[] | null) ?? []);
    }
    setAal(aalData?.currentLevel ?? null);
    setSessionNeedsMfa(Boolean(needsMfa) || Boolean((data as Profile | null)?.mfa_required));
    const verified = factors?.totp?.some((f) => f.status === 'verified') ?? false;
    setMfaEnrolled(verified);
  }

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (session?.user) {
      void refreshProfile();
    } else {
      setProfile(null);
      setPermissions([]);
      setAal(null);
      setSessionNeedsMfa(false);
      setMfaEnrolled(false);
    }
  }, [session?.user?.id]);

  // Gate until AAL2 when policy/role requires MFA (Owner cannot bypass via cleared flag).
  const mustChangePassword = Boolean(profile?.must_change_password);
  // Do not require MFA until temporary password is changed (order: password → MFA → app).
  const mfaRequired = !mustChangePassword && sessionNeedsMfa && aal !== 'aal2';

  return (
    <AuthContext.Provider
      value={{
        session,
        user: session?.user ?? null,
        profile,
        permissions,
        loading,
        mfaRequired,
        mfaEnrolled,
        aal,
        mustChangePassword,
        can: (code: string) => permissions.includes(code),
        refreshProfile,
        signOut: async () => {
          await supabase.auth.signOut();
        },
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth outside AuthProvider');
  return ctx;
}

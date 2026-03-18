import { create } from 'zustand';
import { User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

interface AuthState {
  user: User | null;
  profile: any | null;
  loading: boolean;
  setUser: (user: User | null) => void;
  setProfile: (profile: any) => void;
  signOut: () => Promise<void>;
  initialize: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  profile: null,
  loading: true,

  setUser: (user) => set({ user }),
  setProfile: (profile) => set({ profile }),

  signOut: async () => {
    await supabase.auth.signOut();
    set({ user: null, profile: null });
  },

  initialize: async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      set({ user: session.user });
      // Fetch profile with role-specific data
      const { data } = await supabase
        .from('profiles')
        .select('*, patient_profiles(*), doctor_profiles(*)')
        .eq('id', session.user.id)
        .single();
      set({ profile: data });
    }
    set({ loading: false });

    // Listen for auth changes
    supabase.auth.onAuthStateChange(async (event, session) => {
      set({ user: session?.user ?? null });
    });
  },
}));

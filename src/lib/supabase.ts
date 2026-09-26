/// <reference types="vite/client" />
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

const configError = new Error(
  'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to enable cloud sync and authentication.'
);

function createUnavailableClient() {
  const query = () => {
    const builder: any = {
      select: () => builder,
      insert: () => builder,
      upsert: () => builder,
      update: () => builder,
      delete: () => builder,
      eq: () => builder,
      neq: () => builder,
      in: () => builder,
      single: () => builder,
      limit: () => builder,
      range: () => builder,
      order: () => builder,
      then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
        Promise.resolve({ data: null, error: configError }).then(resolve, reject)
    };
    return builder;
  };

  return {
    auth: {
      getUser: async () => ({ data: { user: null }, error: configError }),
      getSession: async () => ({ data: { session: null }, error: configError }),
      signInWithIdToken: async () => ({ data: null, error: configError }),
      signOut: async () => ({ error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } })
    },
    from: query
  } as any;
}

export const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey)
  : createUnavailableClient();

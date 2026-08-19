require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
// Lazily load electron-store
let Store;
async function getStore() {
  if (!Store) {
    const mod = await import('electron-store');
    Store = mod.default || mod;
  }
  return Store;
}

let authStore, offlineStore, syncQueueStore;
async function getAuthStore() { if (!authStore) { const S = await getStore(); authStore = new S({ name: 'actra-auth-store' }); } return authStore; }
async function getOfflineStore() { if (!offlineStore) { const S = await getStore(); offlineStore = new S({ name: 'actra-offline-cache' }); } return offlineStore; }
async function getSyncQueueStore() { if (!syncQueueStore) { const S = await getStore(); syncQueueStore = new S({ name: 'actra-sync-queue' }); } return syncQueueStore; }

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn("Supabase URL or Anon Key not found in environment variables.");
}

// Auth storage using electron-store
const customAuthStorage = {
  getItem: async (key) => { const s = await getAuthStore(); return s.get(key) || null; },
  setItem: async (key, value) => { const s = await getAuthStore(); return s.set(key, value); },
  removeItem: async (key) => { const s = await getAuthStore(); return s.delete(key); }
};

const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: customAuthStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false
  }
});

// Offline Caching Layer

class SupabaseSyncWrapper {
  constructor(client) {
    this.client = client;
    this.auth = client.auth; // Expose auth directly
  }

  from(table) {
    return new QueryBuilder(this.client, table);
  }
}

class QueryBuilder {
  constructor(client, table) {
    this.client = client;
    this.table = table;
    this.filters = [];
    this.isSingle = false;
  }

  select(columns) {
    this.action = 'select';
    this.columns = columns;
    return this;
  }

  upsert(data) {
    this.action = 'upsert';
    this.data = data;
    return this;
  }

  insert(data) {
    this.action = 'insert';
    this.data = data;
    return this;
  }

  update(data) {
    this.action = 'update';
    this.data = data;
    return this;
  }

  delete() {
    this.action = 'delete';
    return this;
  }

  eq(column, value) {
    this.filters.push({ type: 'eq', column, value });
    return this;
  }

  neq(column, value) {
    this.filters.push({ type: 'neq', column, value });
    return this;
  }

  in(column, values) {
    this.filters.push({ type: 'in', column, values });
    return this;
  }

  single() {
    this.isSingle = true;
    return this;
  }

  limit(count) {
    this._limit = count;
    return this;
  }

  range(from, to) {
    this._range = { from, to };
    return this;
  }

  order(column, options = { ascending: true }) {
    this._order = { column, options };
    return this;
  }

  async _getUser() {
    const { data: { user } } = await this.client.auth.getUser();
    return user;
  }

  // Returns a unique key for the offline cache based on table and user
  async _getCacheKey() {
    const user = await this._getUser();
    const uid = user ? user.id : 'anon';
    return `${this.table}_${uid}`;
  }

  async then(resolve, reject) {
    try {
      const user = await this._getUser();
      if (!user && this.table !== 'google_auth_tokens' && this.table !== 'settings') {
         // Allow unauthenticated local read/write for now
      }

      let query = this.client.from(this.table)[this.action](this.data || this.columns);

      if (this.isSingle && this.action === 'select') {
        query = query.single();
      }

      for (const filter of this.filters) {
        if (filter.type === 'eq') query = query.eq(filter.column, filter.value);
        if (filter.type === 'neq') query = query.neq(filter.column, filter.value);
        if (filter.type === 'in') query = query.in(filter.column, filter.values);
      }

      if (this._order) {
        query = query.order(this._order.column, this._order.options);
      }
      
      if (this._limit) {
        query = query.limit(this._limit);
      }

      if (this._range) {
        query = query.range(this._range.from, this._range.to);
      }

      // Execute network request
      const response = await query;
      
      // Cache successful response locally
      if (!response.error) {
        const cacheKey = await this._getCacheKey();
        
        if (this.action === 'select') {
          const queryHash = Buffer.from(JSON.stringify({ filters: this.filters, single: this.isSingle })).toString('base64');
          const os = await getOfflineStore();
          os.set(`${cacheKey}_${this.action}_${queryHash}`, response.data);
        }
      } else {
        throw response.error; // triggers offline fallback catch block
      }
      
      return resolve(response);

    } catch (networkError) {
      console.warn(`[SupabaseSyncWrapper] Network request failed for ${this.action} on ${this.table}. Falling back to offline cache.`, networkError);

      try {
        const cacheKey = await this._getCacheKey();
        
        if (this.action === 'select') {
          const queryHash = Buffer.from(JSON.stringify({ filters: this.filters, single: this.isSingle })).toString('base64');
          const os = await getOfflineStore();
          const localData = os.get(`${cacheKey}_${this.action}_${queryHash}`);
          if (localData !== undefined) {
             return resolve({ data: localData, error: null });
          } else {
             return resolve({ data: null, error: new Error('Offline cache miss') });
          }
        } 
        else if (this.action === 'upsert' || this.action === 'insert' || this.action === 'delete' || this.action === 'update') {
           // Queue action for later sync
           const sq = await getSyncQueueStore();
           const q = sq.get('queue') || [];
           q.push({ table: this.table, action: this.action, data: this.data, filters: this.filters, timestamp: Date.now() });
           sq.set('queue', q);
           return resolve({ data: this.data, error: null }); // Mock success
        }
      } catch (localError) {
         return resolve({ data: null, error: localError });
      }
    }
  }
}

module.exports = new SupabaseSyncWrapper(supabase);

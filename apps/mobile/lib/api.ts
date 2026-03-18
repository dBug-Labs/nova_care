import { supabase } from './supabase';

const API_URL = process.env.EXPO_PUBLIC_API_URL;

const api = {
  async request(endpoint: string, options: any = {}) {
    const { data: { session } } = await supabase.auth.getSession();
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers,
    } as any;

    if (session?.access_token) {
      headers.Authorization = `Bearer ${session.access_token}`;
    }

    const response = await fetch(`${API_URL}${endpoint}`, {
      ...options,
      headers,
      body: options.data ? JSON.stringify(options.data) : options.body,
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw data || new Error(response.statusText);
    }
    return data;
  },

  get(endpoint: string, options: any = {}) {
    return this.request(endpoint, { ...options, method: 'GET' });
  },

  post(endpoint: string, data: any, options: any = {}) {
    return this.request(endpoint, { ...options, method: 'POST', data });
  },

  put(endpoint: string, data: any, options: any = {}) {
    return this.request(endpoint, { ...options, method: 'PUT', data });
  },

  delete(endpoint: string, options: any = {}) {
    return this.request(endpoint, { ...options, method: 'DELETE' });
  },
};

export default api;

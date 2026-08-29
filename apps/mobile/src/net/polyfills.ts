import { Buffer } from 'buffer';
import { createMMKV } from 'react-native-mmkv';

/**
 * The two globals colyseus.js expects from a browser and React Native does not
 * provide. Imported for its side effects, before any client is constructed.
 *
 * The usual React Native advice is to point `localStorage` at AsyncStorage, but
 * that is asynchronous and `localStorage` is not — reads come back undefined and
 * reconnection tokens quietly vanish. MMKV is synchronous, so it is an honest
 * fit rather than a shim that mostly works.
 */

const store = createMMKV({ id: 'colyseus' });

const g = globalThis as unknown as {
  Buffer?: typeof Buffer;
  localStorage?: Storage;
};

if (typeof g.Buffer === 'undefined') {
  g.Buffer = Buffer;
}

if (typeof g.localStorage === 'undefined') {
  const shim: Storage = {
    get length() {
      return 0;
    },
    getItem: (key: string) => store.getString(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, String(value));
    },
    removeItem: (key: string) => {
      store.remove(key);
    },
    clear: () => {
      store.clearAll();
    },
    // colyseus.js only ever uses get/set/remove; enumeration is never called.
    key: () => null,
  };
  g.localStorage = shim;
}

export {};

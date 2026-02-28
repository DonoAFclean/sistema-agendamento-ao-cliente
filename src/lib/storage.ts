import { openDB, IDBPDatabase } from 'idb';
import { Client, Service, FinancialRecord, AppSettings } from '../types';

const DB_NAME = 'afclean_db';
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase>;

function getDB() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('clients')) {
          db.createObjectStore('clients', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('services')) {
          db.createObjectStore('services', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('financials')) {
          db.createObjectStore('financials', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings');
        }
      },
    });
  }
  return dbPromise;
}

export const storage = {
  // Clients
  async getClients(): Promise<Client[]> {
    const db = await getDB();
    return db.getAll('clients');
  },
  async saveClient(client: Client): Promise<string> {
    const db = await getDB();
    const id = client.id || crypto.randomUUID();
    await db.put('clients', { ...client, id });
    return id;
  },
  async deleteClient(id: string): Promise<void> {
    const db = await getDB();
    await db.delete('clients', id);
  },

  // Services
  async getServices(): Promise<Service[]> {
    const db = await getDB();
    return db.getAll('services');
  },
  async saveService(service: Service): Promise<string> {
    const db = await getDB();
    const id = service.id || crypto.randomUUID();
    await db.put('services', { ...service, id });
    return id;
  },
  async deleteService(id: string): Promise<void> {
    const db = await getDB();
    await db.delete('services', id);
  },

  // Financials
  async getFinancials(): Promise<FinancialRecord[]> {
    const db = await getDB();
    return db.getAll('financials');
  },
  async saveFinancial(record: FinancialRecord): Promise<string> {
    const db = await getDB();
    const id = record.id || crypto.randomUUID();
    await db.put('financials', { ...record, id });
    return id;
  },
  async deleteFinancial(id: string): Promise<void> {
    const db = await getDB();
    await db.delete('financials', id);
  },

  // Settings
  async getSettings(): Promise<AppSettings> {
    const db = await getDB();
    const all = await db.getAll('settings');
    const keys = await db.getAllKeys('settings');
    const settings: any = {};
    keys.forEach((key, i) => {
      settings[key as string] = all[i];
    });
    return settings;
  },
  async saveSetting(key: string, value: any): Promise<void> {
    const db = await getDB();
    await db.put('settings', value, key);
  }
};

import { ChatSession, AppConfig } from './types';

const DB_NAME = 'AIStudioCloneDB';
const SESSION_STORE = 'sessions';
const SETTINGS_STORE = 'settings';
const DB_VERSION = 2; // Incremented for schema update

export const openDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      
      // Create Sessions Store
      if (!db.objectStoreNames.contains(SESSION_STORE)) {
        db.createObjectStore(SESSION_STORE, { keyPath: 'id' });
      }

      // Create Settings Store (Simple Key-Value pair style)
      if (!db.objectStoreNames.contains(SETTINGS_STORE)) {
        db.createObjectStore(SETTINGS_STORE);
      }
    };
  });
};

// --- Session Operations ---

export const saveSession = async (session: ChatSession): Promise<void> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([SESSION_STORE], 'readwrite');
    const store = transaction.objectStore(SESSION_STORE);
    const request = store.put(session);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
};

export const getSessions = async (): Promise<ChatSession[]> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([SESSION_STORE], 'readonly');
    const store = transaction.objectStore(SESSION_STORE);
    const request = store.getAll();
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
        // Sort by updatedAt desc
        const sessions = request.result as ChatSession[];
        sessions.sort((a, b) => b.updatedAt - a.updatedAt);
        resolve(sessions);
    };
  });
};

export const deleteSessionFromDB = async (id: string): Promise<void> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([SESSION_STORE], 'readwrite');
    const store = transaction.objectStore(SESSION_STORE);
    const request = store.delete(id);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
};

// --- Config Operations ---

const CONFIG_KEY = 'main_app_config';

export const saveAppConfig = async (config: AppConfig): Promise<void> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([SETTINGS_STORE], 'readwrite');
    const store = transaction.objectStore(SETTINGS_STORE);
    const request = store.put(config, CONFIG_KEY);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
};

export const getAppConfig = async (): Promise<AppConfig | null> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([SETTINGS_STORE], 'readonly');
    const store = transaction.objectStore(SETTINGS_STORE);
    const request = store.get(CONFIG_KEY);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result || null);
  });
};
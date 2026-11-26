import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import {
  MockApiError,
  hydrateMockDb,
  mockApiRequest,
  setMockPersistHandler,
} from '../mocks/mockBackend';
import {
  Animal,
  AuthResponse,
  CreateAccountPayload,
  CreateAnimalPayload,
  CreateEventPayload,
  CreateVaccinePayload,
  DeleteAccountPayload,
  DeleteAnimalPayload,
  DeleteEventPayload,
  DeleteVaccinePayload,
  DicaCompleta,
  DispatchEventNotificationsPayload,
  DispatchEventNotificationsResponse,
  Evento,
  GetAccountPayload,
  GetAllResponse,
  GoogleLoginPayload,
  LoginPayload,
  UpdateAccountPayload,
  UpdateAnimalPayload,
  UpdateEventPayload,
  UpdateVaccinePayload,
  Usuario,
  Vacina,
} from '../types';

const RAW_USE_MOCK = (
  process.env.EXPO_PUBLIC_USE_MOCK_BACKEND || ''
)
  .trim()
  .toLowerCase();

export const API_BASE_URL = (process.env.EXPO_PUBLIC_API_URL || '')
  .trim()
  .replace(/\/+$/, '');

export const USE_MOCK_BACKEND =
  RAW_USE_MOCK === 'false'
    ? false
    : RAW_USE_MOCK === 'true'
      ? true
      : !API_BASE_URL;

export const SECURE_STORAGE_KEYS = {
  ACCESS_TOKEN: 'access_token',
  USER_ID: 'user_id',
} as const;

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

let unauthorizedHandler: (() => void) | null = null;
const memoryFallbackStorage: Record<string, string> = {};

const MOCK_DB_META_KEY = 'petmood_mock_db_meta';
const MOCK_DB_CHUNK_PREFIX = 'petmood_mock_db_c_';
const MOCK_CHUNK_SIZE = 1500;
const MAX_MOCK_CHUNKS = 24;

let nativeMockHydrated = Platform.OS === 'web';
let nativeMockHydrationPromise: Promise<void> | null = null;

function sanitizeMockDbForNativeStorage(serialized: string): string {
  try {
    const parsed = JSON.parse(serialized);
    if (Array.isArray(parsed?.usuarios)) {
      parsed.usuarios = parsed.usuarios.map((u: Record<string, any>) => ({
        ...u,
        foto:
          typeof u.foto === 'string' &&
          u.foto.startsWith('data:') &&
          u.foto.length > 4000
            ? ''
            : u.foto,
      }));
    }
    if (Array.isArray(parsed?.animais)) {
      parsed.animais = parsed.animais.map((a: Record<string, any>) => ({
        ...a,
        foto:
          typeof a.foto === 'string' &&
          a.foto.startsWith('data:') &&
          a.foto.length > 4000
            ? ''
            : a.foto,
      }));
    }
    return JSON.stringify(parsed);
  } catch {
    return serialized;
  }
}

async function persistNativeMockDb(serialized: string): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    const compact = sanitizeMockDbForNativeStorage(serialized);
    const totalChunks = Math.ceil(compact.length / MOCK_CHUNK_SIZE);
    if (totalChunks > MAX_MOCK_CHUNKS) return;

    const prevMetaRaw = await SecureStore.getItemAsync(MOCK_DB_META_KEY);
    const prevCount = prevMetaRaw ? Number(prevMetaRaw) || 0 : 0;

    for (let i = 0; i < totalChunks; i += 1) {
      const slice = compact.slice(i * MOCK_CHUNK_SIZE, (i + 1) * MOCK_CHUNK_SIZE);
      await SecureStore.setItemAsync(`${MOCK_DB_CHUNK_PREFIX}${i}`, slice);
    }
    await SecureStore.setItemAsync(MOCK_DB_META_KEY, String(totalChunks));

    for (let i = totalChunks; i < prevCount; i += 1) {
      await SecureStore.deleteItemAsync(`${MOCK_DB_CHUNK_PREFIX}${i}`);
    }
  } catch {
    // Ignore native SecureStore chunk write errors
  }
}

async function ensureNativeMockHydrated(): Promise<void> {
  if (nativeMockHydrated || Platform.OS === 'web') return;
  if (!nativeMockHydrationPromise) {
    nativeMockHydrationPromise = (async () => {
      try {
        setMockPersistHandler(persistNativeMockDb);
        const metaRaw = await SecureStore.getItemAsync(MOCK_DB_META_KEY);
        const count = metaRaw ? Number(metaRaw) || 0 : 0;
        if (count > 0 && count <= MAX_MOCK_CHUNKS) {
          const chunks: string[] = [];
          for (let i = 0; i < count; i += 1) {
            const chunk = await SecureStore.getItemAsync(
              `${MOCK_DB_CHUNK_PREFIX}${i}`
            );
            if (typeof chunk !== 'string') {
              chunks.length = 0;
              break;
            }
            chunks.push(chunk);
          }
          if (chunks.length === count) {
            hydrateMockDb(chunks.join(''));
          }
        }
      } catch {
        // Ignore SecureStore hydration errors and keep in-memory seed
      } finally {
        nativeMockHydrated = true;
      }
    })();
  }
  await nativeMockHydrationPromise;
}

if (Platform.OS !== 'web') {
  setMockPersistHandler(persistNativeMockDb);
}

export function setUnauthorizedHandler(handler: (() => void) | null): void {
  unauthorizedHandler = handler;
}

export async function saveSessionTokens(
  accessToken: string,
  userId: string
): Promise<void> {
  if (Platform.OS === 'web') {
    try {
      globalThis.localStorage?.setItem(SECURE_STORAGE_KEYS.ACCESS_TOKEN, accessToken);
      globalThis.localStorage?.setItem(SECURE_STORAGE_KEYS.USER_ID, userId);
    } catch {
      memoryFallbackStorage[SECURE_STORAGE_KEYS.ACCESS_TOKEN] = accessToken;
      memoryFallbackStorage[SECURE_STORAGE_KEYS.USER_ID] = userId;
    }
    return;
  }
  await SecureStore.setItemAsync(SECURE_STORAGE_KEYS.ACCESS_TOKEN, accessToken);
  await SecureStore.setItemAsync(SECURE_STORAGE_KEYS.USER_ID, userId);
}

export async function getStoredAccessToken(): Promise<string | null> {
  if (Platform.OS === 'web') {
    try {
      return (
        globalThis.localStorage?.getItem(SECURE_STORAGE_KEYS.ACCESS_TOKEN) ??
        memoryFallbackStorage[SECURE_STORAGE_KEYS.ACCESS_TOKEN] ??
        null
      );
    } catch {
      return memoryFallbackStorage[SECURE_STORAGE_KEYS.ACCESS_TOKEN] ?? null;
    }
  }
  return SecureStore.getItemAsync(SECURE_STORAGE_KEYS.ACCESS_TOKEN);
}

export async function getStoredUserId(): Promise<string | null> {
  if (Platform.OS === 'web') {
    try {
      return (
        globalThis.localStorage?.getItem(SECURE_STORAGE_KEYS.USER_ID) ??
        memoryFallbackStorage[SECURE_STORAGE_KEYS.USER_ID] ??
        null
      );
    } catch {
      return memoryFallbackStorage[SECURE_STORAGE_KEYS.USER_ID] ?? null;
    }
  }
  return SecureStore.getItemAsync(SECURE_STORAGE_KEYS.USER_ID);
}

export async function clearSessionTokens(): Promise<void> {
  if (Platform.OS === 'web') {
    try {
      globalThis.localStorage?.removeItem(SECURE_STORAGE_KEYS.ACCESS_TOKEN);
      globalThis.localStorage?.removeItem(SECURE_STORAGE_KEYS.USER_ID);
    } catch {
      // Ignore storage removal errors on web
    }
    delete memoryFallbackStorage[SECURE_STORAGE_KEYS.ACCESS_TOKEN];
    delete memoryFallbackStorage[SECURE_STORAGE_KEYS.USER_ID];
    return;
  }
  await SecureStore.deleteItemAsync(SECURE_STORAGE_KEYS.ACCESS_TOKEN);
  await SecureStore.deleteItemAsync(SECURE_STORAGE_KEYS.USER_ID);
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: Record<string, any>;
  isProtected?: boolean;
}

async function handleUnauthorized(): Promise<void> {
  await clearSessionTokens();
  if (unauthorizedHandler) {
    unauthorizedHandler();
  }
}

async function request<T>(
  route: string,
  options: RequestOptions = {}
): Promise<T> {
  const { method = 'POST', body = {}, isProtected = true } = options;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (isProtected) {
    const token = await getStoredAccessToken();
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
  }

  if (USE_MOCK_BACKEND) {
    try {
      await ensureNativeMockHydrated();
      const response = await mockApiRequest(route, body, headers);
      return response as T;
    } catch (error) {
      if (error instanceof MockApiError) {
        if (isProtected && error.status === 401) {
          await handleUnauthorized();
        }
        throw new ApiError(error.status, error.body.message || error.message);
      }
      throw new ApiError(500, 'Erro interno ao processar requisição local.');
    }
  }

  if (!API_BASE_URL) {
    throw new ApiError(
      0,
      'Configure EXPO_PUBLIC_API_URL no arquivo .env para conectar ao backend.'
    );
  }

  const normalizedRoute = route.startsWith('/') ? route : `/${route}`;
  let url = `${API_BASE_URL}${normalizedRoute}`;

  const fetchOptions: RequestInit = {
    method,
    headers,
  };

  if (method === 'GET') {
    const queryEntries = Object.entries(body).filter(
      ([, value]) => value !== undefined && value !== null && value !== ''
    );
    if (queryEntries.length > 0) {
      const searchParams = new URLSearchParams();
      queryEntries.forEach(([key, value]) => {
        searchParams.append(key, String(value));
      });
      url += `?${searchParams.toString()}`;
    }
  } else {
    fetchOptions.body = JSON.stringify(body);
  }

  let response: Response;
  try {
    response = await fetch(url, fetchOptions);
  } catch {
    throw new ApiError(0, 'Sem conexão. Verifique sua internet.');
  }

  let data: any = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    if (isProtected && response.status === 401) {
      await handleUnauthorized();
    }
    const errorMessage =
      data?.message || `Erro na requisição (${response.status}).`;
    throw new ApiError(response.status, errorMessage);
  }

  return data as T;
}

// ============================================================================
// 1. ROTAS PÚBLICAS DE AUTENTICAÇÃO
// ============================================================================

export async function login(payload: LoginPayload): Promise<AuthResponse> {
  return request<AuthResponse>('/login', {
    method: 'POST',
    body: {
      email: payload.email.trim().toLowerCase(),
      senha: payload.senha,
    },
    isProtected: false,
  });
}

export async function createAccount(
  payload: CreateAccountPayload
): Promise<AuthResponse> {
  return request<AuthResponse>('/createAccount', {
    method: 'POST',
    body: {
      nome: payload.nome.trim(),
      email: payload.email.trim().toLowerCase(),
      celular: payload.celular || '',
      data_nascimento: payload.data_nascimento || '',
      genero: payload.genero || '',
      senha: payload.senha,
      foto: payload.foto || '',
      notificacao_app: payload.notificacao_app ?? true,
      notificacao_whatsapp: payload.notificacao_whatsapp ?? false,
    },
    isProtected: false,
  });
}

export async function googleLogin(
  payload: GoogleLoginPayload
): Promise<AuthResponse> {
  return request<AuthResponse>('/googleLogin', {
    method: 'POST',
    body: {
      id_token: payload.id_token,
    },
    isProtected: false,
  });
}

// ============================================================================
// 2. ROTAS PROTEGIDAS (EXIGEM Authorization: Bearer <accessToken>)
// ============================================================================

export async function getAll(id_usuario: string): Promise<GetAllResponse> {
  return request<GetAllResponse>('/getAll', {
    method: 'GET',
    body: { id_usuario },
    isProtected: true,
  });
}

export async function getTip(id_dicas: string): Promise<DicaCompleta> {
  return request<DicaCompleta>('/getTip', {
    method: 'GET',
    body: { id_dicas },
    isProtected: true,
  });
}

export async function getAccount(payload: GetAccountPayload): Promise<Usuario> {
  return request<Usuario>('/getAccount', {
    method: 'GET',
    body: payload,
    isProtected: true,
  });
}

export async function createAnimal(
  payload: CreateAnimalPayload
): Promise<Animal> {
  return request<Animal>('/createAnimal', {
    method: 'POST',
    body: payload,
    isProtected: true,
  });
}

export async function updateAnimal(
  payload: UpdateAnimalPayload
): Promise<Animal> {
  return request<Animal>('/updateAnimal', {
    method: 'POST',
    body: payload,
    isProtected: true,
  });
}

export async function deleteAnimal(
  payload: DeleteAnimalPayload
): Promise<Animal> {
  return request<Animal>('/deleteAnimal', {
    method: 'POST',
    body: payload,
    isProtected: true,
  });
}

export async function createEvent(
  payload: CreateEventPayload
): Promise<Evento> {
  return request<Evento>('/createEvent', {
    method: 'POST',
    body: payload,
    isProtected: true,
  });
}

export async function updateEvent(
  payload: UpdateEventPayload
): Promise<Evento> {
  return request<Evento>('/updateEvent', {
    method: 'POST',
    body: payload,
    isProtected: true,
  });
}

export async function deleteEvent(
  payload: DeleteEventPayload
): Promise<Evento> {
  return request<Evento>('/deleteEvent', {
    method: 'POST',
    body: payload,
    isProtected: true,
  });
}

export async function createVaccine(
  payload: CreateVaccinePayload
): Promise<Vacina> {
  return request<Vacina>('/createVaccine', {
    method: 'POST',
    body: payload,
    isProtected: true,
  });
}

export async function updateVaccine(
  payload: UpdateVaccinePayload
): Promise<Vacina> {
  return request<Vacina>('/updateVaccine', {
    method: 'POST',
    body: payload,
    isProtected: true,
  });
}

export async function deleteVaccine(
  payload: DeleteVaccinePayload
): Promise<Vacina> {
  return request<Vacina>('/deleteVaccine', {
    method: 'POST',
    body: payload,
    isProtected: true,
  });
}

export async function updateAccount(
  payload: UpdateAccountPayload
): Promise<Usuario> {
  return request<Usuario>('/updateAccount', {
    method: 'POST',
    body: payload,
    isProtected: true,
  });
}

export async function deleteAccount(
  payload: DeleteAccountPayload
): Promise<Usuario> {
  return request<Usuario>('/deleteAccount', {
    method: 'POST',
    body: payload,
    isProtected: true,
  });
}

export async function dispatchEventNotifications(
  payload: DispatchEventNotificationsPayload
): Promise<DispatchEventNotificationsResponse> {
  return request<DispatchEventNotificationsResponse>(
    '/dispatchEventNotifications',
    {
      method: 'POST',
      body: payload,
      isProtected: true,
    }
  );
}

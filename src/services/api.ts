import { apiUrl, rewriteFileUrls } from './platform';
import type {
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

export const STORAGE_KEYS = {
  ACCESS_TOKEN: 'petmood_access_token',
  USER_ID: 'petmood_user_id',
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

export function setUnauthorizedHandler(handler: (() => void) | null): void {
  unauthorizedHandler = handler;
}

export async function saveSessionTokens(accessToken: string, userId: string): Promise<void> {
  localStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, accessToken);
  localStorage.setItem(STORAGE_KEYS.USER_ID, userId);
}

export async function getStoredAccessToken(): Promise<string | null> {
  return localStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN);
}

export async function getStoredUserId(): Promise<string | null> {
  return localStorage.getItem(STORAGE_KEYS.USER_ID);
}

export async function clearSessionTokens(): Promise<void> {
  localStorage.removeItem(STORAGE_KEYS.ACCESS_TOKEN);
  localStorage.removeItem(STORAGE_KEYS.USER_ID);
}

async function handleUnauthorized(): Promise<void> {
  await clearSessionTokens();
  if (unauthorizedHandler) {
    unauthorizedHandler();
  }
}

async function request<T>(
  route: string,
  options: { body?: Record<string, any>; isProtected?: boolean } = {}
): Promise<T> {
  const { body = {}, isProtected = true } = options;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };

  if (isProtected) {
    const token = await getStoredAccessToken();
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
  }

  let response: Response;
  try {
    // Cloud Run server (same origin on the web, absolute URL in the APK), which forwards to AWS.
    response = await fetch(apiUrl(`/api/${route.replace(/^\/+/, '')}`), {
      method: 'POST',
      headers,
      body: JSON.stringify(rewriteFileUrls(body, 'out')),
      cache: 'no-store',
    });
  } catch {
    throw new ApiError(0, 'Sem conexão com o servidor. Verifique sua internet e tente novamente.');
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
    const message =
      (data && typeof data.message === 'string' && data.message) ||
      'Erro ao processar a requisição. Tente novamente.';
    throw new ApiError(response.status, message);
  }

  return rewriteFileUrls(data, 'in') as T;
}

export async function login(payload: LoginPayload): Promise<AuthResponse> {
  return request<AuthResponse>('/login', {
    body: {
      email: payload.email.trim().toLowerCase(),
      senha: payload.senha,
    },
    isProtected: false,
  });
}

export async function createAccount(payload: CreateAccountPayload): Promise<AuthResponse> {
  return request<AuthResponse>('/createAccount', {
    body: {
      ...payload,
      nome: payload.nome.trim(),
      email: payload.email.trim().toLowerCase(),
    },
    isProtected: false,
  });
}

export async function googleLogin(payload: GoogleLoginPayload): Promise<AuthResponse> {
  return request<AuthResponse>('/googleLogin', {
    body: payload,
    isProtected: false,
  });
}

export async function getAll(id_usuario: string): Promise<GetAllResponse> {
  return request<GetAllResponse>('/getAll', { body: { id_usuario }, isProtected: true });
}

export async function getTip(id_dicas: string): Promise<DicaCompleta> {
  return request<DicaCompleta>('/getTip', { body: { id_dicas }, isProtected: true });
}

export async function getAccount(payload: GetAccountPayload): Promise<Usuario> {
  return request<Usuario>('/getAccount', { body: payload, isProtected: true });
}

export async function createAnimal(payload: CreateAnimalPayload): Promise<Animal> {
  return request<Animal>('/createAnimal', { body: payload, isProtected: true });
}

export async function updateAnimal(payload: UpdateAnimalPayload): Promise<Animal> {
  return request<Animal>('/updateAnimal', { body: payload, isProtected: true });
}

export async function deleteAnimal(payload: DeleteAnimalPayload): Promise<Animal> {
  return request<Animal>('/deleteAnimal', { body: payload, isProtected: true });
}

export async function createEvent(payload: CreateEventPayload): Promise<Evento> {
  return request<Evento>('/createEvent', { body: payload, isProtected: true });
}

export async function updateEvent(payload: UpdateEventPayload): Promise<Evento> {
  return request<Evento>('/updateEvent', { body: payload, isProtected: true });
}

export async function deleteEvent(payload: DeleteEventPayload): Promise<Evento> {
  return request<Evento>('/deleteEvent', { body: payload, isProtected: true });
}

export async function createVaccine(payload: CreateVaccinePayload): Promise<Vacina> {
  return request<Vacina>('/createVaccine', { body: payload, isProtected: true });
}

export async function updateVaccine(payload: UpdateVaccinePayload): Promise<Vacina> {
  return request<Vacina>('/updateVaccine', { body: payload, isProtected: true });
}

export async function deleteVaccine(payload: DeleteVaccinePayload): Promise<Vacina> {
  return request<Vacina>('/deleteVaccine', { body: payload, isProtected: true });
}

export async function updateAccount(payload: UpdateAccountPayload): Promise<Usuario> {
  return request<Usuario>('/updateAccount', { body: payload, isProtected: true });
}

export async function deleteAccount(payload: DeleteAccountPayload): Promise<Usuario> {
  return request<Usuario>('/deleteAccount', { body: payload, isProtected: true });
}

export async function dispatchEventNotifications(
  payload: DispatchEventNotificationsPayload
): Promise<DispatchEventNotificationsResponse> {
  return request<DispatchEventNotificationsResponse>('/dispatchEventNotifications', {
    body: payload,
    isProtected: true,
  });
}

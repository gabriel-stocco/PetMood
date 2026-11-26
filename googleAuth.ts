/**
 * Google sign-in with Google Identity Services (authorization-code popup flow).
 *
 * The browser only receives a one-time authorization code; the Lambda exchanges it with
 * Google (using the client secret) and verifies the identity. The client id comes from the
 * server at runtime (/api/config), so it can be changed in Cloud Run without a rebuild.
 *
 * Call prepareGoogleSignIn() when a screen with the Google button mounts, so that the popup
 * opens synchronously inside the click (otherwise browsers may block it).
 *
 * In the Android app the web popup is not used (Google blocks it inside WebViews). The native
 * account picker (Credential Manager, @capgo/capacitor-social-login in offline mode) returns a
 * server auth code instead, which the Lambda exchanges the same way (platform 'android').
 */
import { SocialLogin } from '@capgo/capacitor-social-login';
import { IS_NATIVE, apiUrl } from './platform';

/** Sent with the code so the backend uses the matching redirect_uri. */
export const GOOGLE_PLATFORM: 'web' | 'android' = IS_NATIVE ? 'android' : 'web';

interface CodeResponse {
  code?: string;
  error?: string;
  error_description?: string;
}

interface CodeClient {
  requestCode: () => void;
}

interface GoogleOAuth2 {
  initCodeClient: (config: {
    client_id: string;
    scope: string;
    ux_mode: 'popup';
    callback: (response: CodeResponse) => void;
    error_callback?: (error: { type?: string }) => void;
  }) => CodeClient;
}

declare global {
  interface Window {
    google?: { accounts?: { oauth2?: GoogleOAuth2 } };
  }
}

const GIS_SRC = 'https://accounts.google.com/gsi/client';
export const GOOGLE_NOT_CONFIGURED = 'Login com Google não está configurado.';

let client: CodeClient | null = null;
let preparePromise: Promise<CodeClient | null> | null = null;
let pending: { resolve: (code: string) => void; reject: (err: Error) => void } | null = null;

function settle(fn: (p: NonNullable<typeof pending>) => void): void {
  const current = pending;
  pending = null;
  if (current) fn(current);
}

function loadScript(): Promise<void> {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${GIS_SRC}"]`);
    const script = existing || document.createElement('script');
    script.addEventListener('load', () => resolve(), { once: true });
    script.addEventListener('error', () => reject(new Error('Falha ao carregar o Google.')), {
      once: true,
    });
    if (!existing) {
      script.src = GIS_SRC;
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }
  });
}

async function fetchClientId(): Promise<string> {
  const res = await fetch(apiUrl('/api/config'), { cache: 'no-store' });
  if (!res.ok) return '';
  const data = (await res.json()) as { googleClientId?: string };
  return String(data.googleClientId || '').trim();
}

let nativeReady: Promise<boolean> | null = null;

function prepareNativeGoogle(): Promise<boolean> {
  if (!nativeReady) {
    nativeReady = (async () => {
      const webClientId = await fetchClientId();
      if (!webClientId) return false;
      await SocialLogin.initialize({ google: { webClientId, mode: 'offline' } });
      return true;
    })().catch((err) => {
      nativeReady = null; // allow a retry
      throw err;
    });
  }
  return nativeReady;
}

function nativeErrorMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err ?? '');
  if (/cancel/i.test(raw)) return 'Login com Google cancelado.';
  if (/no credential|no account/i.test(raw)) return 'Nenhuma conta Google encontrada neste aparelho.';
  return 'Não foi possível concluir o login com o Google.';
}

async function requestNativeGoogleCode(): Promise<string> {
  if (!(await prepareNativeGoogle())) throw new Error(GOOGLE_NOT_CONFIGURED);
  let response;
  try {
    response = await SocialLogin.login({ provider: 'google', options: {} });
  } catch (err) {
    throw new Error(nativeErrorMessage(err));
  }
  const result = response.result;
  if (result.responseType === 'offline' && result.serverAuthCode) return result.serverAuthCode;
  throw new Error('Não foi possível concluir o login com o Google.');
}

export function prepareGoogleSignIn(): Promise<unknown> {
  return IS_NATIVE ? prepareNativeGoogle() : prepareWebGoogle();
}

function prepareWebGoogle(): Promise<CodeClient | null> {
  if (client) return Promise.resolve(client);
  if (!preparePromise) {
    preparePromise = (async () => {
      const clientId = await fetchClientId();
      if (!clientId) return null;
      await loadScript();
      const oauth2 = window.google?.accounts?.oauth2;
      if (!oauth2) throw new Error('Falha ao carregar o Google.');
      client = oauth2.initCodeClient({
        client_id: clientId,
        scope: 'openid email profile',
        ux_mode: 'popup',
        callback: (response) => {
          if (response.code) {
            const code = response.code;
            settle((p) => p.resolve(code));
          } else {
            settle((p) => p.reject(new Error('Login com Google cancelado ou não autorizado.')));
          }
        },
        error_callback: (error) => {
          const message =
            error?.type === 'popup_closed'
              ? 'Login com Google cancelado.'
              : error?.type === 'popup_failed_to_open'
                ? 'O navegador bloqueou a janela do Google. Permita pop-ups e tente novamente.'
                : 'Não foi possível concluir o login com o Google.';
          settle((p) => p.reject(new Error(message)));
        },
      });
      return client;
    })().catch((err) => {
      preparePromise = null; // allow a retry
      throw err;
    });
  }
  return preparePromise;
}

/** Opens the Google popup and resolves with a one-time authorization code. */
export async function requestGoogleAuthCode(): Promise<string> {
  if (IS_NATIVE) return requestNativeGoogleCode();
  // Fast path: already prepared, so requestCode() runs inside the user's click.
  const ready = client || (await prepareWebGoogle());
  if (!ready) throw new Error(GOOGLE_NOT_CONFIGURED);
  settle((p) => p.reject(new Error('Login com Google cancelado.')));
  return new Promise<string>((resolve, reject) => {
    pending = { resolve, reject };
    ready.requestCode();
  });
}

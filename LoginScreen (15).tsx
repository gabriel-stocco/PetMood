import React, { useEffect, useRef, useState } from 'react';
import { useApp } from '../context/AppContext';
import { ApiError } from '../services/api';
import { prepareGoogleSignIn, requestGoogleAuthCode } from '../services/googleAuth';

interface LoginScreenProps {
  onNavigateToRegister: () => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ onNavigateToRegister }) => {
  const { signIn, signInWithGoogle, isLoading } = useApp();
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [showSenha, setShowSenha] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ email?: boolean; senha?: boolean }>({});
  const [submitting, setSubmitting] = useState(false);

  const emailRef = useRef<HTMLInputElement | null>(null);
  const senhaRef = useRef<HTMLInputElement | null>(null);

  const busy = isLoading || submitting;

  useEffect(() => {
    // Load Google Identity Services early so the popup opens inside the click.
    prepareGoogleSignIn().catch(() => undefined);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setInfoMessage(null);
    const normalizedEmail = email.trim().toLowerCase();
    const nextErrors = {
      email: !normalizedEmail,
      senha: !senha,
    };
    if (nextErrors.email || nextErrors.senha) {
      setFieldErrors(nextErrors);
      setErrorMessage('Informe seu e-mail e senha para entrar.');
      if (nextErrors.email) {
        emailRef.current?.focus({ preventScroll: true });
      } else if (nextErrors.senha) {
        senhaRef.current?.focus({ preventScroll: true });
      }
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    setFieldErrors({});

    setSubmitting(true);
    try {
      await signIn(normalizedEmail, senha);
    } catch (error) {
      setErrorMessage(
        error instanceof ApiError
          ? error.message
          : 'Não foi possível realizar login. Tente novamente.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogleLogin = async () => {
    setErrorMessage(null);
    setInfoMessage(null);
    setSubmitting(true);
    try {
      const code = await requestGoogleAuthCode();
      await signInWithGoogle(code);
    } catch (error) {
      setErrorMessage(
        error instanceof Error && error.message ? error.message : 'Erro ao entrar com o Google.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="min-h-screen w-full flex flex-col justify-center items-center px-5 py-8"
      style={{
        fontFamily: "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif",
        background: 'linear-gradient(180deg, #FDF8F2 0%, #F7EDE4 100%)',
      }}
    >
      <div className="w-full max-w-[390px] flex flex-col items-center">
        <div className="w-[62px] h-[62px] rounded-full bg-[#D96B08] shadow-[0_8px_18px_rgba(217,107,8,0.28)] flex items-center justify-center mb-4">
          <svg width="34" height="34" viewBox="0 0 64 64" fill="none" aria-hidden="true">
            <path
              d="M32 33C24.5 33 19 38.8 19 45.2C19 49.4 22.4 52 26.5 52C28.8 52 30.5 51.1 32 51.1C33.5 51.1 35.2 52 37.5 52C41.6 52 45 49.4 45 45.2C45 38.8 39.5 33 32 33Z"
              stroke="#FFFFFF"
              strokeWidth="4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <ellipse cx="15.5" cy="29.5" rx="4.5" ry="6" transform="rotate(-22 15.5 29.5)" stroke="#FFFFFF" strokeWidth="3.8" />
            <ellipse cx="25.5" cy="21" rx="4.5" ry="6.2" transform="rotate(-8 25.5 21)" stroke="#FFFFFF" strokeWidth="3.8" />
            <ellipse cx="38.5" cy="21" rx="4.5" ry="6.2" transform="rotate(8 38.5 21)" stroke="#FFFFFF" strokeWidth="3.8" />
            <ellipse cx="48.5" cy="29.5" rx="4.5" ry="6" transform="rotate(22 48.5 29.5)" stroke="#FFFFFF" strokeWidth="3.8" />
          </svg>
        </div>

        <h1 className="text-[26px] font-bold text-[#8A4505] tracking-tight mb-1.5 text-center">
          Bem Vindo ao PetMood
        </h1>
        <p className="text-[14.5px] font-normal text-[#B8651B] mb-6 text-center">
          Acesse para cuidar dos seus pequenos amados
        </p>

        {errorMessage && (
          <div className="w-full bg-[#FFF5F5] border border-[#F8CACA] rounded-xl px-3.5 py-2.5 mb-3.5 text-[13px] font-semibold text-[#C92A2A] text-center">
            {errorMessage}
          </div>
        )}

        {infoMessage && (
          <div className="w-full bg-[#FFF3E6] border border-[#F0DFCE] rounded-xl px-3.5 py-2.5 mb-3.5 text-[12.5px] font-medium text-[#8A4505] text-center">
            {infoMessage}
          </div>
        )}

        <form noValidate onSubmit={handleSubmit} className="w-full flex flex-col gap-3.5">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="login-email" className="text-[13.5px] font-semibold text-[#8A4505]">
              Email
            </label>
            <input
              ref={emailRef}
              id="login-email"
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (fieldErrors.email) setFieldErrors((p) => ({ ...p, email: false }));
              }}
              placeholder="seu@email.com"
              aria-invalid={fieldErrors.email || undefined}
              className={`w-full h-12 bg-white rounded-xl px-4 text-[15px] text-[#6E3906] placeholder-[#9E8A78] outline-none ${
                fieldErrors.email
                  ? 'border-[2.5px] border-[#E63946] focus:border-[#E63946]'
                  : 'border-[1.5px] border-[#EBD7C3] focus:border-[#D96B08]'
              }`}
              autoComplete="email"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="login-senha" className="text-[13.5px] font-semibold text-[#8A4505]">
              Senha
            </label>
            <div className="relative">
              <input
                ref={senhaRef}
                id="login-senha"
                type={showSenha ? 'text' : 'password'}
                value={senha}
                onChange={(e) => {
                  setSenha(e.target.value);
                  if (fieldErrors.senha) setFieldErrors((p) => ({ ...p, senha: false }));
                }}
                placeholder="Digite sua senha"
                aria-invalid={fieldErrors.senha || undefined}
                className={`w-full h-12 bg-white rounded-xl pl-4 pr-12 text-[15px] text-[#6E3906] placeholder-[#9E8A78] outline-none ${
                  fieldErrors.senha
                    ? 'border-[2.5px] border-[#E63946] focus:border-[#E63946]'
                    : 'border-[1.5px] border-[#EBD7C3] focus:border-[#D96B08]'
                }`}
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShowSenha((prev) => !prev)}
                aria-label={showSenha ? 'Ocultar senha' : 'Ver senha'}
                title={showSenha ? 'Ocultar senha' : 'Ver senha'}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 w-8 h-8 rounded-lg flex items-center justify-center text-[#8A4505] hover:bg-[#FFF3E6] transition-colors"
              >
                {showSenha ? (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                    <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                    <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
                    <line x1="1" y1="1" x2="23" y2="23" />
                  </svg>
                ) : (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          <div className="flex justify-end -mt-1 mb-0.5">
            <button
              type="button"
              onClick={() =>
                setInfoMessage(
                  'Caso tenha criado sua conta via Google, use "Entrar com o Google". Para redefinir sua senha, entre em contato com o suporte do PetMood.'
                )
              }
              className="text-[13px] font-semibold text-[#C45E07] hover:underline"
            >
              Esqueci minha senha
            </button>
          </div>

          <div className="flex flex-col gap-3">
            <button
              type="submit"
              disabled={busy}
              className="w-full h-12 rounded-full bg-[#D96B08] hover:bg-[#C25E06] disabled:opacity-60 text-white text-[15.5px] font-bold shadow-[0_6px_14px_rgba(217,107,8,0.26)] transition-colors flex items-center justify-center"
            >
              {busy ? 'Entrando...' : 'Entrar'}
            </button>

            <button
              type="button"
              disabled={busy}
              onClick={onNavigateToRegister}
              className="w-full h-12 rounded-full bg-white hover:bg-[#FFF8F1] border-[1.5px] border-[#EBD7C3] text-[#8A4505] text-[15.5px] font-bold transition-colors"
            >
              Criar Conta
            </button>

            <button
              type="button"
              disabled={busy}
              onClick={handleGoogleLogin}
              className="w-full h-12 rounded-full bg-white hover:bg-[#FFF8F1] border-[1.5px] border-[#EBD7C3] text-[#6E3906] text-[15px] font-bold flex items-center justify-center gap-2.5 transition-colors"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
              </svg>
              Entrar com o Google
            </button>
          </div>
        </form>

      </div>
    </div>
  );
};

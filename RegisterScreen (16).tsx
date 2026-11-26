import React, { useEffect, useRef, useState } from 'react';
import { useApp } from '../context/AppContext';
import { ApiError } from '../services/api';
import type { GeneroUsuario } from '../types';
import { PhotoSourceModal } from '../components/PhotoSourceModal';
import { prepareGoogleSignIn, requestGoogleAuthCode } from '../services/googleAuth';
import {
  formatPhoneMask,
  INVALID_CELLPHONE_MESSAGE,
  isValidCellPhone,
} from '../utils/phone';
import { formatDateInputDDMMYYYY, validateDateInput } from '../utils/date';

interface RegisterScreenProps {
  onNavigateToLogin: () => void;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const GENERO_OPTIONS: { value: GeneroUsuario; label: string }[] = [
  { value: 'feminino', label: 'Feminino' },
  { value: 'masculino', label: 'Masculino' },
  { value: 'outro', label: 'Outro' },
  { value: 'prefiro_nao_dizer', label: 'Prefiro não dizer' },
];

export const RegisterScreen: React.FC<RegisterScreenProps> = ({ onNavigateToLogin }) => {
  const { signUp, signInWithGoogle, isLoading, openPhotoViewer } = useApp();

  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [celular, setCelular] = useState('');
  const [dataNascimento, setDataNascimento] = useState('');
  const [genero, setGenero] = useState<string>('');
  const [senha, setSenha] = useState('');
  const [confirmarSenha, setConfirmarSenha] = useState('');
  const [showSenha, setShowSenha] = useState(false);
  const [showConfirmarSenha, setShowConfirmarSenha] = useState(false);
  const [foto, setFoto] = useState('');
  const [fileName, setFileName] = useState('Adicionar foto (câmera ou galeria)');
  const [photoModalOpen, setPhotoModalOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{
    nome?: boolean;
    email?: boolean;
    celular?: boolean;
    data_nascimento?: boolean;
    senha?: boolean;
    confirmarSenha?: boolean;
  }>({});
  const [submitting, setSubmitting] = useState(false);

  const nomeRef = useRef<HTMLInputElement | null>(null);
  const emailRef = useRef<HTMLInputElement | null>(null);
  const celularRef = useRef<HTMLInputElement | null>(null);
  const dataNascimentoRef = useRef<HTMLInputElement | null>(null);
  const senhaRef = useRef<HTMLInputElement | null>(null);
  const confirmarSenhaRef = useRef<HTMLInputElement | null>(null);

  const busy = isLoading || submitting;

  useEffect(() => {
    // Load Google Identity Services early so the popup opens inside the click.
    prepareGoogleSignIn().catch(() => undefined);
  }, []);

  const handleGoogleSignUp = async () => {
    setErrorMessage(null);
    setFieldErrors({});
    setSubmitting(true);
    try {
      // Creates the account from the Google profile (or signs in if it already exists).
      const code = await requestGoogleAuthCode();
      await signInWithGoogle(code);
    } catch (error) {
      setErrorMessage(
        error instanceof Error && error.message
          ? error.message
          : 'Não foi possível cadastrar com o Google. Tente novamente.'
      );
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleSelectPhoto = (dataUrl: string, pickedFileName: string) => {
    setFoto(dataUrl);
    setFileName(pickedFileName);
    setErrorMessage(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const trimmedNome = nome.trim();
    const normalizedEmail = email.trim().toLowerCase();
    const trimmedCelular = celular.trim();
    const trimmedBirth = dataNascimento.trim();
    const birthCheck = validateDateInput(trimmedBirth, {
      required: false,
      allowFuture: false,
      fieldLabel: 'A data de nascimento',
    });
    const nextErrors = {
      nome: !trimmedNome,
      email: !normalizedEmail || !EMAIL_RE.test(normalizedEmail),
      celular: Boolean(trimmedCelular && !isValidCellPhone(trimmedCelular)),
      data_nascimento: !birthCheck.valid,
      senha: senha.length < 8,
      confirmarSenha: !confirmarSenha || senha !== confirmarSenha,
    };

    if (
      nextErrors.nome ||
      nextErrors.email ||
      nextErrors.celular ||
      nextErrors.data_nascimento ||
      nextErrors.senha ||
      nextErrors.confirmarSenha
    ) {
      setFieldErrors(nextErrors);
      if (nextErrors.nome) {
        setErrorMessage('Informe seu nome completo.');
        nomeRef.current?.focus({ preventScroll: true });
      } else if (nextErrors.email) {
        setErrorMessage('Informe um endereço de e-mail válido.');
        emailRef.current?.focus({ preventScroll: true });
      } else if (nextErrors.celular) {
        setErrorMessage(INVALID_CELLPHONE_MESSAGE);
        celularRef.current?.focus({ preventScroll: true });
      } else if (nextErrors.data_nascimento) {
        setErrorMessage(
          birthCheck.error || 'Informe uma data de nascimento válida no formato dd-mm-aaaa.'
        );
        dataNascimentoRef.current?.focus({ preventScroll: true });
      } else if (nextErrors.senha) {
        setErrorMessage('A senha deve ter no mínimo 8 caracteres.');
        senhaRef.current?.focus({ preventScroll: true });
      } else if (nextErrors.confirmarSenha) {
        setErrorMessage('A senha e a confirmação de senha não coincidem.');
        confirmarSenhaRef.current?.focus({ preventScroll: true });
      }
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    setFieldErrors({});

    setSubmitting(true);
    try {
      await signUp({
        nome: trimmedNome,
        email: normalizedEmail,
        celular: celular.trim(),
        data_nascimento: birthCheck.iso,
        genero,
        senha,
        foto,
        notificacao_app: true,
        notificacao_whatsapp: false,
      });
    } catch (error) {
      setErrorMessage(
        error instanceof ApiError
          ? error.message
          : 'Não foi possível criar sua conta. Tente novamente.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="min-h-screen w-full flex flex-col items-center px-5 py-7"
      style={{
        fontFamily: "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif",
        background: 'linear-gradient(180deg, #F0F9F7 0%, #E3F3EF 100%)',
      }}
    >
      <div className="w-full max-w-[390px] flex flex-col items-center">
        <div className="w-[56px] h-[56px] rounded-full bg-[#089C83] shadow-[0_8px_18px_rgba(8,156,131,0.28)] flex items-center justify-center mb-3.5">
          <svg width="30" height="30" viewBox="0 0 64 64" fill="none" aria-hidden="true">
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

        <h1 className="text-[24px] font-bold text-[#055C4D] mb-1 text-center">
          Criar Nova Conta
        </h1>
        <p className="text-[14px] text-[#077A66] mb-5 text-center">
          Preencha seus dados para começar a usar o app
        </p>

        {errorMessage && (
          <div className="w-full bg-[#FFF5F5] border border-[#F8CACA] rounded-xl px-3.5 py-2.5 mb-3.5 text-[13px] font-semibold text-[#C92A2A] text-center">
            {errorMessage}
          </div>
        )}

        <form noValidate onSubmit={handleSubmit} className="w-full flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-[13px] font-semibold text-[#055C4D]">Nome completo *</label>
            <input
              ref={nomeRef}
              type="text"
              value={nome}
              onChange={(e) => {
                setNome(e.target.value);
                if (fieldErrors.nome) setFieldErrors((p) => ({ ...p, nome: false }));
              }}
              placeholder="Seu nome completo"
              aria-invalid={fieldErrors.nome || undefined}
              className={`w-full h-11 bg-white rounded-xl px-3.5 text-[14.5px] text-[#04473B] outline-none ${
                fieldErrors.nome
                  ? 'border-[2.5px] border-[#E63946] focus:border-[#E63946]'
                  : 'border-[1.5px] border-[#C5E5DF] focus:border-[#089C83]'
              }`}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[13px] font-semibold text-[#055C4D]">Email *</label>
            <input
              ref={emailRef}
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (fieldErrors.email) setFieldErrors((p) => ({ ...p, email: false }));
              }}
              placeholder="seu@email.com"
              aria-invalid={fieldErrors.email || undefined}
              className={`w-full h-11 bg-white rounded-xl px-3.5 text-[14.5px] text-[#04473B] outline-none ${
                fieldErrors.email
                  ? 'border-[2.5px] border-[#E63946] focus:border-[#E63946]'
                  : 'border-[1.5px] border-[#C5E5DF] focus:border-[#089C83]'
              }`}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[13px] font-semibold text-[#055C4D]">Celular</label>
            <input
              ref={celularRef}
              type="tel"
              maxLength={15}
              value={celular}
              onChange={(e) => {
                setCelular(formatPhoneMask(e.target.value));
                if (fieldErrors.celular) setFieldErrors((p) => ({ ...p, celular: false }));
              }}
              placeholder="(11) 99999-9999"
              aria-invalid={fieldErrors.celular || undefined}
              className={`w-full h-11 bg-white rounded-xl px-3.5 text-[14.5px] text-[#04473B] outline-none ${
                fieldErrors.celular
                  ? 'border-[2.5px] border-[#E63946] focus:border-[#E63946]'
                  : 'border-[1.5px] border-[#C5E5DF] focus:border-[#089C83]'
              }`}
            />
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div className="flex flex-col gap-1">
              <label className="text-[13px] font-semibold text-[#055C4D]">Nascimento</label>
              <input
                ref={dataNascimentoRef}
                type="text"
                inputMode="numeric"
                maxLength={10}
                placeholder="dd-mm-aaaa"
                value={dataNascimento}
                onChange={(e) => {
                  setDataNascimento(formatDateInputDDMMYYYY(e.target.value));
                  if (fieldErrors.data_nascimento) {
                    setFieldErrors((p) => ({ ...p, data_nascimento: false }));
                  }
                }}
                aria-invalid={fieldErrors.data_nascimento || undefined}
                className={`w-full h-11 bg-white rounded-xl px-3 text-[13.5px] text-[#04473B] outline-none ${
                  fieldErrors.data_nascimento
                    ? 'border-[2.5px] border-[#E63946] focus:border-[#E63946]'
                    : 'border-[1.5px] border-[#C5E5DF] focus:border-[#089C83]'
                }`}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[13px] font-semibold text-[#055C4D]">Gênero</label>
              <select
                value={genero}
                onChange={(e) => setGenero(e.target.value)}
                className="w-full h-11 bg-white border-[1.5px] border-[#C5E5DF] focus:border-[#089C83] rounded-xl px-3 text-[13.5px] text-[#04473B] outline-none"
              >
                <option value="">Selecione...</option>
                {GENERO_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[13px] font-semibold text-[#055C4D]">Senha (mín. 8 caracteres) *</label>
            <div className="relative">
              <input
                ref={senhaRef}
                type={showSenha ? 'text' : 'password'}
                value={senha}
                onChange={(e) => {
                  setSenha(e.target.value);
                  if (fieldErrors.senha) setFieldErrors((p) => ({ ...p, senha: false }));
                }}
                placeholder="Mínimo de 8 caracteres"
                aria-invalid={fieldErrors.senha || undefined}
                className={`w-full h-11 bg-white rounded-xl pl-3.5 pr-11 text-[14.5px] text-[#04473B] outline-none ${
                  fieldErrors.senha
                    ? 'border-[2.5px] border-[#E63946] focus:border-[#E63946]'
                    : 'border-[1.5px] border-[#C5E5DF] focus:border-[#089C83]'
                }`}
              />
              <button
                type="button"
                onClick={() => setShowSenha((prev) => !prev)}
                aria-label={showSenha ? 'Ocultar senha' : 'Ver senha'}
                title={showSenha ? 'Ocultar senha' : 'Ver senha'}
                className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-lg flex items-center justify-center text-[#055C4D] hover:bg-[#E3F3EF] transition-colors"
              >
                {showSenha ? (
                  <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                    <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                    <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
                    <line x1="1" y1="1" x2="23" y2="23" />
                  </svg>
                ) : (
                  <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[13px] font-semibold text-[#055C4D]">Confirmar senha *</label>
            <div className="relative">
              <input
                ref={confirmarSenhaRef}
                type={showConfirmarSenha ? 'text' : 'password'}
                value={confirmarSenha}
                onChange={(e) => {
                  setConfirmarSenha(e.target.value);
                  if (fieldErrors.confirmarSenha) {
                    setFieldErrors((p) => ({ ...p, confirmarSenha: false }));
                  }
                }}
                placeholder="Repita sua senha"
                aria-invalid={fieldErrors.confirmarSenha || undefined}
                className={`w-full h-11 bg-white rounded-xl pl-3.5 pr-11 text-[14.5px] text-[#04473B] outline-none ${
                  fieldErrors.confirmarSenha
                    ? 'border-[2.5px] border-[#E63946] focus:border-[#E63946]'
                    : 'border-[1.5px] border-[#C5E5DF] focus:border-[#089C83]'
                }`}
              />
              <button
                type="button"
                onClick={() => setShowConfirmarSenha((prev) => !prev)}
                aria-label={showConfirmarSenha ? 'Ocultar confirmação de senha' : 'Ver confirmação de senha'}
                title={showConfirmarSenha ? 'Ocultar confirmação de senha' : 'Ver confirmação de senha'}
                className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-lg flex items-center justify-center text-[#055C4D] hover:bg-[#E3F3EF] transition-colors"
              >
                {showConfirmarSenha ? (
                  <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                    <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                    <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
                    <line x1="1" y1="1" x2="23" y2="23" />
                  </svg>
                ) : (
                  <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[13px] font-semibold text-[#055C4D]">Foto de Perfil</label>
            <div className="flex items-center gap-2.5">
              {foto && (
                <button
                  type="button"
                  onClick={() => openPhotoViewer(foto, nome.trim() || 'Foto de perfil')}
                  aria-label="Ver foto de perfil em tela cheia"
                  title="Ver foto em tela cheia"
                  className="w-11 h-11 rounded-full overflow-hidden border-2 border-[#089C83] shrink-0 cursor-pointer transition-transform active:scale-95"
                >
                  <img
                    src={foto}
                    alt="Prévia da foto de perfil"
                    className="w-full h-full object-cover"
                  />
                </button>
              )}
              <button
                type="button"
                disabled={busy}
                onClick={() => setPhotoModalOpen(true)}
                className="flex-1 min-h-[44px] bg-white border-[1.5px] border-dashed border-[#A6DCD2] rounded-xl px-3.5 py-2 flex items-center gap-2.5 cursor-pointer hover:border-[#089C83] text-left"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#089C83" strokeWidth="2" className="shrink-0">
                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                  <circle cx="12" cy="13" r="4" />
                </svg>
                <span className="text-[13.5px] font-medium text-[#077A66] truncate">{fileName}</span>
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-2.5 mt-2">
            <button
              type="submit"
              disabled={busy}
              className="w-full h-12 rounded-full bg-[#089C83] hover:bg-[#078570] disabled:opacity-60 text-white text-[15px] font-bold shadow-[0_6px_14px_rgba(8,156,131,0.28)] transition-colors"
            >
              {busy ? 'Criando conta...' : 'Cadastrar'}
            </button>

            <div className="flex items-center gap-3 my-0.5" aria-hidden="true">
              <div className="flex-1 h-px bg-[#C5E5DF]" />
              <span className="text-[12.5px] font-semibold text-[#077A66]">ou</span>
              <div className="flex-1 h-px bg-[#C5E5DF]" />
            </div>

            <button
              type="button"
              disabled={busy}
              onClick={handleGoogleSignUp}
              className="w-full h-12 rounded-full bg-white hover:bg-[#F5FCFA] disabled:opacity-60 border-[1.5px] border-[#C5E5DF] text-[#04473B] text-[15px] font-bold flex items-center justify-center gap-2.5 transition-colors"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
              </svg>
              Cadastrar com o Google
            </button>

            <button
              type="button"
              disabled={busy}
              onClick={onNavigateToLogin}
              className="w-full h-11 rounded-full bg-white hover:bg-[#F5FCFA] border-[1.5px] border-[#C5E5DF] text-[#055C4D] text-[14.5px] font-bold transition-colors"
            >
              Já tenho uma conta • Voltar ao Login
            </button>
          </div>
        </form>
      </div>

      <PhotoSourceModal
        open={photoModalOpen}
        title="Foto de Perfil"
        theme="teal"
        preferredFacingMode="user"
        onClose={() => setPhotoModalOpen(false)}
        onSelectPhoto={handleSelectPhoto}
        onError={(msg) => setErrorMessage(msg)}
      />
    </div>
  );
};

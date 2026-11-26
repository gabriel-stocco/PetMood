import React, { useEffect, useRef, useState } from 'react';
import { useApp } from '../context/AppContext';
import { ApiError } from '../services/api';
import {
  getBrowserNotificationPermission,
  requestBrowserNotificationPermission,
} from '../services/eventNotifications';
import type { GeneroUsuario } from '../types';
import { PhotoSourceModal } from '../components/PhotoSourceModal';
import {
  formatPhoneMask,
  INVALID_CELLPHONE_MESSAGE,
  isValidCellPhone,
} from '../utils/phone';
import {
  formatDateInputDDMMYYYY,
  toDisplayDate,
  validateDateInput,
} from '../utils/date';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const GENERO_OPTIONS: { value: GeneroUsuario; label: string }[] = [
  { value: 'feminino', label: 'Feminino' },
  { value: 'masculino', label: 'Masculino' },
  { value: 'outro', label: 'Outro' },
  { value: 'prefiro_nao_dizer', label: 'Prefiro não dizer' },
];

export const SettingsScreen: React.FC = () => {
  const { usuario, syncAccount, editAccount, signOut, removeAccount, openPhotoViewer } = useApp();

  const [nome, setNome] = useState(usuario?.nome || '');
  const [email, setEmail] = useState(usuario?.email || '');
  const [celular, setCelular] = useState(usuario?.celular || '');
  const [dataNascimento, setDataNascimento] = useState(
    toDisplayDate(usuario?.data_nascimento)
  );
  const [genero, setGenero] = useState(usuario?.genero || '');
  const [foto, setFoto] = useState(usuario?.foto || '');
  const [notifApp, setNotifApp] = useState(usuario?.notificacao_app ?? true);
  const [notifWhats, setNotifWhats] = useState(usuario?.notificacao_whatsapp ?? false);
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{
    nome?: boolean;
    email?: boolean;
    celular?: boolean;
    data_nascimento?: boolean;
  }>({});

  const nomeRef = useRef<HTMLInputElement | null>(null);
  const emailRef = useRef<HTMLInputElement | null>(null);
  const celularRef = useRef<HTMLInputElement | null>(null);
  const dataNascimentoRef = useRef<HTMLInputElement | null>(null);

  const [phoneAlertModal, setPhoneAlertModal] = useState<{
    visible: boolean;
    title: string;
    text: string;
  }>({
    visible: false,
    title: '',
    text: '',
  });

  const [confirmModal, setConfirmModal] = useState<{
    visible: boolean;
    title: string;
    text: string;
    destructive?: boolean;
    onConfirm: (() => Promise<void> | void) | null;
  }>({
    visible: false,
    title: '',
    text: '',
    onConfirm: null,
  });

  const hasSyncedOnMount = useRef(false);

  useEffect(() => {
    if (hasSyncedOnMount.current) return;
    hasSyncedOnMount.current = true;
    syncAccount().catch(() => {});
  }, [syncAccount]);

  const hasChanges = Boolean(
    usuario &&
      (nome !== (usuario.nome || '') ||
        email !== (usuario.email || '') ||
        celular !== (usuario.celular || '') ||
        dataNascimento !== toDisplayDate(usuario.data_nascimento) ||
        genero !== (usuario.genero || '') ||
        foto !== (usuario.foto || '') ||
        notifApp !== Boolean(usuario.notificacao_app) ||
        notifWhats !== Boolean(usuario.notificacao_whatsapp))
  );

  const hasChangesRef = useRef(hasChanges);
  hasChangesRef.current = hasChanges;
  const isEditingRef = useRef(isEditing);
  isEditingRef.current = isEditing;

  const resetUserDataFromUser = () => {
    if (!usuario) return;
    setNome(usuario.nome || '');
    setEmail(usuario.email || '');
    setCelular(usuario.celular || '');
    setDataNascimento(toDisplayDate(usuario.data_nascimento));
    setGenero(usuario.genero || '');
    setFoto(usuario.foto || '');
  };

  useEffect(() => {
    if (!usuario || isEditingRef.current || hasChangesRef.current) return;
    setNome(usuario.nome || '');
    setEmail(usuario.email || '');
    setCelular(usuario.celular || '');
    setDataNascimento(toDisplayDate(usuario.data_nascimento));
    setGenero(usuario.genero || '');
    setFoto(usuario.foto || '');
    setNotifApp(Boolean(usuario.notificacao_app));
    setNotifWhats(Boolean(usuario.notificacao_whatsapp));
  }, [usuario]);

  const [photoModalOpen, setPhotoModalOpen] = useState(false);

  const handleStartEditing = () => {
    setFeedback(null);
    setErrorMessage(null);
    setFieldErrors({});
    setIsEditing(true);
    setTimeout(() => {
      nomeRef.current?.focus({ preventScroll: true });
    }, 40);
  };

  const handleCancelEditing = () => {
    resetUserDataFromUser();
    setFieldErrors({});
    setErrorMessage(null);
    setFeedback(null);
    setIsEditing(false);
  };

  const handleSelectPhoto = (dataUrl: string) => {
    setFoto(dataUrl);
    setErrorMessage(null);
  };

  return (
    <div className="w-full max-w-[390px] mx-auto px-5 py-6 flex flex-col gap-4">
      <div className="text-center">
        <h1 className="text-[22px] font-bold text-[#8A4505] mb-1">Configurações</h1>
        <p className="text-[13.5px] text-[#B8651B]">
          Gerencie seus dados e preferências de notificações
        </p>
      </div>

      {feedback && (
        <div className="bg-[#FFF3E6] border border-[#F0DFCE] rounded-xl px-3.5 py-2.5 text-[13px] font-semibold text-[#8A4505] text-center">
          {feedback}
        </div>
      )}

      {errorMessage && (
        <div className="bg-[#FFF5F5] border border-[#F8CACA] rounded-xl px-3.5 py-2.5 text-[13px] font-semibold text-[#C92A2A] text-center">
          {errorMessage}
        </div>
      )}

      {/* Avatar */}
      <div className="flex flex-col items-center gap-2">
        <button
          type="button"
          onClick={() => {
            if (foto) {
              openPhotoViewer(foto, nome.trim() || 'Foto de perfil');
            } else if (isEditing) {
              setPhotoModalOpen(true);
            }
          }}
          disabled={!foto && !isEditing}
          aria-label={
            foto
              ? 'Ver foto de perfil em tela cheia'
              : isEditing
                ? 'Adicionar foto de perfil'
                : 'Foto de perfil'
          }
          title={
            foto
              ? 'Ver foto em tela cheia'
              : isEditing
                ? 'Adicionar foto de perfil'
                : undefined
          }
          className={`w-[90px] h-[90px] rounded-full border-[2.5px] border-[#D96B08] bg-[#FFF3E6] overflow-hidden flex items-center justify-center transition-all ${
            foto || isEditing
              ? 'cursor-pointer hover:opacity-90 active:scale-95'
              : 'cursor-default'
          }`}
        >
          {foto ? (
            <img src={foto} alt={nome} className="w-full h-full object-cover" />
          ) : (
            <span className="text-3xl font-bold text-[#D96B08]">
              {(nome || 'U').charAt(0).toUpperCase()}
            </span>
          )}
        </button>
        {isEditing && (
          <button
            type="button"
            onClick={() => setPhotoModalOpen(true)}
            className="px-4 py-1.5 rounded-full bg-white hover:bg-[#FFF8F1] border-[1.5px] border-[#EBD7C3] text-[12.5px] font-bold text-[#8A4505] cursor-pointer flex items-center gap-1.5"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#D96B08" strokeWidth="2.2">
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
              <circle cx="12" cy="13" r="4" />
            </svg>
            Alterar foto (câmera ou galeria)
          </button>
        )}
      </div>

      {/* Meus Dados */}
      <div className="bg-white border-[1.5px] border-[#EBD7C3] rounded-[18px] p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2 pb-1.5 border-b border-[#F0DFCE]">
          <h2 className="text-[15px] font-bold text-[#8A4505]">Meus Dados</h2>
          {isEditing ? (
            <button
              type="button"
              disabled={saving}
              onClick={handleCancelEditing}
              data-testid="settings-cancel-edit-btn"
              className="px-3 py-1 rounded-full bg-white hover:bg-[#FFF8F1] border border-[#EBD7C3] text-[12px] font-bold text-[#B8651B] cursor-pointer transition-colors"
            >
              Cancelar
            </button>
          ) : (
            <button
              type="button"
              onClick={handleStartEditing}
              data-testid="settings-edit-btn"
              className="px-3 py-1 rounded-full bg-[#FFF3E6] hover:bg-[#FFE6CC] border border-[#D96B08] text-[12px] font-bold text-[#8A4505] cursor-pointer flex items-center gap-1.5 transition-colors"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#D96B08" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
              </svg>
              Editar
            </button>
          )}
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-[12.5px] font-semibold text-[#8A4505]">Nome completo *</label>
          <input
            ref={nomeRef}
            type="text"
            value={nome}
            disabled={!isEditing || saving}
            onChange={(e) => {
              setNome(e.target.value);
              if (fieldErrors.nome) setFieldErrors((p) => ({ ...p, nome: false }));
              setErrorMessage(null);
            }}
            aria-invalid={Boolean(fieldErrors.nome)}
            className={`h-10 rounded-lg px-3 text-[14px] focus:outline-none ${
              !isEditing
                ? 'bg-[#F9F2EA] border-[1.5px] border-[#EFE0D1] text-[#6E3906]/85 cursor-not-allowed'
                : fieldErrors.nome
                  ? 'bg-[#FFFDFB] border-[2.5px] border-[#E63946] focus:border-[#E63946] text-[#6E3906]'
                  : 'bg-[#FFFDFB] border-[1.5px] border-[#EBD7C3] focus:border-[#D96B08] text-[#6E3906]'
            }`}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-[12.5px] font-semibold text-[#8A4505]">Email *</label>
          <input
            ref={emailRef}
            type="email"
            value={email}
            disabled={!isEditing || saving}
            onChange={(e) => {
              setEmail(e.target.value);
              if (fieldErrors.email) setFieldErrors((p) => ({ ...p, email: false }));
              setErrorMessage(null);
            }}
            aria-invalid={Boolean(fieldErrors.email)}
            className={`h-10 rounded-lg px-3 text-[14px] focus:outline-none ${
              !isEditing
                ? 'bg-[#F9F2EA] border-[1.5px] border-[#EFE0D1] text-[#6E3906]/85 cursor-not-allowed'
                : fieldErrors.email
                  ? 'bg-[#FFFDFB] border-[2.5px] border-[#E63946] focus:border-[#E63946] text-[#6E3906]'
                  : 'bg-[#FFFDFB] border-[1.5px] border-[#EBD7C3] focus:border-[#D96B08] text-[#6E3906]'
            }`}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-[12.5px] font-semibold text-[#8A4505]">Celular</label>
          <input
            ref={celularRef}
            type="tel"
            maxLength={15}
            value={celular}
            disabled={!isEditing || saving}
            onChange={(e) => {
              setCelular(formatPhoneMask(e.target.value));
              if (fieldErrors.celular) setFieldErrors((p) => ({ ...p, celular: false }));
              setErrorMessage(null);
            }}
            placeholder="(11) 99999-9999"
            aria-invalid={Boolean(fieldErrors.celular)}
            className={`h-10 rounded-lg px-3 text-[14px] focus:outline-none ${
              !isEditing
                ? 'bg-[#F9F2EA] border-[1.5px] border-[#EFE0D1] text-[#6E3906]/85 cursor-not-allowed'
                : fieldErrors.celular
                  ? 'bg-[#FFFDFB] border-[2.5px] border-[#E63946] focus:border-[#E63946] text-[#6E3906]'
                  : 'bg-[#FFFDFB] border-[1.5px] border-[#EBD7C3] focus:border-[#D96B08] text-[#6E3906]'
            }`}
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="flex flex-col gap-1">
            <label className="text-[12.5px] font-semibold text-[#8A4505]">Nascimento</label>
            <input
              ref={dataNascimentoRef}
              type="text"
              inputMode="numeric"
              maxLength={10}
              placeholder="dd-mm-aaaa"
              value={dataNascimento}
              disabled={!isEditing || saving}
              onChange={(e) => {
                setDataNascimento(formatDateInputDDMMYYYY(e.target.value));
                if (fieldErrors.data_nascimento) {
                  setFieldErrors((p) => ({ ...p, data_nascimento: false }));
                }
                setErrorMessage(null);
              }}
              aria-invalid={Boolean(fieldErrors.data_nascimento)}
              className={`h-10 rounded-lg px-2.5 text-[13px] focus:outline-none ${
                !isEditing
                  ? 'bg-[#F9F2EA] border-[1.5px] border-[#EFE0D1] text-[#6E3906]/85 cursor-not-allowed'
                  : fieldErrors.data_nascimento
                    ? 'bg-[#FFFDFB] border-[2.5px] border-[#E63946] focus:border-[#E63946] text-[#6E3906]'
                    : 'bg-[#FFFDFB] border-[1.5px] border-[#EBD7C3] focus:border-[#D96B08] text-[#6E3906]'
              }`}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[12.5px] font-semibold text-[#8A4505]">Gênero</label>
            <select
              value={genero}
              disabled={!isEditing || saving}
              onChange={(e) => setGenero(e.target.value)}
              className={`h-10 rounded-lg px-2.5 text-[13px] ${
                !isEditing
                  ? 'bg-[#F9F2EA] border-[1.5px] border-[#EFE0D1] text-[#6E3906]/85 cursor-not-allowed'
                  : 'bg-[#FFFDFB] border-[1.5px] border-[#EBD7C3] text-[#6E3906]'
              }`}
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
      </div>

      {/* Notificações */}
      <div className="bg-white border-[1.5px] border-[#EBD7C3] rounded-[18px] p-4 flex flex-col gap-3">
        <h2 className="text-[15px] font-bold text-[#8A4505] pb-1.5 border-b border-[#F0DFCE]">
          Notificações Gerais
        </h2>
        {([
          {
            key: 'app',
            label: 'Barra de Notificações do Aparelho',
            desc: 'Exibe lembretes de eventos na barra de notificações do dispositivo ou navegador',
            checked: notifApp,
            onToggle: () => {
              setNotifApp((prev) => {
                const next = !prev;
                if (next && getBrowserNotificationPermission() === 'default') {
                  void requestBrowserNotificationPermission();
                }
                return next;
              });
            },
          },
          {
            key: 'whatsapp',
            label: 'Notificações via WhatsApp',
            desc: 'Permite receber lembretes direto no WhatsApp (requer celular cadastrado)',
            checked: notifWhats,
            onToggle: () => {
              if (notifWhats) {
                setNotifWhats(false);
                return;
              }
              if (!isValidCellPhone(celular)) {
                const msg = celular.trim()
                  ? 'O número de telefone precisa estar no formato (DD) XXXX-XXXX ou (DD) 9XXXX-XXXX com o hífen no meio para ativar notificações via WhatsApp.'
                  : 'Cadastre um número de celular válido antes de ativar as notificações via WhatsApp.';
                setFieldErrors((p) => ({ ...p, celular: true }));
                setErrorMessage(msg);
                setPhoneAlertModal({
                  visible: true,
                  title: 'Celular Necessário',
                  text: msg,
                });
                return;
              }
              setNotifWhats(true);
            },
          },
        ] as const).map((item) => (
          <div key={item.key} className="flex flex-col gap-1.5 py-1">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[13.5px] font-bold text-[#6E3906]">{item.label}</p>
                <p className="text-[11.5px] text-[#B8651B]">{item.desc}</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={item.checked}
                aria-label={item.label}
                disabled={saving}
                onClick={item.onToggle}
                className={`relative w-12 h-7 rounded-full transition-colors shrink-0 cursor-pointer disabled:opacity-60 ${
                  item.checked ? 'bg-[#D96B08]' : 'bg-[#EBD7C3]'
                }`}
              >
                <span
                  className={`absolute top-1 left-1 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                    item.checked ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
            {!item.checked && (
              <p
                data-testid={`settings-notif-disabled-warning-${item.key}`}
                className="text-[11.5px] font-semibold text-[#C92A2A] bg-[#FFF5F5] border border-[#F8CACA] rounded-lg px-2.5 py-1.5 leading-snug"
              >
                Desativada na conta — os eventos continuarão marcados, mas este aviso não irá funcionar enquanto esta opção estiver desligada.
              </p>
            )}
          </div>
        ))}
      </div>

      {/* Ações */}
      <div className="flex flex-col gap-2.5">
        <button
          type="button"
          disabled={saving || !hasChanges}
          data-testid="settings-save-btn"
          onClick={() => {
            if (!hasChanges) return;
            setErrorMessage(null);
            setFeedback(null);
            const trimmedNome = nome.trim();
            const normalizedEmail = email.trim().toLowerCase();
            const trimmedCelular = celular.trim();
            const trimmedBirth = dataNascimento.trim();
            const nomeErr = !trimmedNome;
            const emailErr = !EMAIL_RE.test(normalizedEmail);
            const celularFormatErr = Boolean(trimmedCelular && !isValidCellPhone(trimmedCelular));
            const celularRequiredErr = notifWhats && !isValidCellPhone(trimmedCelular);
            const celularErr = celularFormatErr || celularRequiredErr;
            const birthCheck = validateDateInput(trimmedBirth, {
              required: false,
              allowFuture: false,
              fieldLabel: 'A data de nascimento',
            });
            const birthErr = !birthCheck.valid;
            if (nomeErr || emailErr || celularErr || birthErr) {
              setIsEditing(true);
              setFieldErrors({
                nome: nomeErr,
                email: emailErr,
                celular: celularErr,
                data_nascimento: birthErr,
              });
              if (nomeErr || emailErr) {
                setErrorMessage('Nome completo e um e-mail válido são obrigatórios.');
              } else if (celularFormatErr) {
                setErrorMessage(INVALID_CELLPHONE_MESSAGE);
              } else if (celularRequiredErr) {
                const msg =
                  'Cadastre um número de celular válido para manter as notificações via WhatsApp ativas.';
                setErrorMessage(msg);
                setPhoneAlertModal({
                  visible: true,
                  title: 'Celular Necessário',
                  text: msg,
                });
              } else {
                setErrorMessage(
                  birthCheck.error ||
                    'Informe uma data de nascimento válida no formato dd-mm-aaaa.'
                );
              }
              setTimeout(() => {
                if (nomeErr) {
                  nomeRef.current?.focus({ preventScroll: true });
                } else if (emailErr) {
                  emailRef.current?.focus({ preventScroll: true });
                } else if (celularErr) {
                  celularRef.current?.focus({ preventScroll: true });
                } else if (birthErr) {
                  dataNascimentoRef.current?.focus({ preventScroll: true });
                }
              }, 40);
              window.scrollTo({ top: 0, behavior: 'smooth' });
              return;
            }
            setFieldErrors({});
            const newlyDisabledChannels: string[] = [];
            if (usuario?.notificacao_app && !notifApp) {
              newlyDisabledChannels.push('Barra de Notificações');
            }
            if (usuario?.notificacao_whatsapp && !notifWhats) {
              newlyDisabledChannels.push('WhatsApp');
            }
            const confirmText =
              newlyDisabledChannels.length > 0
                ? `Você está desativando: ${newlyDisabledChannels.join(', ')}. As opções nos seus eventos não serão desmarcadas, mas esses avisos ficarão desativados e não irão funcionar até serem reativados. Deseja salvar?`
                : 'Tem certeza que deseja atualizar os dados e preferências da sua conta?';
            setConfirmModal({
              visible: true,
              title: 'Salvar Alterações',
              text: confirmText,
              onConfirm: async () => {
                setSaving(true);
                try {
                  await editAccount({
                    nome: trimmedNome,
                    email: normalizedEmail,
                    celular: trimmedCelular,
                    data_nascimento: birthCheck.iso,
                    genero,
                    foto,
                    notificacao_app: notifApp,
                    notificacao_whatsapp: notifWhats,
                  });
                  setNome(trimmedNome);
                  setEmail(normalizedEmail);
                  setCelular(trimmedCelular);
                  setDataNascimento(toDisplayDate(birthCheck.iso));
                  setIsEditing(false);
                  setFeedback('Configurações salvas com sucesso!');
                } catch (error) {
                  setErrorMessage(
                    error instanceof ApiError ? error.message : 'Erro ao salvar alterações.'
                  );
                } finally {
                  setSaving(false);
                }
              },
            });
          }}
          className={`w-full h-11 rounded-full text-white text-[14px] font-bold transition-colors ${
            saving || !hasChanges
              ? 'bg-[#D96B08]/45 cursor-not-allowed'
              : 'bg-[#D96B08] hover:bg-[#C25E06] cursor-pointer'
          }`}
        >
          {saving ? 'Salvando...' : 'Salvar alterações'}
        </button>

        <button
          type="button"
          disabled={saving}
          onClick={() =>
            setConfirmModal({
              visible: true,
              title: 'Sair da Conta',
              text: 'Tem certeza que deseja encerrar sua sessão atual?',
              onConfirm: async () => {
                await signOut();
              },
            })
          }
          className="w-full h-11 rounded-full bg-white border-[1.5px] border-[#EBD7C3] text-[#8A4505] text-[14px] font-bold"
        >
          Sair da conta
        </button>

        <button
          type="button"
          disabled={saving}
          onClick={() =>
            setConfirmModal({
              visible: true,
              title: 'Excluir Minha Conta',
              text: 'Tem certeza que deseja excluir permanentemente sua conta e todos os dados cadastrados?',
              destructive: true,
              onConfirm: async () => {
                setSaving(true);
                try {
                  await removeAccount();
                } catch (error) {
                  alert(error instanceof ApiError ? error.message : 'Erro ao excluir conta.');
                } finally {
                  setSaving(false);
                }
              },
            })
          }
          className="w-full h-11 rounded-full bg-[#FFF5F5] border-[1.5px] border-[#F8CACA] text-[#E63946] text-[14px] font-bold"
        >
          Excluir minha conta
        </button>
      </div>

      {confirmModal.visible && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setConfirmModal((p) => ({ ...p, visible: false, onConfirm: null }));
            }
          }}
          className="fixed inset-0 z-50 bg-[#281402]/45 flex items-center justify-center p-4"
        >
          <div className="w-full max-w-[330px] bg-white rounded-[20px] p-5 flex flex-col gap-3">
            <h3 className="text-[17px] font-bold text-[#8A4505]">{confirmModal.title}</h3>
            <p className="text-[13.5px] text-[#6E3906]">{confirmModal.text}</p>
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => setConfirmModal((p) => ({ ...p, visible: false, onConfirm: null }))}
                className="h-10 rounded-full border border-[#EBD7C3] text-[#8A4505] text-[13px] font-bold"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={async () => {
                  const cb = confirmModal.onConfirm;
                  setConfirmModal((p) => ({ ...p, visible: false, onConfirm: null }));
                  if (cb) await cb();
                }}
                className={`h-10 rounded-full text-white text-[13px] font-bold ${
                  confirmModal.destructive ? 'bg-[#E63946]' : 'bg-[#D96B08]'
                }`}
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}
      {phoneAlertModal.visible && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setPhoneAlertModal({ visible: false, title: '', text: '' });
              setIsEditing(true);
              setTimeout(() => celularRef.current?.focus(), 60);
            }
          }}
          className="fixed inset-0 z-50 bg-[#281402]/45 flex items-center justify-center p-4"
        >
          <div className="w-full max-w-[330px] bg-white rounded-[20px] p-5 flex flex-col gap-3">
            <h3 className="text-[17px] font-bold text-[#8A4505]">{phoneAlertModal.title}</h3>
            <p className="text-[13.5px] text-[#6E3906]">{phoneAlertModal.text}</p>
            <button
              type="button"
              onClick={() => {
                setPhoneAlertModal({ visible: false, title: '', text: '' });
                setIsEditing(true);
                setTimeout(() => celularRef.current?.focus(), 60);
              }}
              className="h-10 rounded-full bg-[#D96B08] text-white text-[13px] font-bold"
            >
              Entendi
            </button>
          </div>
        </div>
      )}

      <PhotoSourceModal
        open={photoModalOpen}
        title="Foto de Perfil"
        theme="orange"
        preferredFacingMode="user"
        onClose={() => setPhotoModalOpen(false)}
        onSelectPhoto={handleSelectPhoto}
        onError={(msg) => setErrorMessage(msg)}
      />
    </div>
  );
};

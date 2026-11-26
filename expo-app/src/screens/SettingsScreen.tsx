import React, { ComponentRef, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, Path } from 'react-native-svg';
import { CustomScrollView } from '../components/CustomScrollView';
import { PhotoSourceModal } from '../components/PhotoSourceModal';
import { useApp } from '../context/AppContext';
import { ApiError } from '../services/api';
import { ensureExpoNotificationPermissions } from '../services/eventNotifications';
import { GeneroUsuario } from '../types';
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

interface ConfirmState {
  visible: boolean;
  title: string;
  text: string;
  destructive?: boolean;
  onConfirm: (() => Promise<void> | void) | null;
}

export const SettingsScreen: React.FC = () => {
  const { usuario, syncAccount, editAccount, signOut, removeAccount, openPhotoViewer } =
    useApp();

  const [nome, setNome] = useState<string>(usuario?.nome || '');
  const [email, setEmail] = useState<string>(usuario?.email || '');
  const [celular, setCelular] = useState<string>(usuario?.celular || '');
  const [dataNascimento, setDataNascimento] = useState<string>(
    toDisplayDate(usuario?.data_nascimento)
  );
  const [genero, setGenero] = useState<string>(usuario?.genero || '');
  const [foto, setFoto] = useState<string>(usuario?.foto || '');
  const [notifApp, setNotifApp] = useState<boolean>(
    usuario?.notificacao_app ?? true
  );
  const [notifWhats, setNotifWhats] = useState<boolean>(
    usuario?.notificacao_whatsapp ?? false
  );

  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [genderModalVisible, setGenderModalVisible] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{
    nome?: boolean;
    email?: boolean;
    celular?: boolean;
    data_nascimento?: boolean;
  }>({});

  const scrollRef = useRef<ComponentRef<typeof ScrollView> | null>(null);
  const nomeInputRef = useRef<ComponentRef<typeof TextInput> | null>(null);
  const emailInputRef = useRef<ComponentRef<typeof TextInput> | null>(null);
  const celularInputRef = useRef<ComponentRef<typeof TextInput> | null>(null);
  const nascimentoInputRef = useRef<ComponentRef<typeof TextInput> | null>(null);
  const [confirmState, setConfirmState] = useState<ConfirmState>({
    visible: false,
    title: '',
    text: '',
    destructive: false,
    onConfirm: null,
  });

  const hasSyncedOnMount = useRef(false);

  useEffect(() => {
    if (hasSyncedOnMount.current) return;
    hasSyncedOnMount.current = true;
    syncAccount().catch(() => {
      // Mantém dados atuais do contexto em caso de falha transitória
    });
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

  const selectedGeneroLabel =
    GENERO_OPTIONS.find((item) => item.value === genero)?.label ||
    'Selecione o gênero';

  const [photoModalVisible, setPhotoModalVisible] = useState<boolean>(false);

  const handleStartEditing = () => {
    setErrorMessage(null);
    setFieldErrors({});
    setIsEditing(true);
    setTimeout(() => {
      nomeInputRef.current?.focus();
    }, 60);
  };

  const handleCancelEditing = () => {
    resetUserDataFromUser();
    setFieldErrors({});
    setErrorMessage(null);
    setGenderModalVisible(false);
    setIsEditing(false);
  };

  const handlePickPhoto = () => {
    if (!isEditing) return;
    setPhotoModalVisible(true);
  };

  const handleSelectPhoto = (dataUri: string) => {
    setFoto(dataUri);
    setErrorMessage(null);
  };

  const openConfirmModal = (
    title: string,
    text: string,
    onConfirm: () => Promise<void> | void,
    destructive = false
  ) => {
    setConfirmState({
      visible: true,
      title,
      text,
      destructive,
      onConfirm,
    });
  };

  const closeConfirmModal = () => {
    setConfirmState((prev) => ({ ...prev, visible: false, onConfirm: null }));
  };

  const handleConfirmOk = async () => {
    const cb = confirmState.onConfirm;
    closeConfirmModal();
    if (cb) {
      await cb();
    }
  };

  const handleRequestSave = () => {
    setErrorMessage(null);
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
        Alert.alert('Celular necessário', msg, [
          {
            text: 'Entendi',
            onPress: () => setTimeout(() => celularInputRef.current?.focus(), 80),
          },
        ]);
      } else {
        setErrorMessage(
          birthCheck.error || 'Informe uma data de nascimento válida no formato dd-mm-aaaa.'
        );
      }
      scrollRef.current?.scrollTo({ y: 0, animated: true });
      setTimeout(() => {
        if (nomeErr) {
          nomeInputRef.current?.focus();
        } else if (emailErr) {
          emailInputRef.current?.focus();
        } else if (celularErr) {
          celularInputRef.current?.focus();
        } else if (birthErr) {
          nascimentoInputRef.current?.focus();
        }
        scrollRef.current?.scrollTo({ y: 0, animated: true });
      }, 60);
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

    openConfirmModal(
      'Salvar Alterações',
      confirmText,
      async () => {
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
          Alert.alert('Sucesso', 'Configurações salvas com sucesso!');
        } catch (error) {
          Alert.alert(
            'Erro ao salvar',
            error instanceof ApiError
              ? error.message
              : 'Não foi possível salvar suas alterações.'
          );
        } finally {
          setSaving(false);
        }
      }
    );
  };

  const handleRequestLogout = () => {
    openConfirmModal(
      'Sair da Conta',
      'Tem certeza que deseja encerrar sua sessão atual?',
      async () => {
        await signOut();
      }
    );
  };

  const handleRequestDeleteAccount = () => {
    openConfirmModal(
      'Excluir Minha Conta',
      'Tem certeza que deseja excluir permanentemente sua conta e todos os dados cadastrados?',
      async () => {
        setSaving(true);
        try {
          await removeAccount();
        } catch (error) {
          Alert.alert(
            'Erro ao excluir conta',
            error instanceof ApiError
              ? error.message
              : 'Não foi possível excluir a conta.'
          );
        } finally {
          setSaving(false);
        }
      },
      true
    );
  };

  return (
    <LinearGradient colors={['#FDF8F2', '#F7EDE4']} style={styles.gradient}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <CustomScrollView
          ref={scrollRef}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.container}>
            <View style={styles.pageHeader}>
              <Text style={styles.pageTitle}>Configurações</Text>
              <Text style={styles.pageSubtitle}>
                Gerencie seus dados e preferências de notificações
              </Text>
            </View>

            {errorMessage ? (
              <View style={styles.errorBanner}>
                <Text style={styles.errorBannerText}>{errorMessage}</Text>
              </View>
            ) : null}

            {/* Seção Avatar */}
            <View style={styles.avatarSection}>
              <TouchableOpacity
                activeOpacity={foto || isEditing ? 0.85 : 1}
                disabled={!foto && !isEditing}
                onPress={() => {
                  if (foto) {
                    openPhotoViewer(foto, nome.trim() || 'Foto de perfil');
                  } else if (isEditing) {
                    handlePickPhoto();
                  }
                }}
                style={styles.avatarWrapper}
                accessibilityRole="button"
                accessibilityLabel={
                  foto
                    ? 'Ver foto de perfil em tela cheia'
                    : isEditing
                      ? 'Adicionar foto de perfil'
                      : 'Foto de perfil'
                }
              >
                {foto ? (
                  <Image
                    source={{ uri: foto }}
                    style={styles.avatarImage}
                    resizeMode="cover"
                  />
                ) : (
                  <Svg
                    width={40}
                    height={40}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#B8651B"
                    strokeWidth={1.8}
                  >
                    <Path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                    <Circle cx="12" cy="7" r="4" />
                  </Svg>
                )}
              </TouchableOpacity>

              <Text style={styles.avatarStatus}>
                {foto ? 'Foto selecionada' : 'Nenhuma foto adicionada'}
              </Text>

              {isEditing ? (
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={handlePickPhoto}
                  style={styles.btnPhoto}
                >
                  <Text style={styles.btnPhotoText}>
                    Alterar foto (câmera ou galeria)
                  </Text>
                </TouchableOpacity>
              ) : null}
            </View>

            {/* Card 1: Meus Dados */}
            <View style={styles.card}>
              <View style={styles.cardHeaderRow}>
                <Text style={styles.cardTitleInline}>Meus Dados</Text>
                {isEditing ? (
                  <TouchableOpacity
                    activeOpacity={0.85}
                    disabled={saving}
                    onPress={handleCancelEditing}
                    style={styles.cancelEditPill}
                    accessibilityRole="button"
                    accessibilityLabel="Cancelar edição"
                  >
                    <Text style={styles.cancelEditPillText}>Cancelar</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={handleStartEditing}
                    style={styles.editPill}
                    accessibilityRole="button"
                    accessibilityLabel="Editar dados"
                  >
                    <Svg
                      width={13}
                      height={13}
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="#D96B08"
                      strokeWidth={2.3}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <Path d="M12 20h9" />
                      <Path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                    </Svg>
                    <Text style={styles.editPillText}>Editar</Text>
                  </TouchableOpacity>
                )}
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Nome completo *</Text>
                <TextInput
                  ref={nomeInputRef}
                  value={nome}
                  editable={isEditing && !saving}
                  onChangeText={(txt) => {
                    setNome(txt);
                    if (fieldErrors.nome) setFieldErrors((p) => ({ ...p, nome: false }));
                    setErrorMessage(null);
                  }}
                  style={[
                    styles.formInput,
                    !isEditing && styles.formInputReadOnly,
                    fieldErrors.nome && styles.inputError,
                  ]}
                  placeholder="Seu nome"
                  placeholderTextColor="#9E8A78"
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Email *</Text>
                <TextInput
                  ref={emailInputRef}
                  value={email}
                  editable={isEditing && !saving}
                  onChangeText={(txt) => {
                    setEmail(txt);
                    if (fieldErrors.email) setFieldErrors((p) => ({ ...p, email: false }));
                    setErrorMessage(null);
                  }}
                  style={[
                    styles.formInput,
                    !isEditing && styles.formInputReadOnly,
                    fieldErrors.email && styles.inputError,
                  ]}
                  placeholder="seu@email.com"
                  placeholderTextColor="#9E8A78"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Celular</Text>
                <TextInput
                  ref={celularInputRef}
                  value={celular}
                  editable={isEditing && !saving}
                  onChangeText={(txt) => {
                    setCelular(formatPhoneMask(txt));
                    if (fieldErrors.celular) {
                      setFieldErrors((p) => ({ ...p, celular: false }));
                    }
                    setErrorMessage(null);
                  }}
                  style={[
                    styles.formInput,
                    !isEditing && styles.formInputReadOnly,
                    fieldErrors.celular && styles.inputError,
                  ]}
                  placeholder="(11) 99999-9999"
                  placeholderTextColor="#9E8A78"
                  keyboardType="phone-pad"
                  maxLength={15}
                />
              </View>

              <View style={styles.formRow}>
                <View style={[styles.formGroup, styles.flex]}>
                  <Text style={styles.formLabel}>Data de nascimento</Text>
                  <TextInput
                    ref={nascimentoInputRef}
                    value={dataNascimento}
                    editable={isEditing && !saving}
                    onChangeText={(txt) => {
                      setDataNascimento(formatDateInputDDMMYYYY(txt));
                      if (fieldErrors.data_nascimento) {
                        setFieldErrors((p) => ({ ...p, data_nascimento: false }));
                      }
                      setErrorMessage(null);
                    }}
                    style={[
                      styles.formInput,
                      !isEditing && styles.formInputReadOnly,
                      fieldErrors.data_nascimento && styles.inputError,
                    ]}
                    placeholder="dd-mm-aaaa"
                    placeholderTextColor="#9E8A78"
                    keyboardType="number-pad"
                    maxLength={10}
                  />
                </View>

                <View style={[styles.formGroup, styles.flex]}>
                  <Text style={styles.formLabel}>Gênero</Text>
                  <TouchableOpacity
                    activeOpacity={isEditing ? 0.85 : 1}
                    disabled={!isEditing || saving}
                    onPress={() => setGenderModalVisible(true)}
                    style={[
                      styles.selectBox,
                      !isEditing && styles.formInputReadOnly,
                    ]}
                  >
                    <Text style={styles.selectValueText} numberOfLines={1}>
                      {selectedGeneroLabel}
                    </Text>
                    <Text style={styles.selectChevron}>▾</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>

            {/* Card 2: Notificações Gerais */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Notificações Gerais</Text>

              <View style={styles.switchBlock}>
                <View style={styles.switchRow}>
                  <View style={styles.switchInfo}>
                    <Text style={styles.switchLabel}>
                      Barra de Notificações do Celular
                    </Text>
                    <Text style={styles.switchDesc}>
                      Exibe alertas e lembretes de eventos na barra de notificações do dispositivo
                    </Text>
                  </View>
                  <Switch
                    value={notifApp}
                    disabled={saving}
                    onValueChange={(next) => {
                      setNotifApp(next);
                      if (next) {
                        void ensureExpoNotificationPermissions().then((granted) => {
                          if (!granted) {
                            Alert.alert(
                              'Permissão bloqueada',
                              'Ative as notificações do PetMood nas configurações do aparelho para exibir alertas na barra de notificações.',
                              [
                                { text: 'Depois', style: 'cancel' },
                                {
                                  text: 'Abrir Ajustes',
                                  onPress: () => void Linking.openSettings(),
                                },
                              ]
                            );
                          }
                        });
                      }
                    }}
                    trackColor={{ false: '#EBD7C3', true: '#D96B08' }}
                    thumbColor="#FFFFFF"
                    accessibilityLabel="Barra de Notificações do Celular"
                  />
                </View>
                {!notifApp ? (
                  <View style={styles.notifDisabledBanner}>
                    <Text style={styles.notifDisabledBannerText}>
                      Desativada na conta — os eventos continuarão marcados, mas este aviso não irá funcionar enquanto esta opção estiver desligada.
                    </Text>
                  </View>
                ) : null}
              </View>

              <View style={styles.switchBlock}>
                <View style={styles.switchRow}>
                  <View style={styles.switchInfo}>
                    <Text style={styles.switchLabel}>
                      Notificações via WhatsApp
                    </Text>
                    <Text style={styles.switchDesc}>
                      Permite receber lembretes direto no WhatsApp (requer celular cadastrado)
                    </Text>
                  </View>
                  <Switch
                    value={notifWhats}
                    disabled={saving}
                    onValueChange={(next) => {
                      if (!next) {
                        setNotifWhats(false);
                        return;
                      }
                      if (!isValidCellPhone(celular)) {
                        const msg = celular.trim()
                          ? 'O número de telefone precisa estar no formato (DD) XXXX-XXXX ou (DD) 9XXXX-XXXX com o hífen no meio para ativar notificações via WhatsApp.'
                          : 'Cadastre um número de celular válido antes de ativar as notificações via WhatsApp.';
                        setNotifWhats(false);
                        setFieldErrors((p) => ({ ...p, celular: true }));
                        setErrorMessage(msg);
                        scrollRef.current?.scrollTo({ y: 0, animated: true });
                        Alert.alert('Celular necessário', msg, [
                          {
                            text: 'Entendi',
                            onPress: () => {
                              setIsEditing(true);
                              setTimeout(() => celularInputRef.current?.focus(), 80);
                            },
                          },
                        ]);
                        return;
                      }
                      setNotifWhats(true);
                    }}
                    trackColor={{ false: '#EBD7C3', true: '#D96B08' }}
                    thumbColor="#FFFFFF"
                    accessibilityLabel="Notificações via WhatsApp"
                  />
                </View>
                {!notifWhats ? (
                  <View style={styles.notifDisabledBanner}>
                    <Text style={styles.notifDisabledBannerText}>
                      Desativada na conta — os eventos continuarão marcados, mas este aviso não irá funcionar enquanto esta opção estiver desligada.
                    </Text>
                  </View>
                ) : null}
              </View>
            </View>

            {/* Botões de Ação */}
            <View style={styles.actionsGroup}>
              <TouchableOpacity
                activeOpacity={0.85}
                disabled={saving || !hasChanges}
                onPress={handleRequestSave}
                style={[
                  styles.btnPrimary,
                  (saving || !hasChanges) && styles.btnPrimaryDisabled,
                ]}
              >
                {saving ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.btnPrimaryText}>Salvar alterações</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={0.85}
                disabled={saving}
                onPress={handleRequestLogout}
                style={styles.btnSecondary}
              >
                <Text style={styles.btnSecondaryText}>Sair da conta</Text>
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={0.85}
                disabled={saving}
                onPress={handleRequestDeleteAccount}
                style={styles.btnDangerSoft}
              >
                <Text style={styles.btnDangerSoftText}>
                  Excluir minha conta
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </CustomScrollView>
      </KeyboardAvoidingView>

      {/* Modal Seletor de Gênero */}
      <Modal
        visible={genderModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setGenderModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setGenderModalVisible(false)}
            accessibilityLabel="Fechar pop-up"
          />
          <View style={styles.modalBox}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Selecionar Gênero</Text>
              <TouchableOpacity onPress={() => setGenderModalVisible(false)}>
                <Text style={styles.modalClose}>×</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.optionList}>
              {GENERO_OPTIONS.map((opt) => {
                const selected = genero === opt.value;
                return (
                  <TouchableOpacity
                    key={opt.value}
                    activeOpacity={0.8}
                    onPress={() => {
                      setGenero(opt.value);
                      setGenderModalVisible(false);
                    }}
                    style={[
                      styles.optionItem,
                      selected && styles.optionItemSelected,
                    ]}
                  >
                    <Text
                      style={[
                        styles.optionText,
                        selected && styles.optionTextSelected,
                      ]}
                    >
                      {opt.label}
                    </Text>
                    <Text style={styles.optionCheck}>
                      {selected ? '✓' : ''}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal Único de Confirmação */}
      <Modal
        visible={confirmState.visible}
        transparent
        animationType="fade"
        onRequestClose={closeConfirmModal}
      >
        <View style={styles.modalOverlay}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={closeConfirmModal}
            accessibilityLabel="Fechar pop-up"
          />
          <View style={styles.modalBox}>
            <Text style={styles.confirmTitle}>{confirmState.title}</Text>
            <Text style={styles.confirmText}>{confirmState.text}</Text>
            <View style={styles.modalFooter}>
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={closeConfirmModal}
                style={[styles.footerBtn, styles.btnSecondary]}
              >
                <Text style={styles.btnSecondaryText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={handleConfirmOk}
                style={[
                  styles.footerBtn,
                  confirmState.destructive
                    ? styles.btnDangerSolid
                    : styles.btnPrimary,
                ]}
              >
                <Text style={styles.btnPrimaryText}>Confirmar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <PhotoSourceModal
        visible={photoModalVisible}
        title="Foto de Perfil"
        theme="orange"
        aspect={[1, 1]}
        defaultFileName="foto-perfil.jpg"
        onClose={() => setPhotoModalVisible(false)}
        onSelectPhoto={handleSelectPhoto}
      />
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  gradient: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: 24,
    paddingBottom: 48,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  container: {
    width: '100%',
    maxWidth: 390,
    gap: 18,
  },
  pageHeader: {
    alignItems: 'center',
  },
  pageTitle: {
    fontSize: 22,
    fontFamily: 'PlusJakartaSans_700Bold',
    color: '#8A4505',
    marginBottom: 4,
    textAlign: 'center',
  },
  pageSubtitle: {
    fontSize: 13.5,
    fontFamily: 'PlusJakartaSans_400Regular',
    color: '#B8651B',
    textAlign: 'center',
  },
  avatarSection: {
    alignItems: 'center',
    gap: 8,
  },
  avatarWrapper: {
    width: 92,
    height: 92,
    borderRadius: 46,
    borderWidth: 2.5,
    borderColor: '#D96B08',
    backgroundColor: '#FFF3E6',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  avatarStatus: {
    fontSize: 12,
    fontFamily: 'PlusJakartaSans_600SemiBold',
    color: '#B8651B',
  },
  btnPhoto: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#EBD7C3',
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 999,
  },
  btnPhotoText: {
    fontSize: 12.5,
    fontFamily: 'PlusJakartaSans_700Bold',
    color: '#8A4505',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#EBD7C3',
    borderRadius: 18,
    padding: 16,
    gap: 12,
    shadowColor: '#8A4505',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F0DFCE',
  },
  cardTitleInline: {
    fontSize: 15,
    fontFamily: 'PlusJakartaSans_700Bold',
    color: '#8A4505',
  },
  editPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#FFF3E6',
    borderWidth: 1,
    borderColor: '#D96B08',
    paddingVertical: 4,
    paddingHorizontal: 11,
    borderRadius: 999,
  },
  editPillText: {
    fontSize: 12,
    fontFamily: 'PlusJakartaSans_700Bold',
    color: '#8A4505',
  },
  cancelEditPill: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#EBD7C3',
    paddingVertical: 4,
    paddingHorizontal: 11,
    borderRadius: 999,
  },
  cancelEditPillText: {
    fontSize: 12,
    fontFamily: 'PlusJakartaSans_700Bold',
    color: '#B8651B',
  },
  cardTitle: {
    fontSize: 15,
    fontFamily: 'PlusJakartaSans_700Bold',
    color: '#8A4505',
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#F0DFCE',
  },
  formRow: {
    flexDirection: 'row',
    gap: 8,
  },
  formGroup: {
    gap: 5,
  },
  formLabel: {
    fontSize: 13,
    fontFamily: 'PlusJakartaSans_600SemiBold',
    color: '#8A4505',
  },
  formInput: {
    width: '100%',
    height: 42,
    backgroundColor: '#FFFDFB',
    borderWidth: 1.5,
    borderColor: '#EBD7C3',
    borderRadius: 10,
    paddingHorizontal: 12,
    fontFamily: 'PlusJakartaSans_400Regular',
    fontSize: 14,
    color: '#6E3906',
  },
  formInputReadOnly: {
    backgroundColor: '#F9F2EA',
    borderColor: '#EFE0D1',
    opacity: 0.85,
  },
  inputError: {
    borderColor: '#E63946',
    borderWidth: 2.5,
  },
  errorBanner: {
    width: '100%',
    backgroundColor: '#FFF5F5',
    borderWidth: 1,
    borderColor: '#F8CACA',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  errorBannerText: {
    fontSize: 13,
    fontFamily: 'PlusJakartaSans_600SemiBold',
    color: '#C92A2A',
    textAlign: 'center',
  },
  selectBox: {
    height: 42,
    backgroundColor: '#FFFDFB',
    borderWidth: 1.5,
    borderColor: '#EBD7C3',
    borderRadius: 10,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  selectValueText: {
    fontSize: 14,
    fontFamily: 'PlusJakartaSans_400Regular',
    color: '#6E3906',
    flex: 1,
  },
  selectChevron: {
    fontSize: 14,
    color: '#B8651B',
    marginLeft: 6,
  },
  switchBlock: {
    gap: 6,
    paddingVertical: 4,
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  notifDisabledBanner: {
    backgroundColor: '#FFF5F5',
    borderWidth: 1,
    borderColor: '#F8CACA',
    borderRadius: 10,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  notifDisabledBannerText: {
    fontSize: 11.5,
    fontFamily: 'PlusJakartaSans_600SemiBold',
    color: '#C92A2A',
    lineHeight: 16,
  },
  switchInfo: {
    flex: 1,
    gap: 2,
  },
  switchLabel: {
    fontSize: 13.5,
    fontFamily: 'PlusJakartaSans_700Bold',
    color: '#6E3906',
  },
  switchDesc: {
    fontSize: 11.5,
    fontFamily: 'PlusJakartaSans_400Regular',
    color: '#B8651B',
    lineHeight: 16,
  },
  actionsGroup: {
    gap: 10,
    marginTop: 4,
  },
  btnPrimary: {
    width: '100%',
    height: 44,
    borderRadius: 999,
    backgroundColor: '#D96B08',
    justifyContent: 'center',
    alignItems: 'center',
  },
  btnPrimaryDisabled: {
    opacity: 0.45,
  },
  btnPrimaryText: {
    fontSize: 14,
    fontFamily: 'PlusJakartaSans_700Bold',
    color: '#FFFFFF',
  },
  btnSecondary: {
    width: '100%',
    height: 44,
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#EBD7C3',
    justifyContent: 'center',
    alignItems: 'center',
  },
  btnSecondaryText: {
    fontSize: 14,
    fontFamily: 'PlusJakartaSans_700Bold',
    color: '#8A4505',
  },
  btnDangerSoft: {
    width: '100%',
    height: 44,
    borderRadius: 999,
    backgroundColor: '#FFF5F5',
    borderWidth: 1.5,
    borderColor: '#F8CACA',
    justifyContent: 'center',
    alignItems: 'center',
  },
  btnDangerSoftText: {
    fontSize: 14,
    fontFamily: 'PlusJakartaSans_700Bold',
    color: '#E63946',
  },
  btnDangerSolid: {
    backgroundColor: '#E63946',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(40, 20, 2, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalBox: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#F0DFCE',
    padding: 20,
    gap: 14,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F0DFCE',
  },
  modalTitle: {
    fontSize: 16,
    fontFamily: 'PlusJakartaSans_700Bold',
    color: '#8A4505',
  },
  modalClose: {
    fontSize: 24,
    color: '#B8651B',
    lineHeight: 26,
  },
  optionList: {
    gap: 8,
  },
  optionItem: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#EBD7C3',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  optionItemSelected: {
    backgroundColor: '#FFF3E6',
    borderColor: '#D96B08',
  },
  optionText: {
    fontSize: 14,
    fontFamily: 'PlusJakartaSans_600SemiBold',
    color: '#6E3906',
  },
  optionTextSelected: {
    color: '#D96B08',
  },
  optionCheck: {
    fontSize: 14,
    fontFamily: 'PlusJakartaSans_700Bold',
    color: '#D96B08',
  },
  confirmTitle: {
    fontSize: 17,
    fontFamily: 'PlusJakartaSans_700Bold',
    color: '#8A4505',
  },
  confirmText: {
    fontSize: 13.5,
    fontFamily: 'PlusJakartaSans_400Regular',
    color: '#6E3906',
    lineHeight: 20,
  },
  modalFooter: {
    flexDirection: 'row',
    gap: 10,
  },
  footerBtn: {
    flex: 1,
    height: 44,
  },
});

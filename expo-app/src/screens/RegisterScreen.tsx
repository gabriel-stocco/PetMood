import React, { ComponentRef, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, Ellipse, Line, Path, Polyline, Rect } from 'react-native-svg';
import { CustomScrollView } from '../components/CustomScrollView';
import { PhotoSourceModal } from '../components/PhotoSourceModal';
import { useApp } from '../context/AppContext';
import { ApiError } from '../services/api';
import { GeneroUsuario } from '../types';
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

export const RegisterScreen: React.FC<RegisterScreenProps> = ({
  onNavigateToLogin,
}) => {
  const { signUp, isLoading, openPhotoViewer } = useApp();

  const [nome, setNome] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [celular, setCelular] = useState<string>('');
  const [dataNascimento, setDataNascimento] = useState<string>('');
  const [genero, setGenero] = useState<GeneroUsuario>('');
  const [senha, setSenha] = useState<string>('');
  const [confirmarSenha, setConfirmarSenha] = useState<string>('');
  const [showSenha, setShowSenha] = useState<boolean>(false);
  const [showConfirmarSenha, setShowConfirmarSenha] = useState<boolean>(false);
  const [foto, setFoto] = useState<string>('');
  const [fileName, setFileName] = useState<string>('Nenhum arquivo selecionado');

  const [genderModalVisible, setGenderModalVisible] = useState<boolean>(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{
    nome?: boolean;
    email?: boolean;
    celular?: boolean;
    data_nascimento?: boolean;
    senha?: boolean;
    confirmarSenha?: boolean;
  }>({});
  const [submitting, setSubmitting] = useState<boolean>(false);

  const scrollRef = useRef<ComponentRef<typeof ScrollView> | null>(null);
  const nomeInputRef = useRef<ComponentRef<typeof TextInput> | null>(null);
  const emailInputRef = useRef<ComponentRef<typeof TextInput> | null>(null);
  const celularInputRef = useRef<ComponentRef<typeof TextInput> | null>(null);
  const nascimentoInputRef = useRef<ComponentRef<typeof TextInput> | null>(null);
  const senhaInputRef = useRef<ComponentRef<typeof TextInput> | null>(null);
  const confirmarSenhaInputRef = useRef<ComponentRef<typeof TextInput> | null>(null);

  const busy = isLoading || submitting;

  const selectedGeneroLabel =
    GENERO_OPTIONS.find((item) => item.value === genero)?.label ||
    'Selecione o gênero';

  const [photoModalVisible, setPhotoModalVisible] = useState<boolean>(false);

  const handlePickPhoto = () => {
    setErrorMessage(null);
    setPhotoModalVisible(true);
  };

  const handleSelectPhoto = (dataUri: string, pickedName: string) => {
    setFoto(dataUri);
    setFileName(pickedName || 'foto-perfil.jpg');
    setErrorMessage(null);
  };

  const handleSubmit = async () => {
    setErrorMessage(null);
    const trimmedNome = nome.trim();
    const normalizedEmail = email.trim().toLowerCase();
    const trimmedCelular = celular.trim();
    const trimmedBirth = dataNascimento.trim();

    const nomeErr = !trimmedNome;
    const emailErr = !EMAIL_RE.test(normalizedEmail);
    const celularErr = Boolean(trimmedCelular && !isValidCellPhone(trimmedCelular));
    const birthCheck = validateDateInput(trimmedBirth, {
      required: false,
      allowFuture: false,
      fieldLabel: 'A data de nascimento',
    });
    const birthErr = !birthCheck.valid;
    const senhaErr = senha.length < 8;
    const confirmarErr = !confirmarSenha || senha !== confirmarSenha;

    if (nomeErr || emailErr || celularErr || birthErr || senhaErr || confirmarErr) {
      setFieldErrors({
        nome: nomeErr,
        email: emailErr,
        celular: celularErr,
        data_nascimento: birthErr,
        senha: senhaErr,
        confirmarSenha: confirmarErr,
      });
      if (nomeErr) {
        setErrorMessage('Informe seu nome completo.');
      } else if (emailErr) {
        setErrorMessage('Informe um e-mail válido.');
      } else if (celularErr) {
        setErrorMessage(INVALID_CELLPHONE_MESSAGE);
      } else if (birthErr) {
        setErrorMessage(
          birthCheck.error || 'Data de nascimento inválida (use dd-mm-aaaa).'
        );
      } else if (senhaErr) {
        setErrorMessage('A senha deve ter pelo menos 8 caracteres.');
      } else {
        setErrorMessage('As senhas digitadas não conferem.');
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
        } else if (senhaErr) {
          senhaInputRef.current?.focus();
        } else if (confirmarErr) {
          confirmarSenhaInputRef.current?.focus();
        }
        scrollRef.current?.scrollTo({ y: 0, animated: true });
      }, 40);
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
      const msg =
        error instanceof ApiError
          ? error.message
          : 'Não foi possível criar sua conta. Tente novamente.';
      setErrorMessage(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <LinearGradient colors={['#F0F9F7', '#E3F3EF']} style={styles.gradient}>
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
            {/* Ícone SVG de Pata de Cachorro (Tema Verde-Água) */}
            <View style={styles.logoCircle}>
              <Svg width={34} height={34} viewBox="0 0 64 64" fill="none">
                <Path
                  d="M32 33C24.5 33 19 38.8 19 45.2C19 49.4 22.4 52 26.5 52C28.8 52 30.5 51.1 32 51.1C33.5 51.1 35.2 52 37.5 52C41.6 52 45 49.4 45 45.2C45 38.8 39.5 33 32 33Z"
                  stroke="#FFFFFF"
                  strokeWidth={4}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <Ellipse
                  cx="15.5"
                  cy="29.5"
                  rx="4.5"
                  ry="6"
                  transform="rotate(-22 15.5 29.5)"
                  stroke="#FFFFFF"
                  strokeWidth={3.8}
                />
                <Ellipse
                  cx="25.5"
                  cy="21"
                  rx="4.5"
                  ry="6.2"
                  transform="rotate(-8 25.5 21)"
                  stroke="#FFFFFF"
                  strokeWidth={3.8}
                />
                <Ellipse
                  cx="38.5"
                  cy="21"
                  rx="4.5"
                  ry="6.2"
                  transform="rotate(8 38.5 21)"
                  stroke="#FFFFFF"
                  strokeWidth={3.8}
                />
                <Ellipse
                  cx="48.5"
                  cy="29.5"
                  rx="4.5"
                  ry="6"
                  transform="rotate(22 48.5 29.5)"
                  stroke="#FFFFFF"
                  strokeWidth={3.8}
                />
              </Svg>
            </View>

            <Text style={styles.title}>Criar conta</Text>
            <Text style={styles.subtitle}>
              Junte-se à comunidade de amantes de animais.
            </Text>

            {errorMessage ? (
              <View style={styles.errorBanner}>
                <Text style={styles.errorText}>{errorMessage}</Text>
              </View>
            ) : null}

            <View style={styles.form}>
              {/* Nome Completo */}
              <View style={styles.formGroup}>
                <Text style={styles.label}>
                  Nome completo <Text style={styles.requiredStar}>*</Text>
                </Text>
                <TextInput
                  ref={nomeInputRef}
                  value={nome}
                  onChangeText={(txt) => {
                    setNome(txt);
                    if (fieldErrors.nome) setFieldErrors((p) => ({ ...p, nome: false }));
                  }}
                  onFocus={() => setFocusedField('nome')}
                  onBlur={() => setFocusedField(null)}
                  placeholder="Seu nome"
                  placeholderTextColor="#7D9994"
                  autoComplete="name"
                  editable={!busy}
                  style={[
                    styles.input,
                    focusedField === 'nome' && styles.inputFocused,
                    fieldErrors.nome && styles.inputError,
                  ]}
                />
              </View>

              {/* Email */}
              <View style={styles.formGroup}>
                <Text style={styles.label}>
                  Email <Text style={styles.requiredStar}>*</Text>
                </Text>
                <TextInput
                  ref={emailInputRef}
                  value={email}
                  onChangeText={(txt) => {
                    setEmail(txt);
                    if (fieldErrors.email) setFieldErrors((p) => ({ ...p, email: false }));
                  }}
                  onFocus={() => setFocusedField('email')}
                  onBlur={() => setFocusedField(null)}
                  placeholder="seu@email.com"
                  placeholderTextColor="#7D9994"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="email"
                  editable={!busy}
                  style={[
                    styles.input,
                    focusedField === 'email' && styles.inputFocused,
                    fieldErrors.email && styles.inputError,
                  ]}
                />
              </View>

              {/* Celular */}
              <View style={styles.formGroup}>
                <Text style={styles.label}>Celular</Text>
                <TextInput
                  ref={celularInputRef}
                  value={celular}
                  onChangeText={(txt) => {
                    setCelular(formatPhoneMask(txt));
                    if (fieldErrors.celular) {
                      setFieldErrors((p) => ({ ...p, celular: false }));
                    }
                  }}
                  onFocus={() => setFocusedField('celular')}
                  onBlur={() => setFocusedField(null)}
                  placeholder="(11) 99999-9999"
                  placeholderTextColor="#7D9994"
                  keyboardType="phone-pad"
                  maxLength={15}
                  editable={!busy}
                  style={[
                    styles.input,
                    focusedField === 'celular' && styles.inputFocused,
                    fieldErrors.celular && styles.inputError,
                  ]}
                />
              </View>

              {/* Data de Nascimento */}
              <View style={styles.formGroup}>
                <Text style={styles.label}>Data de nascimento</Text>
                <TextInput
                  ref={nascimentoInputRef}
                  value={dataNascimento}
                  onChangeText={(txt) => {
                    setDataNascimento(formatDateInputDDMMYYYY(txt));
                    if (fieldErrors.data_nascimento) {
                      setFieldErrors((p) => ({ ...p, data_nascimento: false }));
                    }
                  }}
                  onFocus={() => setFocusedField('data_nascimento')}
                  onBlur={() => setFocusedField(null)}
                  placeholder="dd-mm-aaaa"
                  placeholderTextColor="#7D9994"
                  keyboardType="number-pad"
                  maxLength={10}
                  editable={!busy}
                  style={[
                    styles.input,
                    focusedField === 'data_nascimento' && styles.inputFocused,
                    fieldErrors.data_nascimento && styles.inputError,
                  ]}
                />
              </View>

              {/* Gênero */}
              <View style={styles.formGroup}>
                <Text style={styles.label}>Gênero</Text>
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={() => setGenderModalVisible(true)}
                  disabled={busy}
                  style={styles.selectInput}
                  accessibilityRole="button"
                  accessibilityLabel="Selecionar gênero"
                >
                  <Text
                    style={[
                      styles.selectText,
                      !genero && styles.selectPlaceholder,
                    ]}
                  >
                    {selectedGeneroLabel}
                  </Text>
                  <Svg
                    width={18}
                    height={18}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#168572"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <Polyline points="6 9 12 15 18 9" />
                  </Svg>
                </TouchableOpacity>
              </View>

              {/* Senha */}
              <View style={styles.formGroup}>
                <Text style={styles.label}>
                  Senha <Text style={styles.requiredStar}>*</Text>
                </Text>
                <View style={styles.passwordInputWrapper}>
                  <TextInput
                    ref={senhaInputRef}
                    value={senha}
                    onChangeText={(txt) => {
                      setSenha(txt);
                      if (fieldErrors.senha) setFieldErrors((p) => ({ ...p, senha: false }));
                    }}
                    onFocus={() => setFocusedField('senha')}
                    onBlur={() => setFocusedField(null)}
                    placeholder="••••••••"
                    placeholderTextColor="#7D9994"
                    secureTextEntry={!showSenha}
                    autoCapitalize="none"
                    editable={!busy}
                    style={[
                      styles.input,
                      styles.passwordInput,
                      focusedField === 'senha' && styles.inputFocused,
                      fieldErrors.senha && styles.inputError,
                    ]}
                  />
                  <TouchableOpacity
                    activeOpacity={0.7}
                    onPress={() => setShowSenha((prev) => !prev)}
                    disabled={busy}
                    style={styles.eyeButton}
                    accessibilityRole="button"
                    accessibilityLabel={showSenha ? 'Ocultar senha' : 'Ver senha'}
                  >
                    {showSenha ? (
                      <Svg width={19} height={19} viewBox="0 0 24 24" fill="none" stroke="#055C4D" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                        <Path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                        <Path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                        <Path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
                        <Line x1={1} y1={1} x2={23} y2={23} />
                      </Svg>
                    ) : (
                      <Svg width={19} height={19} viewBox="0 0 24 24" fill="none" stroke="#055C4D" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                        <Path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                        <Circle cx={12} cy={12} r={3} />
                      </Svg>
                    )}
                  </TouchableOpacity>
                </View>
              </View>

              {/* Confirmar Senha */}
              <View style={styles.formGroup}>
                <Text style={styles.label}>
                  Confirmar Senha <Text style={styles.requiredStar}>*</Text>
                </Text>
                <View style={styles.passwordInputWrapper}>
                  <TextInput
                    ref={confirmarSenhaInputRef}
                    value={confirmarSenha}
                    onChangeText={(txt) => {
                      setConfirmarSenha(txt);
                      if (fieldErrors.confirmarSenha) {
                        setFieldErrors((p) => ({ ...p, confirmarSenha: false }));
                      }
                    }}
                    onFocus={() => setFocusedField('confirmarSenha')}
                    onBlur={() => setFocusedField(null)}
                    placeholder="••••••••"
                    placeholderTextColor="#7D9994"
                    secureTextEntry={!showConfirmarSenha}
                    autoCapitalize="none"
                    editable={!busy}
                    style={[
                      styles.input,
                      styles.passwordInput,
                      focusedField === 'confirmarSenha' && styles.inputFocused,
                      fieldErrors.confirmarSenha && styles.inputError,
                    ]}
                  />
                  <TouchableOpacity
                    activeOpacity={0.7}
                    onPress={() => setShowConfirmarSenha((prev) => !prev)}
                    disabled={busy}
                    style={styles.eyeButton}
                    accessibilityRole="button"
                    accessibilityLabel={
                      showConfirmarSenha
                        ? 'Ocultar confirmação de senha'
                        : 'Ver confirmação de senha'
                    }
                  >
                    {showConfirmarSenha ? (
                      <Svg width={19} height={19} viewBox="0 0 24 24" fill="none" stroke="#055C4D" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                        <Path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                        <Path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                        <Path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
                        <Line x1={1} y1={1} x2={23} y2={23} />
                      </Svg>
                    ) : (
                      <Svg width={19} height={19} viewBox="0 0 24 24" fill="none" stroke="#055C4D" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                        <Path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                        <Circle cx={12} cy={12} r={3} />
                      </Svg>
                    )}
                  </TouchableOpacity>
                </View>
              </View>

              {/* Foto de Perfil */}
              <View style={styles.formGroup}>
                <Text style={styles.label}>Foto de perfil</Text>
                <View style={styles.photoRow}>
                  {foto ? (
                    <TouchableOpacity
                      activeOpacity={0.85}
                      onPress={() =>
                        openPhotoViewer(foto, nome.trim() || 'Foto de perfil')
                      }
                      accessibilityRole="button"
                      accessibilityLabel="Ver foto de perfil em tela cheia"
                    >
                      <Image
                        source={{ uri: foto }}
                        style={styles.photoThumb}
                        resizeMode="cover"
                      />
                    </TouchableOpacity>
                  ) : null}
                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={handlePickPhoto}
                    disabled={busy}
                    style={[styles.fileUploadBtn, styles.fileUploadBtnFlex]}
                    accessibilityRole="button"
                    accessibilityLabel="Adicionar foto (câmera ou galeria)"
                  >
                    <Svg
                      width={20}
                      height={20}
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="#089C83"
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <Rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                      <Circle cx="8.5" cy="8.5" r="1.5" />
                      <Polyline points="21 15 16 10 5 21" />
                    </Svg>
                    <Text style={styles.fileUploadBtnText}>
                      Adicionar foto (câmera ou galeria)
                    </Text>
                  </TouchableOpacity>
                </View>
                <Text style={styles.fileNameDisplay} numberOfLines={1}>
                  {fileName}
                </Text>
              </View>

              <Text style={styles.requiredLegend}>
                <Text style={styles.requiredStar}>*</Text> Campos obrigatórios
              </Text>

              <TouchableOpacity
                activeOpacity={0.85}
                disabled={busy}
                onPress={handleSubmit}
                style={[styles.submitButton, busy && styles.buttonDisabled]}
                accessibilityRole="button"
                accessibilityLabel="Criar conta"
              >
                {busy ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.submitButtonText}>Criar conta</Text>
                )}
              </TouchableOpacity>
            </View>

            <View style={styles.loginPrompt}>
              <Text style={styles.loginText}>Já possui uma conta? </Text>
              <TouchableOpacity
                activeOpacity={0.75}
                onPress={onNavigateToLogin}
                disabled={busy}
                accessibilityRole="button"
              >
                <Text style={styles.loginLink}>Acessar</Text>
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
              <Text style={styles.modalTitle}>Selecione o gênero</Text>
              <TouchableOpacity
                onPress={() => setGenderModalVisible(false)}
                accessibilityRole="button"
                accessibilityLabel="Fechar"
              >
                <Text style={styles.modalClose}>×</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.optionList}>
              {GENERO_OPTIONS.map((option) => {
                const selected = genero === option.value;
                return (
                  <TouchableOpacity
                    key={option.value}
                    activeOpacity={0.8}
                    onPress={() => {
                      setGenero(option.value);
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
                      {option.label}
                    </Text>
                    {selected ? (
                      <Text style={styles.optionCheck}>✓</Text>
                    ) : null}
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </View>
      </Modal>

      <PhotoSourceModal
        visible={photoModalVisible}
        title="Foto de Perfil"
        theme="teal"
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
    flexGrow: 1,
    alignItems: 'center',
    paddingVertical: 32,
    paddingHorizontal: 20,
  },
  container: {
    width: '100%',
    maxWidth: 390,
    alignItems: 'center',
  },
  logoCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#089C83',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 18,
    shadowColor: '#089C83',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 6,
  },
  title: {
    fontSize: 24,
    fontFamily: 'PlusJakartaSans_700Bold',
    color: '#0D5C4E',
    textAlign: 'center',
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 14,
    fontFamily: 'PlusJakartaSans_400Regular',
    color: '#168572',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 20,
  },
  errorBanner: {
    width: '100%',
    backgroundColor: '#FFF5F5',
    borderWidth: 1,
    borderColor: '#F8CACA',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 14,
  },
  errorText: {
    fontSize: 13,
    fontFamily: 'PlusJakartaSans_600SemiBold',
    color: '#E63946',
    textAlign: 'center',
  },
  form: {
    width: '100%',
  },
  formGroup: {
    marginBottom: 14,
  },
  label: {
    fontSize: 14,
    fontFamily: 'PlusJakartaSans_600SemiBold',
    color: '#168572',
    marginBottom: 5,
  },
  requiredStar: {
    color: '#E63946',
  },
  input: {
    width: '100%',
    height: 44,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#C6E5DF',
    borderRadius: 10,
    paddingHorizontal: 14,
    fontFamily: 'PlusJakartaSans_400Regular',
    fontSize: 15,
    color: '#09453A',
  },
  inputFocused: {
    borderColor: '#089C83',
  },
  inputError: {
    borderColor: '#E63946',
    borderWidth: 2.5,
  },
  passwordInputWrapper: {
    position: 'relative',
    justifyContent: 'center',
  },
  passwordInput: {
    paddingRight: 44,
  },
  eyeButton: {
    position: 'absolute',
    right: 5,
    width: 34,
    height: 34,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  selectInput: {
    width: '100%',
    height: 44,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#C6E5DF',
    borderRadius: 10,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  selectText: {
    fontFamily: 'PlusJakartaSans_400Regular',
    fontSize: 15,
    color: '#09453A',
  },
  selectPlaceholder: {
    color: '#7D9994',
  },
  fileUploadBtn: {
    width: '100%',
    height: 44,
    backgroundColor: '#F0F9F7',
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: '#089C83',
    borderRadius: 10,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  fileUploadBtnText: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 15,
    color: '#089C83',
  },
  fileNameDisplay: {
    fontSize: 12,
    fontFamily: 'PlusJakartaSans_400Regular',
    color: '#168572',
    marginTop: 4,
    textAlign: 'center',
  },
  requiredLegend: {
    fontSize: 12,
    fontFamily: 'PlusJakartaSans_500Medium',
    color: '#168572',
    textAlign: 'center',
    marginTop: 12,
    marginBottom: 8,
  },
  submitButton: {
    width: '100%',
    height: 48,
    backgroundColor: '#089C83',
    borderRadius: 999,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#089C83',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 4,
  },
  submitButtonText: {
    fontSize: 16,
    fontFamily: 'PlusJakartaSans_600SemiBold',
    color: '#FFFFFF',
  },
  buttonDisabled: {
    opacity: 0.65,
  },
  loginPrompt: {
    marginTop: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loginText: {
    fontSize: 14,
    fontFamily: 'PlusJakartaSans_400Regular',
    color: '#168572',
  },
  loginLink: {
    fontSize: 14,
    fontFamily: 'PlusJakartaSans_700Bold',
    color: '#0D5C4E',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(9, 69, 58, 0.45)',
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
    borderColor: '#C6E5DF',
    padding: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#E3F3EF',
    marginBottom: 12,
  },
  modalTitle: {
    fontSize: 16,
    fontFamily: 'PlusJakartaSans_700Bold',
    color: '#0D5C4E',
  },
  modalClose: {
    fontSize: 24,
    color: '#168572',
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
    borderColor: '#C6E5DF',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  optionItemSelected: {
    backgroundColor: '#F0F9F7',
    borderColor: '#089C83',
  },
  optionText: {
    fontSize: 14,
    fontFamily: 'PlusJakartaSans_600SemiBold',
    color: '#09453A',
  },
  optionTextSelected: {
    color: '#089C83',
  },
  photoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  photoThumb: {
    width: 46,
    height: 46,
    borderRadius: 23,
    borderWidth: 2,
    borderColor: '#089C83',
    backgroundColor: '#F0F9F7',
  },
  fileUploadBtnFlex: {
    flex: 1,
    width: undefined,
  },
  optionCheck: {
    fontSize: 14,
    fontFamily: 'PlusJakartaSans_700Bold',
    color: '#089C83',
  },
});

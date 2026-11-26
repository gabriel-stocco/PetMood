import React, { ComponentRef, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';
import Svg, { Circle, Ellipse, Line, Path } from 'react-native-svg';
import { CustomScrollView } from '../components/CustomScrollView';
import { useApp } from '../context/AppContext';
import { ApiError, USE_MOCK_BACKEND } from '../services/api';

WebBrowser.maybeCompleteAuthSession();

interface LoginScreenProps {
  onNavigateToRegister: () => void;
}

const GOOGLE_WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || '';
const GOOGLE_IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || '';
const GOOGLE_ANDROID_CLIENT_ID =
  process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID || '';

const hasConfiguredGoogleClient = Boolean(
  GOOGLE_WEB_CLIENT_ID || GOOGLE_IOS_CLIENT_ID || GOOGLE_ANDROID_CLIENT_ID
);

const GoogleOAuthButton: React.FC<{
  disabled: boolean;
  onSuccessToken: (idToken: string) => Promise<void>;
  onErrorMessage: (msg: string) => void;
}> = ({ disabled, onSuccessToken, onErrorMessage }) => {
  const [request, response, promptAsync] = Google.useIdTokenAuthRequest({
    clientId: GOOGLE_WEB_CLIENT_ID || undefined,
    iosClientId: GOOGLE_IOS_CLIENT_ID || undefined,
    androidClientId: GOOGLE_ANDROID_CLIENT_ID || undefined,
  });

  useEffect(() => {
    if (response?.type === 'success') {
      const idToken =
        response.params?.id_token || response.authentication?.idToken;
      if (idToken) {
        onSuccessToken(idToken).catch((err: any) => {
          onErrorMessage(
            err instanceof ApiError
              ? err.message
              : 'Não foi possível autenticar com o Google.'
          );
        });
      } else {
        onErrorMessage('Token do Google não retornado.');
      }
    } else if (response?.type === 'error') {
      onErrorMessage('Falha na autenticação com o Google.');
    }
  }, [onErrorMessage, onSuccessToken, response]);

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      disabled={disabled || !request}
      onPress={() => promptAsync()}
      style={[
        styles.googleButton,
        (disabled || !request) && styles.buttonDisabled,
      ]}
      accessibilityRole="button"
      accessibilityLabel="Entrar com o Google"
    >
      <GoogleIcon />
      <Text style={styles.googleButtonText}>Entrar com o Google</Text>
    </TouchableOpacity>
  );
};

const GoogleIcon: React.FC = () => (
  <Svg width={20} height={20} viewBox="0 0 24 24">
    <Path
      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      fill="#4285F4"
    />
    <Path
      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      fill="#34A853"
    />
    <Path
      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      fill="#FBBC05"
    />
    <Path
      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      fill="#EA4335"
    />
  </Svg>
);

export const LoginScreen: React.FC<LoginScreenProps> = ({
  onNavigateToRegister,
}) => {
  const { signIn, signInWithGoogle, isLoading } = useApp();

  const [email, setEmail] = useState<string>('');
  const [senha, setSenha] = useState<string>('');
  const [showSenha, setShowSenha] = useState<boolean>(false);
  const [focusedField, setFocusedField] = useState<'email' | 'senha' | null>(
    null
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ email?: boolean; senha?: boolean }>({});
  const [submitting, setSubmitting] = useState<boolean>(false);

  const scrollRef = useRef<ComponentRef<typeof ScrollView> | null>(null);
  const emailInputRef = useRef<ComponentRef<typeof TextInput> | null>(null);
  const senhaInputRef = useRef<ComponentRef<typeof TextInput> | null>(null);

  const busy = isLoading || submitting;

  const handleLogin = async () => {
    setErrorMessage(null);
    const normalizedEmail = email.trim().toLowerCase();

    const emailErr = !normalizedEmail;
    const senhaErr = !senha;

    if (emailErr || senhaErr) {
      setFieldErrors({ email: emailErr, senha: senhaErr });
      setErrorMessage('Informe seu e-mail e senha para entrar.');
      scrollRef.current?.scrollTo({ y: 0, animated: true });
      setTimeout(() => {
        if (emailErr) {
          emailInputRef.current?.focus();
        } else if (senhaErr) {
          senhaInputRef.current?.focus();
        }
        scrollRef.current?.scrollTo({ y: 0, animated: true });
      }, 40);
      return;
    }

    setFieldErrors({});

    setSubmitting(true);
    try {
      await signIn(normalizedEmail, senha);
    } catch (error) {
      const msg =
        error instanceof ApiError
          ? error.message
          : 'Não foi possível realizar login. Tente novamente.';
      setErrorMessage(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleMockGoogleLogin = async () => {
    setErrorMessage(null);
    if (!USE_MOCK_BACKEND && !hasConfiguredGoogleClient) {
      Alert.alert(
        'Google OAuth não configurado',
        'Configure EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID no ambiente para autenticar com o Google.'
      );
      return;
    }

    setSubmitting(true);
    try {
      await signInWithGoogle('mock-google-id-token');
    } catch (error) {
      const msg =
        error instanceof ApiError
          ? error.message
          : 'Erro ao entrar com o Google.';
      setErrorMessage(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleForgotPassword = () => {
    Alert.alert(
      'Recuperação de senha',
      'Caso tenha criado sua conta via Google, utilize o botão "Entrar com o Google". Para redefinir senha tradicional, entre em contato com o suporte PetMood.'
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
            {/* Ícone SVG de Pata de Cachorro */}
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

            <Text style={styles.title}>Bem Vindo ao PetMood</Text>
            <Text style={styles.subtitle}>
              Acesse para cuidar dos seus pequenos amados
            </Text>

            {errorMessage ? (
              <View style={styles.errorBanner}>
                <Text style={styles.errorText}>{errorMessage}</Text>
              </View>
            ) : null}

            <View style={styles.form}>
              <View style={styles.formGroup}>
                <Text style={styles.label}>Email</Text>
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
                  placeholderTextColor="#9E8A78"
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
                  accessibilityLabel="Email"
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>Senha</Text>
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
                    placeholderTextColor="#9E8A78"
                    secureTextEntry={!showSenha}
                    autoCapitalize="none"
                    autoComplete="password"
                    editable={!busy}
                    style={[
                      styles.input,
                      styles.passwordInput,
                      focusedField === 'senha' && styles.inputFocused,
                      fieldErrors.senha && styles.inputError,
                    ]}
                    accessibilityLabel="Senha"
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
                      <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="#8A4505" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                        <Path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                        <Path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                        <Path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
                        <Line x1={1} y1={1} x2={23} y2={23} />
                      </Svg>
                    ) : (
                      <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="#8A4505" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                        <Path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                        <Circle cx={12} cy={12} r={3} />
                      </Svg>
                    )}
                  </TouchableOpacity>
                </View>
              </View>

              <TouchableOpacity
                activeOpacity={0.7}
                onPress={handleForgotPassword}
                style={styles.forgotButton}
                accessibilityRole="button"
              >
                <Text style={styles.forgotText}>Esqueceu a senha?</Text>
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={0.85}
                disabled={busy}
                onPress={handleLogin}
                style={[styles.submitButton, busy && styles.buttonDisabled]}
                accessibilityRole="button"
                accessibilityLabel="Entrar"
              >
                {busy ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.submitButtonText}>Entrar</Text>
                )}
              </TouchableOpacity>
            </View>

            {/* Divisor "ou" */}
            <View style={styles.dividerRow}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>ou</Text>
              <View style={styles.dividerLine} />
            </View>

            {/* Botão Google */}
            {hasConfiguredGoogleClient ? (
              <GoogleOAuthButton
                disabled={busy}
                onSuccessToken={signInWithGoogle}
                onErrorMessage={setErrorMessage}
              />
            ) : (
              <TouchableOpacity
                activeOpacity={0.85}
                disabled={busy}
                onPress={handleMockGoogleLogin}
                style={[styles.googleButton, busy && styles.buttonDisabled]}
                accessibilityRole="button"
                accessibilityLabel="Entrar com o Google"
              >
                <GoogleIcon />
                <Text style={styles.googleButtonText}>Entrar com o Google</Text>
              </TouchableOpacity>
            )}

            <View style={styles.signupPrompt}>
              <Text style={styles.signupText}>Ainda não tem uma conta? </Text>
              <TouchableOpacity
                activeOpacity={0.75}
                onPress={onNavigateToRegister}
                disabled={busy}
                accessibilityRole="button"
              >
                <Text style={styles.signupLink}>Crie sua conta</Text>
              </TouchableOpacity>
            </View>
          </View>
        </CustomScrollView>
      </KeyboardAvoidingView>
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
    justifyContent: 'center',
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
    backgroundColor: '#D96B08',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    shadowColor: '#D96B08',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 6,
  },
  title: {
    fontSize: 24,
    fontFamily: 'PlusJakartaSans_700Bold',
    color: '#8A4505',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    fontFamily: 'PlusJakartaSans_400Regular',
    color: '#B8651B',
    textAlign: 'center',
    marginBottom: 28,
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
    marginBottom: 16,
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
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontFamily: 'PlusJakartaSans_600SemiBold',
    color: '#B8651B',
    marginBottom: 6,
  },
  input: {
    width: '100%',
    height: 46,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#EBD7C3',
    borderRadius: 10,
    paddingHorizontal: 14,
    fontFamily: 'PlusJakartaSans_400Regular',
    fontSize: 15,
    color: '#5A2E04',
  },
  inputFocused: {
    borderColor: '#D96B08',
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
    paddingRight: 46,
  },
  eyeButton: {
    position: 'absolute',
    right: 6,
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  forgotButton: {
    alignSelf: 'flex-end',
    marginTop: 2,
    marginBottom: 24,
  },
  forgotText: {
    fontSize: 13,
    fontFamily: 'PlusJakartaSans_500Medium',
    color: '#C76814',
  },
  submitButton: {
    width: '100%',
    height: 48,
    backgroundColor: '#D96B08',
    borderRadius: 999,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#D96B08',
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
  dividerRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 20,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#E5CCB5',
  },
  dividerText: {
    paddingHorizontal: 12,
    fontSize: 13,
    fontFamily: 'PlusJakartaSans_500Medium',
    color: '#B8651B',
  },
  googleButton: {
    width: '100%',
    height: 48,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#EBD7C3',
    borderRadius: 999,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
    shadowColor: '#5A2E04',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  googleButtonText: {
    fontSize: 15,
    fontFamily: 'PlusJakartaSans_600SemiBold',
    color: '#5A2E04',
  },
  signupPrompt: {
    marginTop: 28,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'wrap',
  },
  signupText: {
    fontSize: 14,
    fontFamily: 'PlusJakartaSans_400Regular',
    color: '#C76814',
  },
  signupLink: {
    fontSize: 14,
    fontFamily: 'PlusJakartaSans_700Bold',
    color: '#9C4E08',
  },
});

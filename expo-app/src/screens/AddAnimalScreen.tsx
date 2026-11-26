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
import Svg, { Circle, Polyline, Rect } from 'react-native-svg';
import { CustomScrollView } from '../components/CustomScrollView';
import { PhotoSourceModal } from '../components/PhotoSourceModal';
import { useApp } from '../context/AppContext';
import { ApiError } from '../services/api';
import { GeneroAnimal } from '../types';
import { formatDateInputDDMMYYYY, validateDateInput } from '../utils/date';

const SPECIES_OPTIONS = [
  'Cachorro',
  'Gato',
  'Roedor',
  'Ave',
  'Réptil',
  'Anfíbio',
  'Peixe',
] as const;

const GENDER_OPTIONS: { value: Exclude<GeneroAnimal, ''>; label: string }[] = [
  { value: 'Macho', label: 'Macho' },
  { value: 'Fêmea', label: 'Fêmea' },
];

export const AddAnimalScreen: React.FC = () => {
  const { addAnimal, setActiveTab, openPhotoViewer } = useApp();

  const [nome, setNome] = useState<string>('');
  const [dataNascimento, setDataNascimento] = useState<string>('');
  const [especie, setEspecie] = useState<string>('');
  const [raca, setRaca] = useState<string>('');
  const [genero, setGenero] = useState<GeneroAnimal>('');
  const [racao, setRacao] = useState<string>('');
  const [observacao, setObservacao] = useState<string>('');
  const [foto, setFoto] = useState<string>('');
  const [fileName, setFileName] = useState<string>('Nenhum arquivo selecionado');

  const [speciesModalVisible, setSpeciesModalVisible] = useState<boolean>(false);
  const [genderModalVisible, setGenderModalVisible] = useState<boolean>(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{
    nome?: boolean;
    data_nascimento?: boolean;
    especie?: boolean;
    raca?: boolean;
  }>({});
  const [submitting, setSubmitting] = useState<boolean>(false);

  const scrollRef = useRef<ComponentRef<typeof ScrollView> | null>(null);
  const nomeInputRef = useRef<ComponentRef<typeof TextInput> | null>(null);
  const nascimentoInputRef = useRef<ComponentRef<typeof TextInput> | null>(null);
  const racaInputRef = useRef<ComponentRef<typeof TextInput> | null>(null);

  const resetForm = () => {
    setNome('');
    setDataNascimento('');
    setEspecie('');
    setRaca('');
    setGenero('');
    setRacao('');
    setObservacao('');
    setFoto('');
    setFileName('Nenhum arquivo selecionado');
    setErrorMessage(null);
    setFieldErrors({});
  };

  const [photoModalVisible, setPhotoModalVisible] = useState<boolean>(false);

  const handlePickPhoto = () => {
    setErrorMessage(null);
    setPhotoModalVisible(true);
  };

  const handleSelectPhoto = (dataUri: string, pickedName: string) => {
    setFoto(dataUri);
    setFileName(pickedName || 'foto-pet.jpg');
    setErrorMessage(null);
  };

  const handleCancel = () => {
    resetForm();
    setActiveTab('Home');
  };

  const handleCreate = async () => {
    setErrorMessage(null);
    const trimmedNome = nome.trim();
    const trimmedEspecie = especie.trim();
    const trimmedRaca = raca.trim();
    const trimmedBirth = dataNascimento.trim();

    const nomeErr = !trimmedNome;
    const dateCheck = validateDateInput(trimmedBirth, {
      required: false,
      allowFuture: false,
      fieldLabel: 'A data de nascimento do animal',
    });
    const nascimentoErr = !dateCheck.valid;
    const especieErr = !trimmedEspecie;
    const racaErr = !trimmedRaca;

    if (nomeErr || nascimentoErr || especieErr || racaErr) {
      setFieldErrors({
        nome: nomeErr,
        data_nascimento: nascimentoErr,
        especie: especieErr,
        raca: racaErr,
      });
      if (nomeErr || especieErr || racaErr) {
        setErrorMessage('Preencha os campos obrigatórios: Nome do pet, Espécie e Raça.');
      } else {
        setErrorMessage(
          dateCheck.error || 'Data de nascimento deve estar no formato dd-mm-aaaa.'
        );
      }

      scrollRef.current?.scrollTo({ y: 0, animated: true });
      setTimeout(() => {
        if (nomeErr) {
          nomeInputRef.current?.focus();
        } else if (nascimentoErr) {
          nascimentoInputRef.current?.focus();
        } else if (especieErr) {
          setSpeciesModalVisible(true);
        } else if (racaErr) {
          racaInputRef.current?.focus();
        }
        scrollRef.current?.scrollTo({ y: 0, animated: true });
      }, 40);
      return;
    }

    setFieldErrors({});

    setSubmitting(true);
    try {
      await addAnimal({
        nome: trimmedNome,
        data_nascimento: dateCheck.iso,
        especie: trimmedEspecie,
        raca: trimmedRaca,
        genero,
        racao: racao.trim(),
        observacao: observacao.trim(),
        foto,
      });
      resetForm();
      setActiveTab('Home');
    } catch (error) {
      const msg =
        error instanceof ApiError
          ? error.message
          : 'Não foi possível cadastrar o animal.';
      setErrorMessage(msg);
    } finally {
      setSubmitting(false);
    }
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
            <View style={styles.formHeader}>
              <Text style={styles.formTitle}>Cadastre um novo animal</Text>
              <Text style={styles.formSubtitle}>
                Preencha as informações do seu pet
              </Text>
            </View>

            {errorMessage ? (
              <View style={styles.errorBanner}>
                <Text style={styles.errorText}>{errorMessage}</Text>
              </View>
            ) : null}

            <View style={styles.form}>
              {/* Nome do pet (Obrigatório) */}
              <View style={styles.formGroup}>
                <Text style={styles.label}>
                  Nome do pet <Text style={styles.requiredStar}>*</Text>
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
                  placeholder="Ex: Thor"
                  placeholderTextColor="#9E8A78"
                  editable={!submitting}
                  style={[
                    styles.input,
                    focusedField === 'nome' && styles.inputFocused,
                    fieldErrors.nome && styles.inputError,
                  ]}
                />
              </View>

              {/* Data de Nascimento (Opcional) */}
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
                  placeholderTextColor="#9E8A78"
                  keyboardType="number-pad"
                  maxLength={10}
                  editable={!submitting}
                  style={[
                    styles.input,
                    focusedField === 'data_nascimento' && styles.inputFocused,
                    fieldErrors.data_nascimento && styles.inputError,
                  ]}
                />
              </View>

              {/* Espécie (Obrigatório) */}
              <View style={styles.formGroup}>
                <Text style={styles.label}>
                  Espécie <Text style={styles.requiredStar}>*</Text>
                </Text>
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={() => setSpeciesModalVisible(true)}
                  disabled={submitting}
                  style={[
                    styles.selectInput,
                    fieldErrors.especie && styles.inputError,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel="Selecionar espécie do pet"
                >
                  <Text
                    style={[
                      styles.selectText,
                      !especie && styles.selectPlaceholder,
                    ]}
                  >
                    {especie || 'Selecione a espécie'}
                  </Text>
                  <Svg
                    width={18}
                    height={18}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#B8651B"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <Polyline points="6 9 12 15 18 9" />
                  </Svg>
                </TouchableOpacity>
              </View>

              {/* Raça (Obrigatório) */}
              <View style={styles.formGroup}>
                <Text style={styles.label}>
                  Raça <Text style={styles.requiredStar}>*</Text>
                </Text>
                <TextInput
                  ref={racaInputRef}
                  value={raca}
                  onChangeText={(txt) => {
                    setRaca(txt);
                    if (fieldErrors.raca) setFieldErrors((p) => ({ ...p, raca: false }));
                  }}
                  onFocus={() => setFocusedField('raca')}
                  onBlur={() => setFocusedField(null)}
                  placeholder="Ex: Golden Retriever / SRD"
                  placeholderTextColor="#9E8A78"
                  editable={!submitting}
                  style={[
                    styles.input,
                    focusedField === 'raca' && styles.inputFocused,
                    fieldErrors.raca && styles.inputError,
                  ]}
                />
              </View>

              {/* Gênero (Opcional) */}
              <View style={styles.formGroup}>
                <Text style={styles.label}>Gênero</Text>
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={() => setGenderModalVisible(true)}
                  disabled={submitting}
                  style={styles.selectInput}
                  accessibilityRole="button"
                  accessibilityLabel="Selecionar gênero do pet"
                >
                  <Text
                    style={[
                      styles.selectText,
                      !genero && styles.selectPlaceholder,
                    ]}
                  >
                    {genero || 'Selecione o gênero'}
                  </Text>
                  <Svg
                    width={18}
                    height={18}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#B8651B"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <Polyline points="6 9 12 15 18 9" />
                  </Svg>
                </TouchableOpacity>
              </View>

              {/* Ração Habitual (Opcional) */}
              <View style={styles.formGroup}>
                <Text style={styles.label}>Ração habitual</Text>
                <TextInput
                  value={racao}
                  onChangeText={setRacao}
                  onFocus={() => setFocusedField('racao')}
                  onBlur={() => setFocusedField(null)}
                  placeholder="Ex: Ração Premium Adultos 15kg"
                  placeholderTextColor="#9E8A78"
                  editable={!submitting}
                  style={[
                    styles.input,
                    focusedField === 'racao' && styles.inputFocused,
                  ]}
                />
              </View>

              {/* Observações (Opcional) */}
              <View style={styles.formGroup}>
                <Text style={styles.label}>Observações</Text>
                <TextInput
                  value={observacao}
                  onChangeText={setObservacao}
                  onFocus={() => setFocusedField('observacao')}
                  onBlur={() => setFocusedField(null)}
                  placeholder="Alergias, comportamentos ou cuidados especiais..."
                  placeholderTextColor="#9E8A78"
                  multiline
                  numberOfLines={4}
                  textAlignVertical="top"
                  editable={!submitting}
                  style={[
                    styles.input,
                    styles.textarea,
                    focusedField === 'observacao' && styles.inputFocused,
                  ]}
                />
              </View>

              {/* Foto do pet (Opcional) */}
              <View style={styles.formGroup}>
                <Text style={styles.label}>Foto do pet</Text>
                <View style={styles.photoRow}>
                  {foto ? (
                    <TouchableOpacity
                      activeOpacity={0.85}
                      onPress={() =>
                        openPhotoViewer(foto, nome.trim() || 'Foto do animal')
                      }
                      accessibilityRole="button"
                      accessibilityLabel="Ver foto do animal em tela cheia"
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
                    disabled={submitting}
                    style={[styles.fileUploadBtn, styles.fileUploadBtnFlex]}
                    accessibilityRole="button"
                    accessibilityLabel="Adicionar foto (câmera ou galeria)"
                  >
                    <Svg
                      width={20}
                      height={20}
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="#D96B08"
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

              {/* Botões Cancelar e Criar Lado a Lado */}
              <View style={styles.formActions}>
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={handleCancel}
                  disabled={submitting}
                  style={[styles.btn, styles.btnCancel]}
                  accessibilityRole="button"
                >
                  <Text style={styles.btnCancelText}>Cancelar</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={handleCreate}
                  disabled={submitting}
                  style={[
                    styles.btn,
                    styles.btnSubmit,
                    submitting && styles.buttonDisabled,
                  ]}
                  accessibilityRole="button"
                >
                  {submitting ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <Text style={styles.btnSubmitText}>Criar</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </CustomScrollView>
      </KeyboardAvoidingView>

      {/* Modal Seletor de Espécie */}
      <Modal
        visible={speciesModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setSpeciesModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setSpeciesModalVisible(false)}
            accessibilityLabel="Fechar pop-up"
          />
          <View style={styles.modalBox}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Selecione a espécie</Text>
              <TouchableOpacity onPress={() => setSpeciesModalVisible(false)}>
                <Text style={styles.modalClose}>×</Text>
              </TouchableOpacity>
            </View>

            <CustomScrollView shrink style={{ maxHeight: 300 }}>
              <View style={styles.optionList}>
                {SPECIES_OPTIONS.map((sp) => {
                  const selected = especie === sp;
                  return (
                    <TouchableOpacity
                      key={sp}
                      activeOpacity={0.8}
                      onPress={() => {
                        setEspecie(sp);
                        if (fieldErrors.especie) {
                          setFieldErrors((p) => ({ ...p, especie: false }));
                        }
                        setSpeciesModalVisible(false);
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
                        {sp}
                      </Text>
                      {selected ? (
                        <Text style={styles.optionCheck}>✓</Text>
                      ) : null}
                    </TouchableOpacity>
                  );
                })}
              </View>
            </CustomScrollView>
          </View>
        </View>
      </Modal>

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
              <TouchableOpacity onPress={() => setGenderModalVisible(false)}>
                <Text style={styles.modalClose}>×</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.optionList}>
              {GENDER_OPTIONS.map((opt) => {
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
        title="Foto do Animal"
        theme="orange"
        aspect={[1, 1]}
        defaultFileName="foto-pet.jpg"
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
    paddingTop: 20,
    paddingBottom: 40,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  container: {
    width: '100%',
    maxWidth: 390,
  },
  formHeader: {
    alignItems: 'center',
    marginBottom: 24,
  },
  formTitle: {
    fontSize: 22,
    fontFamily: 'PlusJakartaSans_700Bold',
    color: '#8A4505',
    marginBottom: 6,
    textAlign: 'center',
  },
  formSubtitle: {
    fontSize: 14,
    fontFamily: 'PlusJakartaSans_400Regular',
    color: '#B8651B',
    textAlign: 'center',
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
    gap: 16,
  },
  formGroup: {
    gap: 6,
  },
  label: {
    fontSize: 14,
    fontFamily: 'PlusJakartaSans_600SemiBold',
    color: '#B8651B',
  },
  requiredStar: {
    color: '#E63946',
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
  textarea: {
    height: 90,
    paddingVertical: 12,
  },
  inputFocused: {
    borderColor: '#D96B08',
  },
  inputError: {
    borderColor: '#E63946',
    borderWidth: 2.5,
  },
  selectInput: {
    width: '100%',
    height: 46,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#EBD7C3',
    borderRadius: 10,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  selectText: {
    fontFamily: 'PlusJakartaSans_400Regular',
    fontSize: 15,
    color: '#5A2E04',
  },
  selectPlaceholder: {
    color: '#9E8A78',
  },
  fileUploadBtn: {
    width: '100%',
    height: 46,
    backgroundColor: '#FFF8F1',
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: '#D96B08',
    borderRadius: 10,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  fileUploadBtnText: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 15,
    color: '#D96B08',
  },
  fileNameDisplay: {
    fontSize: 12,
    fontFamily: 'PlusJakartaSans_400Regular',
    color: '#B8651B',
    marginTop: 2,
    textAlign: 'center',
  },
  requiredLegend: {
    fontSize: 13,
    fontFamily: 'PlusJakartaSans_500Medium',
    color: '#B8651B',
    textAlign: 'center',
    marginTop: 2,
  },
  formActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 4,
  },
  btn: {
    flex: 1,
    height: 48,
    borderRadius: 999,
    justifyContent: 'center',
    alignItems: 'center',
  },
  btnCancel: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#EBD7C3',
    shadowColor: '#5A2E04',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  btnCancelText: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 15,
    color: '#8A4505',
  },
  btnSubmit: {
    backgroundColor: '#D96B08',
    shadowColor: '#D96B08',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 4,
  },
  btnSubmitText: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 15,
    color: '#FFFFFF',
  },
  buttonDisabled: {
    opacity: 0.65,
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
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F0DFCE',
    marginBottom: 12,
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
    borderColor: '#D96B08',
    backgroundColor: '#FFF3E6',
  },
  fileUploadBtnFlex: {
    flex: 1,
    width: undefined,
  },
  optionCheck: {
    fontSize: 14,
    fontFamily: 'PlusJakartaSans_700Bold',
    color: '#D96B08',
  },
});

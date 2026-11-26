import React, { ComponentRef, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Keyboard,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path, Polygon } from 'react-native-svg';
import { CustomScrollView } from '../components/CustomScrollView';
import { KeyboardAwareModalOverlay } from '../components/KeyboardAwareModalOverlay';
import { PhotoSourceModal } from '../components/PhotoSourceModal';
import { useApp } from '../context/AppContext';
import { ApiError } from '../services/api';
import { Vacina } from '../types';
import {
  formatDateDisplay,
  formatDateInputDDMMYYYY,
  toDisplayDate,
  validateDateInput,
} from '../utils/date';

interface FlattenedVaccine extends Vacina {
  animalNome: string;
  animalEspecie: string;
  animalFoto: string;
}

function formatDateBR(isoDate?: string): string {
  return formatDateDisplay(isoDate);
}

export const VaccinesScreen: React.FC = () => {
  const {
    animais,
    vaccineFilterAnimalId,
    clearVaccineAnimalFilter,
    addVaccine,
    editVaccine,
    removeVaccine,
    openPhotoViewer,
  } = useApp();

  const [selectedSpecies, setSelectedSpecies] = useState<string[]>([]);
  const [selectedAnimals, setSelectedAnimals] = useState<string[]>(
    vaccineFilterAnimalId ? [vaccineFilterAnimalId] : []
  );
  const [sortBy, setSortBy] = useState<'data' | 'nome'>('data');

  useEffect(() => {
    if (vaccineFilterAnimalId) {
      setSelectedAnimals([vaccineFilterAnimalId]);
      setSelectedSpecies([]);
      clearVaccineAnimalFilter();
    }
  }, [clearVaccineAnimalFilter, vaccineFilterAnimalId]);

  const [filterModalVisible, setFilterModalVisible] = useState<boolean>(false);
  const [sortModalVisible, setSortModalVisible] = useState<boolean>(false);
  const [detailModalVisible, setDetailModalVisible] = useState<boolean>(false);
  const [formModalVisible, setFormModalVisible] = useState<boolean>(false);
  const [saveConfirmVisible, setSaveConfirmVisible] = useState<boolean>(false);
  const [deleteConfirmVisible, setDeleteConfirmVisible] =
    useState<boolean>(false);
  const [animalPickerVisible, setAnimalPickerVisible] =
    useState<boolean>(false);

  const [selectedVacRef, setSelectedVacRef] = useState<{
    animalId: string;
    vacId: string;
  } | null>(null);

  // Estado do formulário
  const [vacId, setVacId] = useState<string>('');
  const [vacAnimalId, setVacAnimalId] = useState<string>('');
  const [vacNome, setVacNome] = useState<string>('');
  const [vacData, setVacData] = useState<string>('');
  const [vacObs, setVacObs] = useState<string>('');
  const [vacFoto, setVacFoto] = useState<string>('');
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{
    animal?: boolean;
    nome?: boolean;
    data?: boolean;
    foto?: boolean;
  }>({});
  const [saving, setSaving] = useState<boolean>(false);

  const formScrollRef = useRef<ComponentRef<typeof ScrollView> | null>(null);
  const vacNomeInputRef = useRef<ComponentRef<typeof TextInput> | null>(null);
  const vacDataInputRef = useRef<ComponentRef<typeof TextInput> | null>(null);

  const uniqueSpecies = useMemo(
    () => Array.from(new Set(animais.map((a) => a.especie).filter(Boolean))),
    [animais]
  );

  const flattenedVaccines = useMemo<FlattenedVaccine[]>(() => {
    const list: FlattenedVaccine[] = [];
    animais.forEach((animal) => {
      (animal.vacinas || []).forEach((vac) => {
        list.push({
          ...vac,
          animalNome: animal.nome,
          animalEspecie: animal.especie,
          animalFoto: animal.foto,
        });
      });
    });

    const filtered = list.filter((item) => {
      const matchSpecies =
        selectedSpecies.length === 0 ||
        selectedSpecies.includes(item.animalEspecie);
      const matchAnimal =
        selectedAnimals.length === 0 ||
        selectedAnimals.includes(item.id_animal);
      return matchSpecies && matchAnimal;
    });

    if (sortBy === 'data') {
      filtered.sort((a, b) =>
        b.data_aplicacao.localeCompare(a.data_aplicacao)
      );
    } else {
      filtered.sort((a, b) =>
        a.nome_vacina.localeCompare(b.nome_vacina, 'pt-BR')
      );
    }

    return filtered;
  }, [animais, selectedAnimals, selectedSpecies, sortBy]);

  const activeDetailItem = useMemo(() => {
    if (!selectedVacRef) return null;
    const animal = animais.find(
      (a) => a.id_animal === selectedVacRef.animalId
    );
    const vac = animal?.vacinas.find(
      (v) => v.id_vacina === selectedVacRef.vacId
    );
    if (!animal || !vac) return null;
    return { animal, vac };
  }, [animais, selectedVacRef]);

  const totalFilters = selectedSpecies.length + selectedAnimals.length;

  const toggleSpecies = (sp: string) => {
    setSelectedSpecies((prev) =>
      prev.includes(sp) ? prev.filter((item) => item !== sp) : [...prev, sp]
    );
  };

  const toggleAnimalFilter = (id: string) => {
    setSelectedAnimals((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const openVaccineDetail = (animalId: string, vacIdTarget: string) => {
    setSelectedVacRef({ animalId, vacId: vacIdTarget });
    setDetailModalVisible(true);
  };

  const openVaccineForm = (isEdit = false) => {
    if (animais.length === 0) {
      Alert.alert(
        'Cadastre um animal primeiro',
        'É necessário ter pelo menos um animal cadastrado para registrar vacinas.'
      );
      return;
    }

    if (isEdit && activeDetailItem) {
      setVacId(activeDetailItem.vac.id_vacina);
      setVacAnimalId(activeDetailItem.animal.id_animal);
      setVacNome(activeDetailItem.vac.nome_vacina);
      setVacData(toDisplayDate(activeDetailItem.vac.data_aplicacao));
      setVacObs(activeDetailItem.vac.observacao || '');
      setVacFoto(activeDetailItem.vac.foto_carteira || '');
    } else {
      setSelectedVacRef(null);
      setVacId('');
      setVacAnimalId(animais[0].id_animal);
      setVacNome('');
      setVacData('');
      setVacObs('');
      setVacFoto('');
    }
    setFormError(null);
    setFieldErrors({});
    setFormModalVisible(true);
  };

  const [photoModalVisible, setPhotoModalVisible] = useState<boolean>(false);

  const handlePickProofImage = () => {
    Keyboard.dismiss();
    setPhotoModalVisible(true);
  };

  const handleSelectProofImage = (dataUri: string) => {
    setVacFoto(dataUri);
    setFieldErrors((p) => ({ ...p, foto: false }));
    setFormError(null);
  };

  const executeSaveVaccine = async () => {
    const trimmedNome = vacNome.trim();
    const dateCheck = validateDateInput(vacData, {
      required: true,
      allowFuture: false,
      fieldLabel: 'A data da aplicação',
    });
    if (!dateCheck.valid) {
      setFieldErrors((p) => ({ ...p, data: true }));
      setFormError(
        dateCheck.error || 'Informe uma data válida no formato dd-mm-aaaa.'
      );
      return;
    }

    setSaving(true);
    try {
      if (vacId && selectedVacRef) {
        await editVaccine({
          id_vacina: vacId,
          id_animal: vacAnimalId,
          nome_vacina: trimmedNome,
          data_aplicacao: dateCheck.iso,
          observacao: vacObs.trim(),
          foto_carteira: vacFoto,
        });
      } else {
        await addVaccine({
          id_animal: vacAnimalId,
          nome_vacina: trimmedNome,
          data_aplicacao: dateCheck.iso,
          observacao: vacObs.trim(),
          foto_carteira: vacFoto,
        });
      }
      Keyboard.dismiss();
      setSaveConfirmVisible(false);
      setFormModalVisible(false);
    } catch (error) {
      setSaveConfirmVisible(false);
      Alert.alert(
        'Erro ao salvar vacina',
        error instanceof ApiError
          ? error.message
          : 'Não foi possível salvar o registro da vacina.'
      );
    } finally {
      setSaving(false);
    }
  };

  const handleSaveVaccine = async () => {
    setFormError(null);
    const trimmedNome = vacNome.trim();
    const trimmedData = vacData.trim();
    const dateCheck = validateDateInput(trimmedData, {
      required: true,
      allowFuture: false,
      fieldLabel: 'A data da aplicação',
    });

    const animalErr = !vacAnimalId.trim();
    const nomeErr = !trimmedNome;
    const dataErr = !dateCheck.valid;
    const fotoErr = !vacFoto.trim();

    if (animalErr || nomeErr || dataErr || fotoErr) {
      setFieldErrors({
        animal: animalErr,
        nome: nomeErr,
        data: dataErr,
        foto: fotoErr,
      });
      if (!animalErr && !nomeErr && !fotoErr && trimmedData && dataErr) {
        setFormError(
          dateCheck.error || 'Informe uma data válida no formato dd-mm-aaaa.'
        );
      } else {
        setFormError('Nome da vacina, Data da aplicação e Foto da carteira são obrigatórios.');
      }

      formScrollRef.current?.scrollTo({ y: 0, animated: true });
      setTimeout(() => {
        if (animalErr) {
          setAnimalPickerVisible(true);
        } else if (nomeErr) {
          vacNomeInputRef.current?.focus();
        } else if (dataErr) {
          vacDataInputRef.current?.focus();
        } else if (fotoErr) {
          void handlePickProofImage();
        }
        formScrollRef.current?.scrollTo({ y: 0, animated: true });
      }, 40);
      return;
    }

    setFieldErrors({});
    Keyboard.dismiss();

    if (vacId && selectedVacRef) {
      setSaveConfirmVisible(true);
      return;
    }

    await executeSaveVaccine();
  };

  const handleConfirmDelete = async () => {
    if (!selectedVacRef) return;
    setSaving(true);
    try {
      await removeVaccine(selectedVacRef.vacId, selectedVacRef.animalId);
      setDeleteConfirmVisible(false);
      setDetailModalVisible(false);
      setSelectedVacRef(null);
    } catch (error) {
      Alert.alert(
        'Erro ao excluir',
        error instanceof ApiError
          ? error.message
          : 'Não foi possível excluir a vacina.'
      );
    } finally {
      setSaving(false);
    }
  };

  const selectedFormAnimal = animais.find((a) => a.id_animal === vacAnimalId);

  return (
    <LinearGradient colors={['#FDF8F2', '#F7EDE4']} style={styles.gradient}>
      <View style={styles.screenRoot}>
        <CustomScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.container}>
            <View style={styles.pageHeader}>
              <Text style={styles.pageTitle}>Carteira de Vacinação</Text>
              <Text style={styles.pageSubtitle}>
                Acompanhe e cadastre os comprovantes de vacinas dos seus pets
              </Text>
            </View>

            {/* Controles do Topo: Filtro e Ordenar */}
            <View style={styles.topControls}>
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => setFilterModalVisible(true)}
                style={[
                  styles.controlBtn,
                  totalFilters > 0 && styles.controlBtnActive,
                ]}
                accessibilityRole="button"
                accessibilityLabel="Filtrar vacinas"
              >
                <Svg
                  width={18}
                  height={18}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke={totalFilters > 0 ? '#FFFFFF' : '#8A4505'}
                  strokeWidth={2}
                >
                  <Polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
                </Svg>
                {totalFilters > 0 ? (
                  <View style={styles.filterBadge}>
                    <Text style={styles.filterBadgeText}>{totalFilters}</Text>
                  </View>
                ) : null}
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => setSortModalVisible(true)}
                style={[styles.controlBtn, styles.controlBtnActive]}
                accessibilityRole="button"
                accessibilityLabel="Ordenar vacinas"
              >
                <Svg
                  width={18}
                  height={18}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#FFFFFF"
                  strokeWidth={2}
                >
                  <Path d="M11 5h10M11 9h7M11 13h4M3 17l3 3 3-3M6 18V4" />
                </Svg>
                <Text style={styles.controlBtnTextActive}>
                  {sortBy === 'data' ? 'Data' : 'Nome'}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Lista de Vacinas */}
            {flattenedVaccines.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyStateText}>
                  Nenhuma vacina encontrada para os filtros selecionados.
                </Text>
              </View>
            ) : (
              <View style={styles.vaccineList}>
                {flattenedVaccines.map((item) => (
                  <TouchableOpacity
                    key={item.id_vacina}
                    activeOpacity={0.85}
                    onPress={() =>
                      openVaccineDetail(item.id_animal, item.id_vacina)
                    }
                    style={styles.vaccineCard}
                  >
                    {item.animalFoto ? (
                      <TouchableOpacity
                        activeOpacity={0.85}
                        onPress={() => openPhotoViewer(item.animalFoto, item.animalNome)}
                        accessibilityRole="button"
                        accessibilityLabel={`Ver foto de ${item.animalNome}`}
                      >
                        <Image
                          source={{ uri: item.animalFoto }}
                          style={styles.petAvatar}
                          resizeMode="cover"
                        />
                      </TouchableOpacity>
                    ) : (
                      <View
                        style={[styles.petAvatar, styles.petAvatarPlaceholder]}
                      >
                        <Text style={styles.petAvatarInitial}>
                          {item.animalNome.charAt(0).toUpperCase()}
                        </Text>
                      </View>
                    )}

                    <View style={styles.vaccineInfo}>
                      <Text style={styles.petTag}>
                        {item.animalNome} • {item.animalEspecie}
                      </Text>
                      <Text style={styles.vaccineName} numberOfLines={1}>
                        {item.nome_vacina}
                      </Text>
                      <Text style={styles.vaccineDate}>
                        Aplicada em {formatDateBR(item.data_aplicacao)}
                      </Text>
                    </View>

                    <Text style={styles.chevron}>&gt;</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        </CustomScrollView>

        {/* Botão Flutuante (+) */}
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => openVaccineForm(false)}
          style={styles.fabAdd}
          accessibilityRole="button"
          accessibilityLabel="Nova vacina"
        >
          <Svg
            width={24}
            height={24}
            viewBox="0 0 24 24"
            fill="none"
            stroke="#FFFFFF"
            strokeWidth={2.6}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <Path d="M12 5v14M5 12h14" />
          </Svg>
        </TouchableOpacity>
      </View>

      {/* Modal 1: Filtrar Vacinas */}
      <Modal
        visible={filterModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setFilterModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setFilterModalVisible(false)}
            accessibilityLabel="Fechar pop-up"
          />
          <View style={styles.modalBox}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Filtrar Vacinas</Text>
              <TouchableOpacity onPress={() => setFilterModalVisible(false)}>
                <Text style={styles.modalClose}>×</Text>
              </TouchableOpacity>
            </View>

            <CustomScrollView shrink style={styles.modalScroll}>
              <View style={styles.filterGroup}>
                <Text style={styles.formLabel}>Por Espécie</Text>
                <View style={styles.optionList}>
                  {uniqueSpecies.map((sp) => {
                    const selected = selectedSpecies.includes(sp);
                    return (
                      <TouchableOpacity
                        key={sp}
                        activeOpacity={0.8}
                        onPress={() => toggleSpecies(sp)}
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
                        <Text style={styles.optionCheck}>
                          {selected ? '✓' : ''}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              <View style={styles.filterGroup}>
                <Text style={styles.formLabel}>Por Animal</Text>
                <View style={styles.optionList}>
                  {animais.map((a) => {
                    const selected = selectedAnimals.includes(a.id_animal);
                    return (
                      <TouchableOpacity
                        key={a.id_animal}
                        activeOpacity={0.8}
                        onPress={() => toggleAnimalFilter(a.id_animal)}
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
                          {a.nome}
                        </Text>
                        <Text style={styles.optionCheck}>
                          {selected ? '✓' : ''}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            </CustomScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => {
                  setSelectedSpecies([]);
                  setSelectedAnimals([]);
                }}
                style={[styles.footerBtn, styles.btnSecondary]}
              >
                <Text style={styles.btnSecondaryText}>Limpar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => setFilterModalVisible(false)}
                style={[styles.footerBtn, styles.btnPrimary]}
              >
                <Text style={styles.btnWhiteText}>Concluir</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal 2: Ordenar por */}
      <Modal
        visible={sortModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setSortModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setSortModalVisible(false)}
            accessibilityLabel="Fechar pop-up"
          />
          <View style={styles.modalBox}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Ordenar por:</Text>
              <TouchableOpacity onPress={() => setSortModalVisible(false)}>
                <Text style={styles.modalClose}>×</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.optionList}>
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => {
                  setSortBy('nome');
                  setSortModalVisible(false);
                }}
                style={[
                  styles.optionItem,
                  sortBy === 'nome' && styles.optionItemSelected,
                ]}
              >
                <Text
                  style={[
                    styles.optionText,
                    sortBy === 'nome' && styles.optionTextSelected,
                  ]}
                >
                  Nome • A-Z
                </Text>
                <Text style={styles.optionCheck}>
                  {sortBy === 'nome' ? '✓' : ''}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => {
                  setSortBy('data');
                  setSortModalVisible(false);
                }}
                style={[
                  styles.optionItem,
                  sortBy === 'data' && styles.optionItemSelected,
                ]}
              >
                <Text
                  style={[
                    styles.optionText,
                    sortBy === 'data' && styles.optionTextSelected,
                  ]}
                >
                  Data • Mais Novo-Mais antigo
                </Text>
                <Text style={styles.optionCheck}>
                  {sortBy === 'data' ? '✓' : ''}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal 3: Nova / Editar Vacina */}
      <Modal
        visible={formModalVisible}
        transparent
        statusBarTranslucent
        animationType="fade"
        onRequestClose={() => {
          Keyboard.dismiss();
          setFormModalVisible(false);
        }}
      >
        <KeyboardAwareModalOverlay
          cardStyle={[styles.modalBox, styles.keyboardModalBox]}
          onBackdropPress={() => {
            if (!saving) {
              setFormModalVisible(false);
            }
          }}
        >
          <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {vacId ? 'Editar Vacina' : 'Nova Vacina'}
              </Text>
              <TouchableOpacity
                onPress={() => {
                  Keyboard.dismiss();
                  setFormModalVisible(false);
                }}
              >
                <Text style={styles.modalClose}>×</Text>
              </TouchableOpacity>
            </View>

            {formError ? (
              <View style={styles.errorBanner}>
                <Text style={styles.errorBannerText}>{formError}</Text>
              </View>
            ) : null}

            <CustomScrollView
              ref={formScrollRef}
              shrink
              style={styles.modalScroll}
              keyboardShouldPersistTaps="handled"
            >
              <View style={styles.formStack}>
                <View style={styles.formGroup}>
                  <Text style={styles.formLabel}>Animal *</Text>
                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={() => {
                      Keyboard.dismiss();
                      setAnimalPickerVisible(true);
                    }}
                    style={[
                      styles.selectBox,
                      fieldErrors.animal && styles.inputError,
                    ]}
                  >
                    <Text style={styles.selectValueText}>
                      {selectedFormAnimal
                        ? `${selectedFormAnimal.nome} (${selectedFormAnimal.especie})`
                        : 'Selecione o animal'}
                    </Text>
                    <Text style={styles.selectChevron}>▾</Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.formGroup}>
                  <Text style={styles.formLabel}>Nome da vacina *</Text>
                  <TextInput
                    ref={vacNomeInputRef}
                    value={vacNome}
                    onChangeText={(txt) => {
                      setVacNome(txt);
                      if (fieldErrors.nome) setFieldErrors((p) => ({ ...p, nome: false }));
                      setFormError(null);
                    }}
                    placeholder="Ex: V10 (Polivalente)"
                    placeholderTextColor="#9E8A78"
                    style={[
                      styles.formInput,
                      fieldErrors.nome && styles.inputError,
                    ]}
                  />
                </View>

                <View style={styles.formGroup}>
                  <Text style={styles.formLabel}>Data da aplicação *</Text>
                  <TextInput
                    ref={vacDataInputRef}
                    value={vacData}
                    onChangeText={(txt) => {
                      setVacData(formatDateInputDDMMYYYY(txt));
                      if (fieldErrors.data) setFieldErrors((p) => ({ ...p, data: false }));
                      setFormError(null);
                    }}
                    placeholder="dd-mm-aaaa"
                    placeholderTextColor="#9E8A78"
                    keyboardType="number-pad"
                    maxLength={10}
                    style={[
                      styles.formInput,
                      fieldErrors.data && styles.inputError,
                    ]}
                  />
                </View>

                <View style={styles.formGroup}>
                  <Text style={styles.formLabel}>Observação</Text>
                  <TextInput
                    value={vacObs}
                    onChangeText={setVacObs}
                    placeholder="Lote, clínica, reações ou anotações..."
                    placeholderTextColor="#9E8A78"
                    multiline
                    numberOfLines={4}
                    textAlignVertical="top"
                    style={[styles.formInput, styles.formTextarea]}
                  />
                </View>

                <View style={styles.formGroup}>
                  <Text style={styles.formLabel}>
                    Foto da carteira / comprovante *
                  </Text>
                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={handlePickProofImage}
                    style={[
                      styles.proofUploadBtn,
                      fieldErrors.foto && styles.proofUploadBtnError,
                    ]}
                  >
                    <Text style={styles.proofUploadBtnText}>
                      {vacFoto
                        ? 'Alterar foto (câmera ou galeria)'
                        : 'Adicionar foto (câmera ou galeria)'}
                    </Text>
                  </TouchableOpacity>
                  {vacFoto ? (
                    <TouchableOpacity
                      activeOpacity={0.9}
                      onPress={() =>
                        openPhotoViewer(vacFoto, vacNome.trim() || 'Carteira de vacinação')
                      }
                      accessibilityRole="button"
                      accessibilityLabel="Ver foto da carteira em tela cheia"
                    >
                      <Image
                        source={{ uri: vacFoto }}
                        style={styles.proofPreviewImg}
                        resizeMode="cover"
                      />
                      <Text style={styles.zoomHint}>
                        Toque na imagem para ampliar
                      </Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              </View>
            </CustomScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                activeOpacity={0.85}
                disabled={saving}
                onPress={() => {
                  Keyboard.dismiss();
                  setFormModalVisible(false);
                }}
                style={[styles.footerBtn, styles.btnSecondary]}
              >
                <Text style={styles.btnSecondaryText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                activeOpacity={0.85}
                disabled={saving}
                onPress={handleSaveVaccine}
                style={[styles.footerBtn, styles.btnPrimary]}
              >
                {saving ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.btnWhiteText}>Salvar</Text>
                )}
              </TouchableOpacity>
            </View>
        </KeyboardAwareModalOverlay>
      </Modal>

      {/* Submodal Picker de Animal no Formulário */}
      <Modal
        visible={animalPickerVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setAnimalPickerVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setAnimalPickerVisible(false)}
            accessibilityLabel="Fechar pop-up"
          />
          <View style={[styles.modalBox, styles.smallModalBox]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Selecionar Animal</Text>
              <TouchableOpacity onPress={() => setAnimalPickerVisible(false)}>
                <Text style={styles.modalClose}>×</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.optionList}>
              {animais.map((pet) => {
                const selected = vacAnimalId === pet.id_animal;
                return (
                  <TouchableOpacity
                    key={pet.id_animal}
                    activeOpacity={0.8}
                    onPress={() => {
                      setVacAnimalId(pet.id_animal);
                      if (fieldErrors.animal) {
                        setFieldErrors((p) => ({ ...p, animal: false }));
                      }
                      setFormError(null);
                      setAnimalPickerVisible(false);
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
                      {pet.nome} ({pet.especie})
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

      {/* Modal 4: Detalhes da Vacina */}
      <Modal
        visible={detailModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setDetailModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setDetailModalVisible(false)}
            accessibilityLabel="Fechar pop-up"
          />
          <View style={styles.modalBox}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Detalhes da Vacina</Text>
              <TouchableOpacity onPress={() => setDetailModalVisible(false)}>
                <Text style={styles.modalClose}>×</Text>
              </TouchableOpacity>
            </View>

            {activeDetailItem ? (
              <CustomScrollView shrink style={styles.modalScroll}>
                <View style={styles.detailStack}>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Animal</Text>
                    <Text style={styles.detailValue}>
                      {activeDetailItem.animal.nome} (
                      {activeDetailItem.animal.especie})
                    </Text>
                  </View>

                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Nome da Vacina</Text>
                    <Text style={styles.detailValue}>
                      {activeDetailItem.vac.nome_vacina}
                    </Text>
                  </View>

                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Data da Aplicação</Text>
                    <Text style={styles.detailValue}>
                      {formatDateBR(activeDetailItem.vac.data_aplicacao)}
                    </Text>
                  </View>

                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Observação</Text>
                    <Text style={styles.detailValue}>
                      {activeDetailItem.vac.observacao ||
                        'Nenhuma observação registrada.'}
                    </Text>
                  </View>

                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>
                      Foto da Carteira / Comprovante
                    </Text>
                    {activeDetailItem.vac.foto_carteira ? (
                      <TouchableOpacity
                        activeOpacity={0.9}
                        onPress={() =>
                          openPhotoViewer(
                            activeDetailItem.vac.foto_carteira,
                            activeDetailItem.vac.nome_vacina || 'Carteira de vacinação'
                          )
                        }
                        accessibilityRole="button"
                        accessibilityLabel="Ampliar foto da carteira de vacinação"
                      >
                        <Image
                          source={{ uri: activeDetailItem.vac.foto_carteira }}
                          style={styles.proofPreviewImg}
                          resizeMode="cover"
                        />
                        <Text style={styles.zoomHint}>
                          Toque na imagem para ampliar
                        </Text>
                      </TouchableOpacity>
                    ) : (
                      <Text style={styles.detailValue}>
                        Sem comprovante anexado.
                      </Text>
                    )}
                  </View>
                </View>
              </CustomScrollView>
            ) : null}

            <View style={styles.modalFooter}>
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => setDeleteConfirmVisible(true)}
                style={[styles.footerBtn, styles.btnDanger]}
              >
                <Text style={styles.btnWhiteText}>Excluir</Text>
              </TouchableOpacity>
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => {
                  setDetailModalVisible(false);
                  openVaccineForm(true);
                }}
                style={[styles.footerBtn, styles.btnPrimary]}
              >
                <Text style={styles.btnWhiteText}>Editar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Confirmação Salvar Alterações */}
      <Modal
        visible={saveConfirmVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setSaveConfirmVisible(false)}
      >
        <View style={[styles.modalOverlay, styles.confirmOverlay]}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => {
              if (!saving) setSaveConfirmVisible(false);
            }}
            accessibilityLabel="Fechar pop-up"
          />
          <View style={[styles.modalBox, styles.smallModalBox]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Salvar Alterações</Text>
              <TouchableOpacity onPress={() => setSaveConfirmVisible(false)}>
                <Text style={styles.modalClose}>×</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.confirmMessage}>
              Tem certeza que deseja salvar as modificações feitas nesta vacina?
            </Text>
            <View style={styles.modalFooter}>
              <TouchableOpacity
                activeOpacity={0.85}
                disabled={saving}
                onPress={() => setSaveConfirmVisible(false)}
                style={[styles.footerBtn, styles.btnSecondary]}
              >
                <Text style={styles.btnSecondaryText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                activeOpacity={0.85}
                disabled={saving}
                onPress={executeSaveVaccine}
                style={[styles.footerBtn, styles.btnPrimary]}
              >
                {saving ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.btnWhiteText}>Sim, salvar</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal 5: Confirmação de Exclusão */}
      <Modal
        visible={deleteConfirmVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setDeleteConfirmVisible(false)}
      >
        <View style={[styles.modalOverlay, styles.confirmOverlay]}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => {
              if (!saving) setDeleteConfirmVisible(false);
            }}
            accessibilityLabel="Fechar pop-up"
          />
          <View style={[styles.modalBox, styles.smallModalBox]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Confirmar Exclusão</Text>
              <TouchableOpacity onPress={() => setDeleteConfirmVisible(false)}>
                <Text style={styles.modalClose}>×</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.confirmMessage}>
              Tem certeza que deseja excluir permanentemente este registro de
              vacina?
            </Text>
            <View style={styles.modalFooter}>
              <TouchableOpacity
                activeOpacity={0.85}
                disabled={saving}
                onPress={() => setDeleteConfirmVisible(false)}
                style={[styles.footerBtn, styles.btnSecondary]}
              >
                <Text style={styles.btnSecondaryText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                activeOpacity={0.85}
                disabled={saving}
                onPress={handleConfirmDelete}
                style={[styles.footerBtn, styles.btnDanger]}
              >
                {saving ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.btnWhiteText}>Sim, excluir</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <PhotoSourceModal
        visible={photoModalVisible}
        title="Foto da Carteira / Comprovante"
        theme="orange"
        defaultFileName="carteira-vacina.jpg"
        onClose={() => setPhotoModalVisible(false)}
        onSelectPhoto={handleSelectProofImage}
      />
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  gradient: {
    flex: 1,
  },
  screenRoot: {
    flex: 1,
    position: 'relative',
  },
  scrollContent: {
    paddingTop: 24,
    paddingBottom: 90,
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
    marginBottom: 6,
    textAlign: 'center',
  },
  pageSubtitle: {
    fontSize: 14,
    fontFamily: 'PlusJakartaSans_400Regular',
    color: '#B8651B',
    textAlign: 'center',
    lineHeight: 20,
  },
  topControls: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  controlBtn: {
    height: 44,
    minWidth: 44,
    paddingHorizontal: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#EBD7C3',
    borderRadius: 12,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    position: 'relative',
    shadowColor: '#8A4505',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  controlBtnActive: {
    backgroundColor: '#D96B08',
    borderColor: '#D96B08',
  },
  controlBtnTextActive: {
    fontSize: 13,
    fontFamily: 'PlusJakartaSans_700Bold',
    color: '#FFFFFF',
  },
  filterBadge: {
    position: 'absolute',
    top: -6,
    right: -6,
    backgroundColor: '#6E3906',
    minWidth: 18,
    height: 18,
    paddingHorizontal: 5,
    borderRadius: 999,
    justifyContent: 'center',
    alignItems: 'center',
  },
  filterBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontFamily: 'PlusJakartaSans_700Bold',
  },
  vaccineList: {
    gap: 12,
  },
  vaccineCard: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#EBD7C3',
    borderRadius: 16,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    shadowColor: '#8A4505',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  petAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    borderWidth: 2,
    borderColor: '#D96B08',
    backgroundColor: '#FFF3E6',
  },
  petAvatarPlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  petAvatarInitial: {
    fontSize: 18,
    fontFamily: 'PlusJakartaSans_700Bold',
    color: '#D96B08',
  },
  vaccineInfo: {
    flex: 1,
    gap: 3,
  },
  petTag: {
    fontSize: 12,
    fontFamily: 'PlusJakartaSans_700Bold',
    color: '#D96B08',
  },
  vaccineName: {
    fontSize: 15,
    fontFamily: 'PlusJakartaSans_700Bold',
    color: '#6E3906',
  },
  vaccineDate: {
    fontSize: 13,
    fontFamily: 'PlusJakartaSans_500Medium',
    color: '#8A4505',
  },
  chevron: {
    fontSize: 16,
    fontFamily: 'PlusJakartaSans_700Bold',
    color: '#D96B08',
  },
  emptyState: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: '#EBD7C3',
    borderRadius: 16,
    paddingVertical: 28,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  emptyStateText: {
    fontSize: 14,
    fontFamily: 'PlusJakartaSans_500Medium',
    color: '#B8651B',
    textAlign: 'center',
  },
  fabAdd: {
    position: 'absolute',
    bottom: 20,
    right: 20,
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: '#D96B08',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#D96B08',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 6,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(40, 20, 2, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  confirmOverlay: {
    backgroundColor: 'rgba(40, 20, 2, 0.6)',
  },
  modalBox: {
    width: '100%',
    maxWidth: 360,
    maxHeight: '90%',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#F0DFCE',
    padding: 20,
    gap: 14,
  },
  keyboardModalBox: {
    maxHeight: '100%',
    flexShrink: 1,
  },
  smallModalBox: {
    maxWidth: 340,
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
    fontSize: 17,
    fontFamily: 'PlusJakartaSans_700Bold',
    color: '#8A4505',
  },
  modalClose: {
    fontSize: 24,
    color: '#B8651B',
    lineHeight: 26,
  },
  modalScroll: {
    flexGrow: 0,
    flexShrink: 1,
  },
  filterGroup: {
    gap: 6,
    marginBottom: 12,
  },
  formStack: {
    gap: 12,
    paddingBottom: 14,
  },
  formGroup: {
    gap: 6,
  },
  formLabel: {
    fontSize: 13,
    fontFamily: 'PlusJakartaSans_600SemiBold',
    color: '#8A4505',
  },
  formInput: {
    width: '100%',
    minHeight: 42,
    backgroundColor: '#FFFDFB',
    borderWidth: 1.5,
    borderColor: '#EBD7C3',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontFamily: 'PlusJakartaSans_400Regular',
    fontSize: 14,
    color: '#6E3906',
  },
  formTextarea: {
    minHeight: 100,
  },
  selectBox: {
    minHeight: 42,
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
    fontSize: 13.5,
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
  inputError: {
    borderColor: '#E63946',
    borderWidth: 2.5,
  },
  errorBanner: {
    backgroundColor: '#FFF5F5',
    borderWidth: 1,
    borderColor: '#F8CACA',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  errorBannerText: {
    fontSize: 12.5,
    fontFamily: 'PlusJakartaSans_600SemiBold',
    color: '#C92A2A',
    textAlign: 'center',
  },
  proofUploadBtn: {
    width: '100%',
    minHeight: 44,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: '#D96B08',
    borderRadius: 12,
    backgroundColor: '#FFF8F1',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 10,
  },
  proofUploadBtnError: {
    borderColor: '#E63946',
    borderWidth: 2.5,
    backgroundColor: '#FFF5F5',
  },
  proofUploadBtnText: {
    fontSize: 13,
    fontFamily: 'PlusJakartaSans_700Bold',
    color: '#8A4505',
  },
  proofPreviewImg: {
    width: '100%',
    height: 170,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#EBD7C3',
    marginTop: 6,
  },
  zoomHint: {
    fontSize: 12,
    fontFamily: 'PlusJakartaSans_600SemiBold',
    color: '#D96B08',
    marginTop: 4,
  },
  detailStack: {
    gap: 12,
  },
  detailRow: {
    gap: 3,
  },
  detailLabel: {
    fontSize: 12,
    fontFamily: 'PlusJakartaSans_700Bold',
    color: '#B8651B',
  },
  detailValue: {
    fontSize: 14,
    fontFamily: 'PlusJakartaSans_500Medium',
    color: '#6E3906',
  },
  confirmMessage: {
    fontSize: 14,
    fontFamily: 'PlusJakartaSans_400Regular',
    color: '#6E3906',
    lineHeight: 20,
  },
  modalFooter: {
    flexDirection: 'row',
    gap: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F0DFCE',
  },
  footerBtn: {
    flex: 1,
    height: 42,
    borderRadius: 999,
    justifyContent: 'center',
    alignItems: 'center',
  },
  btnPrimary: {
    backgroundColor: '#D96B08',
  },
  btnSecondary: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#EBD7C3',
  },
  btnDanger: {
    backgroundColor: '#E63946',
  },
  btnWhiteText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontFamily: 'PlusJakartaSans_700Bold',
  },
  btnSecondaryText: {
    color: '#8A4505',
    fontSize: 13,
    fontFamily: 'PlusJakartaSans_700Bold',
  },
});

import React, { ComponentRef, useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Keyboard,
  Linking,
  Modal,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Ellipse, Line, Path, Polyline } from 'react-native-svg';
import { CustomScrollView } from '../components/CustomScrollView';
import { KeyboardAwareModalOverlay } from '../components/KeyboardAwareModalOverlay';
import { PhotoSourceModal } from '../components/PhotoSourceModal';
import { useApp } from '../context/AppContext';
import { ApiError } from '../services/api';
import { Animal, GeneroAnimal } from '../types';
import { exportAnimalPdf } from '../utils/animalPdf';
import {
  formatDateDisplay,
  formatDateInputDDMMYYYY,
  toDisplayDate,
  validateDateInput,
} from '../utils/date';

const SPECIES_OPTIONS = [
  'Cachorro',
  'Gato',
  'Roedor',
  'Ave',
  'Réptil',
  'Anfíbio',
  'Peixe',
] as const;
const GENDER_OPTIONS: Exclude<GeneroAnimal, ''>[] = ['Macho', 'Fêmea'];

function formatDateBR(isoDate?: string): string {
  return formatDateDisplay(isoDate, 'Não informada');
}

interface ConfirmDialogState {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  destructive?: boolean;
  onConfirm: (() => Promise<void> | void) | null;
}

export const HomeScreen: React.FC = () => {
  const {
    animais,
    eventos,
    propagandas,
    editAnimal,
    removeAnimal,
    navigateToVaccinesForAnimal,
    openPhotoViewer,
  } = useApp();

  const { width: windowWidth } = useWindowDimensions();
  const slideWidth = Math.min(windowWidth - 40, 440);

  // Carrossel (máx. 5 produtos, auto-play 5s)
  const slides = propagandas.slice(0, 5);
  const carouselRef = useRef<ComponentRef<typeof ScrollView> | null>(null);
  const [currentSlide, setCurrentSlide] = useState<number>(0);
  const currentSlideRef = useRef<number>(0);
  const autoPlayRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const goToSlide = useCallback(
    (index: number) => {
      if (slides.length === 0) return;
      const clamped = Math.max(0, Math.min(index, slides.length - 1));
      currentSlideRef.current = clamped;
      setCurrentSlide(clamped);
      carouselRef.current?.scrollTo({
        x: clamped * slideWidth,
        animated: true,
      });
    },
    [slideWidth, slides.length]
  );

  const stopAutoPlay = useCallback(() => {
    if (autoPlayRef.current) {
      clearInterval(autoPlayRef.current);
      autoPlayRef.current = null;
    }
  }, []);

  const startAutoPlay = useCallback(() => {
    stopAutoPlay();
    if (slides.length <= 1) return;
    autoPlayRef.current = setInterval(() => {
      const next = (currentSlideRef.current + 1) % slides.length;
      goToSlide(next);
    }, 5000);
  }, [goToSlide, slides.length, stopAutoPlay]);

  useEffect(() => {
    startAutoPlay();
    return () => stopAutoPlay();
  }, [startAutoPlay, stopAutoPlay]);

  const handleCarouselMomentumEnd = (
    event: NativeSyntheticEvent<NativeScrollEvent>
  ) => {
    if (slideWidth <= 0) return;
    const offsetX = event.nativeEvent.contentOffset.x;
    const idx = Math.round(offsetX / slideWidth);
    if (idx >= 0 && idx < slides.length) {
      currentSlideRef.current = idx;
      setCurrentSlide(idx);
    }
    startAutoPlay();
  };

  const handleOpenAffiliateLink = async (url: string) => {
    if (!url) return;
    try {
      const supported = await Linking.canOpenURL(url);
      if (supported) {
        await Linking.openURL(url);
      } else {
        Alert.alert('Link indisponível', 'Não foi possível abrir o link da oferta.');
      }
    } catch {
      Alert.alert('Erro', 'Não foi possível abrir o navegador.');
    }
  };

  // Modais de Detalhes, Edição e Confirmação
  const [selectedPet, setSelectedPet] = useState<Animal | null>(null);
  const [detailsVisible, setDetailsVisible] = useState<boolean>(false);
  const [editModalVisible, setEditModalVisible] = useState<boolean>(false);
  const [speciesPickerVisible, setSpeciesPickerVisible] =
    useState<boolean>(false);
  const [genderPickerVisible, setGenderPickerVisible] =
    useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [downloadingPdf, setDownloadingPdf] = useState<boolean>(false);

  // Campos do formulário de edição
  const [editId, setEditId] = useState<string>('');
  const [editNome, setEditNome] = useState<string>('');
  const [editEspecie, setEditEspecie] = useState<string>('Cachorro');
  const [editGenero, setEditGenero] = useState<string>('Macho');
  const [editRaca, setEditRaca] = useState<string>('');
  const [editNascimento, setEditNascimento] = useState<string>('');
  const [editRacao, setEditRacao] = useState<string>('');
  const [editObservacao, setEditObservacao] = useState<string>('');
  const [editFoto, setEditFoto] = useState<string>('');
  const [editError, setEditError] = useState<string | null>(null);
  const [editFieldErrors, setEditFieldErrors] = useState<{
    nome?: boolean;
    especie?: boolean;
    genero?: boolean;
    nascimento?: boolean;
  }>({});

  const editScrollRef = useRef<ComponentRef<typeof ScrollView> | null>(null);
  const editNomeInputRef = useRef<ComponentRef<typeof TextInput> | null>(null);
  const editNascimentoInputRef = useRef<ComponentRef<typeof TextInput> | null>(null);

  const [confirmState, setConfirmState] = useState<ConfirmDialogState>({
    visible: false,
    title: '',
    message: '',
    confirmLabel: 'Sim, confirmar',
    destructive: false,
    onConfirm: null,
  });

  const askConfirmation = (
    title: string,
    message: string,
    onConfirm: () => Promise<void> | void,
    options?: { confirmLabel?: string; destructive?: boolean }
  ) => {
    setConfirmState({
      visible: true,
      title,
      message,
      confirmLabel: options?.confirmLabel || 'Sim, confirmar',
      destructive: options?.destructive ?? false,
      onConfirm,
    });
  };

  const closeConfirmation = () => {
    setConfirmState((prev) => ({ ...prev, visible: false, onConfirm: null }));
  };

  const handleConfirmYes = async () => {
    const callback = confirmState.onConfirm;
    closeConfirmation();
    if (callback) {
      await callback();
    }
  };

  const openPetDetails = (pet: Animal) => {
    setSelectedPet(pet);
    setDetailsVisible(true);
  };

  const handleCancelDetails = () => {
    askConfirmation(
      'Confirmar Cancelamento',
      'Tem certeza que deseja cancelar e fechar as informações deste animal?',
      () => {
        setDetailsVisible(false);
        setSelectedPet(null);
      }
    );
  };

  const handleDownloadPetPdf = async () => {
    if (!selectedPet || downloadingPdf) return;
    setDownloadingPdf(true);
    try {
      const result = await exportAnimalPdf(selectedPet, eventos);
      if (!result.shared && result.uri) {
        Alert.alert(
          'PDF gerado',
          `A ficha completa de ${selectedPet.nome} foi gerada em PDF.`
        );
      }
    } catch {
      Alert.alert(
        'Erro ao gerar PDF',
        'Não foi possível gerar o arquivo PDF deste animal.'
      );
    } finally {
      setDownloadingPdf(false);
    }
  };

  const handleDeletePet = () => {
    if (!selectedPet) return;
    const petId = selectedPet.id_animal;
    askConfirmation(
      'Deletar Animal',
      'Tem certeza que deseja deletar este animal permanentemente?',
      async () => {
        setSaving(true);
        try {
          await removeAnimal(petId);
          setDetailsVisible(false);
          setSelectedPet(null);
        } catch (err) {
          Alert.alert(
            'Erro ao deletar',
            err instanceof ApiError
              ? err.message
              : 'Não foi possível deletar o animal.'
          );
        } finally {
          setSaving(false);
        }
      },
      { confirmLabel: 'Sim, deletar', destructive: true }
    );
  };

  const openEditForm = (pet: Animal) => {
    setEditId(pet.id_animal);
    setEditNome(pet.nome);
    setEditEspecie(pet.especie || 'Cachorro');
    setEditGenero(pet.genero || 'Macho');
    setEditRaca(pet.raca || '');
    setEditNascimento(toDisplayDate(pet.data_nascimento));
    setEditRacao(pet.racao || '');
    setEditObservacao(pet.observacao || '');
    setEditFoto(pet.foto || '');
    setEditError(null);
    setEditFieldErrors({});
    setEditModalVisible(true);
  };

  const handleRequestEditPet = () => {
    if (!selectedPet) return;
    const petSnapshot = selectedPet;
    askConfirmation(
      'Editar Animal',
      'Tem certeza que deseja editar as informações deste animal?',
      () => {
        setDetailsVisible(false);
        openEditForm(petSnapshot);
      }
    );
  };

  const handleCancelEditForm = () => {
    askConfirmation(
      'Cancelar Edição',
      'Tem certeza que deseja cancelar a edição? As alterações não salvas serão descartadas.',
      () => {
        setEditModalVisible(false);
      }
    );
  };

  const [photoModalVisible, setPhotoModalVisible] = useState<boolean>(false);

  const handlePickPetPhoto = () => {
    setPhotoModalVisible(true);
  };

  const handleSelectPetPhoto = (dataUri: string) => {
    setEditFoto(dataUri);
    setEditError(null);
  };

  const handleSaveEditForm = () => {
    setEditError(null);
    const nomeErr = !editNome.trim();
    const especieErr = !editEspecie.trim();
    const generoErr = !editGenero.trim();
    const dateCheck = validateDateInput(editNascimento, {
      required: false,
      allowFuture: false,
      fieldLabel: 'A data de nascimento do animal',
    });
    const nascimentoErr = !dateCheck.valid;

    if (nomeErr || especieErr || generoErr || nascimentoErr) {
      setEditFieldErrors({
        nome: nomeErr,
        especie: especieErr,
        genero: generoErr,
        nascimento: nascimentoErr,
      });
      if (nomeErr || especieErr || generoErr) {
        setEditError('Nome, Espécie e Gênero do animal são obrigatórios.');
      } else {
        setEditError(
          dateCheck.error || 'Informe a data de nascimento no formato dd-mm-aaaa.'
        );
      }
      editScrollRef.current?.scrollTo({ y: 0, animated: true });
      setTimeout(() => {
        if (nomeErr) {
          editNomeInputRef.current?.focus();
        } else if (especieErr) {
          setSpeciesPickerVisible(true);
        } else if (generoErr) {
          setGenderPickerVisible(true);
        } else if (nascimentoErr) {
          editNascimentoInputRef.current?.focus();
        }
        editScrollRef.current?.scrollTo({ y: 0, animated: true });
      }, 40);
      return;
    }

    setEditFieldErrors({});
    Keyboard.dismiss();

    askConfirmation(
      'Confirmar Edição',
      'Tem certeza que deseja salvar as alterações feitas neste animal?',
      async () => {
        setSaving(true);
        try {
          await editAnimal({
            id_animal: editId,
            nome: editNome.trim(),
            especie: editEspecie.trim(),
            genero: editGenero,
            raca: editRaca.trim(),
            data_nascimento: dateCheck.iso,
            racao: editRacao.trim(),
            observacao: editObservacao.trim(),
            foto: editFoto,
          });
          setEditModalVisible(false);
        } catch (err) {
          Alert.alert(
            'Erro ao salvar',
            err instanceof ApiError
              ? err.message
              : 'Não foi possível salvar as alterações.'
          );
        } finally {
          setSaving(false);
        }
      }
    );
  };

  const handleNavigateVaccines = () => {
    if (!selectedPet) return;
    const petId = selectedPet.id_animal;
    setDetailsVisible(false);
    setSelectedPet(null);
    navigateToVaccinesForAnimal(petId);
  };

  return (
    <LinearGradient colors={['#FDF8F2', '#F7EDE4']} style={styles.gradient}>
      <CustomScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.mainContainer}>
          {/* Seção 1: Carrossel de Produtos Afiliados (Máx. 5 produtos) */}
          {slides.length > 0 ? (
            <View style={styles.carouselSection}>
              <View style={[styles.carouselWrapper, { width: slideWidth }]}>
                <ScrollView
                  ref={carouselRef}
                  horizontal
                  pagingEnabled
                  showsHorizontalScrollIndicator={false}
                  onScrollBeginDrag={stopAutoPlay}
                  onMomentumScrollEnd={handleCarouselMomentumEnd}
                  scrollEventThrottle={16}
                >
                  {slides.map((prod) => (
                    <TouchableOpacity
                      key={prod.id_propaganda}
                      activeOpacity={0.92}
                      onPress={() => handleOpenAffiliateLink(prod.link)}
                      style={[styles.carouselSlide, { width: slideWidth }]}
                      accessibilityRole="link"
                      accessibilityLabel={prod.nome}
                    >
                      {prod.foto ? (
                        <Image
                          source={{ uri: prod.foto }}
                          style={styles.slideImage}
                          resizeMode="cover"
                        />
                      ) : (
                        <View style={styles.slideFallbackBg} />
                      )}
                      <LinearGradient
                        colors={[
                          'rgba(40, 20, 2, 0.05)',
                          'rgba(40, 20, 2, 0.78)',
                        ]}
                        locations={[0.35, 1]}
                        style={styles.slideOverlay}
                      >
                        <Text style={styles.slideTitle} numberOfLines={2}>
                          {prod.nome}
                        </Text>
                        <Text style={styles.slideCta}>Conferir oferta →</Text>
                      </LinearGradient>
                      <View style={styles.affiliateBadge}>
                        <Text style={styles.affiliateBadgeText}>
                          Loja Parceira
                        </Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>

              {/* 5 Pontinhos Indicadores */}
              <View style={styles.carouselDots}>
                {slides.map((prod, idx) => {
                  const isActive = idx === currentSlide;
                  return (
                    <TouchableOpacity
                      key={prod.id_propaganda}
                      activeOpacity={0.8}
                      onPress={() => {
                        goToSlide(idx);
                        startAutoPlay();
                      }}
                      style={[styles.dot, isActive && styles.dotActive]}
                      accessibilityRole="button"
                      accessibilityLabel={`Ir para o produto ${idx + 1}`}
                    />
                  );
                })}
              </View>
            </View>
          ) : null}

          {/* Seção 2: Lista de Animais Cadastrados */}
          <View style={styles.petsSection}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Meus Pets</Text>
              <View style={styles.petsCountPill}>
                <Text style={styles.petsCountText}>
                  {animais.length} {animais.length === 1 ? 'pet' : 'pets'}
                </Text>
              </View>
            </View>

            {animais.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyStateText}>
                  Nenhum animal cadastrado.
                </Text>
              </View>
            ) : (
              <View style={styles.petsList}>
                {animais.map((pet) => (
                  <TouchableOpacity
                    key={pet.id_animal}
                    activeOpacity={0.85}
                    onPress={() => openPetDetails(pet)}
                    style={styles.petCard}
                    accessibilityRole="button"
                    accessibilityLabel={`Abrir perfil de ${pet.nome}`}
                  >
                    {pet.foto ? (
                      <TouchableOpacity
                        activeOpacity={0.85}
                        onPress={() => openPhotoViewer(pet.foto, pet.nome)}
                        accessibilityRole="button"
                        accessibilityLabel={`Ver foto de ${pet.nome}`}
                      >
                        <Image
                          source={{ uri: pet.foto }}
                          style={styles.petPhoto}
                          resizeMode="cover"
                        />
                      </TouchableOpacity>
                    ) : (
                      <View style={styles.petPhotoPlaceholder}>
                        <Svg width={24} height={24} viewBox="0 0 64 64" fill="none">
                          <Path
                            d="M32 33C24.5 33 19 38.8 19 45.2C19 49.4 22.4 52 26.5 52C28.8 52 30.5 51.1 32 51.1C33.5 51.1 35.2 52 37.5 52C41.6 52 45 49.4 45 45.2C45 38.8 39.5 33 32 33Z"
                            stroke="#D96B08"
                            strokeWidth={4}
                          />
                          <Ellipse cx="15.5" cy="29.5" rx="4.5" ry="6" transform="rotate(-22 15.5 29.5)" stroke="#D96B08" strokeWidth={3.8} />
                          <Ellipse cx="25.5" cy="21" rx="4.5" ry="6.2" transform="rotate(-8 25.5 21)" stroke="#D96B08" strokeWidth={3.8} />
                          <Ellipse cx="38.5" cy="21" rx="4.5" ry="6.2" transform="rotate(8 38.5 21)" stroke="#D96B08" strokeWidth={3.8} />
                          <Ellipse cx="48.5" cy="29.5" rx="4.5" ry="6" transform="rotate(22 48.5 29.5)" stroke="#D96B08" strokeWidth={3.8} />
                        </Svg>
                      </View>
                    )}

                    <View style={styles.petInfo}>
                      <Text style={styles.petName} numberOfLines={1}>
                        {pet.nome}
                      </Text>
                      <Text style={styles.petBreed} numberOfLines={1}>
                        {pet.especie} • {pet.raca || 'SRD'}
                      </Text>
                    </View>

                    <Svg
                      width={22}
                      height={22}
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="#D96B08"
                      strokeWidth={2.4}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <Polyline points="9 18 15 12 9 6" />
                    </Svg>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        </View>
      </CustomScrollView>

      {/* Modal 1: Informações do Animal */}
      <Modal
        visible={detailsVisible}
        transparent
        animationType="fade"
        onRequestClose={handleCancelDetails}
      >
        <View style={styles.modalOverlay}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => {
              if (!saving) handleCancelDetails();
            }}
            accessibilityLabel="Fechar pop-up"
          />
          <View style={styles.modalBox}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Informações do Animal</Text>
              <TouchableOpacity
                onPress={handleCancelDetails}
                accessibilityRole="button"
                accessibilityLabel="Fechar informações"
              >
                <Text style={styles.modalClose}>×</Text>
              </TouchableOpacity>
            </View>

            {selectedPet ? (
              <CustomScrollView shrink style={styles.modalScroll}>
                <View style={styles.detailHero}>
                  <View style={styles.detailPhotoRow}>
                    <View style={styles.detailPhotoSpacer} />
                    {selectedPet.foto ? (
                      <TouchableOpacity
                        activeOpacity={0.85}
                        onPress={() => openPhotoViewer(selectedPet.foto, selectedPet.nome)}
                        accessibilityRole="button"
                        accessibilityLabel={`Ver foto de ${selectedPet.nome}`}
                      >
                        <Image
                          source={{ uri: selectedPet.foto }}
                          style={styles.detailAvatar}
                          resizeMode="cover"
                        />
                      </TouchableOpacity>
                    ) : (
                      <View style={[styles.detailAvatar, styles.avatarCenter]}>
                        <Text style={styles.avatarInitial}>
                          {selectedPet.nome.charAt(0).toUpperCase()}
                        </Text>
                      </View>
                    )}
                    <TouchableOpacity
                      activeOpacity={0.85}
                      onPress={handleDownloadPetPdf}
                      disabled={downloadingPdf || saving}
                      accessibilityRole="button"
                      accessibilityLabel="Baixar ficha em PDF"
                      style={[
                        styles.detailDownloadBtn,
                        (downloadingPdf || saving) && styles.btnDisabled,
                      ]}
                    >
                      {downloadingPdf ? (
                        <ActivityIndicator size="small" color="#D96B08" />
                      ) : (
                        <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
                          <Path
                            d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"
                            stroke="#D96B08"
                            strokeWidth={2.2}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                          <Polyline
                            points="7 10 12 15 17 10"
                            stroke="#D96B08"
                            strokeWidth={2.2}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                          <Line
                            x1={12}
                            y1={15}
                            x2={12}
                            y2={3}
                            stroke="#D96B08"
                            strokeWidth={2.2}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </Svg>
                      )}
                    </TouchableOpacity>
                  </View>
                  <Text style={styles.detailHeroName}>{selectedPet.nome}</Text>
                </View>

                <View style={styles.detailGrid}>
                  <View style={styles.detailRowPair}>
                    <View style={styles.detailItemHalf}>
                      <Text style={styles.detailLabel}>ESPÉCIE</Text>
                      <Text style={styles.detailValue}>
                        {selectedPet.especie}
                      </Text>
                    </View>
                    <View style={styles.detailItemHalf}>
                      <Text style={styles.detailLabel}>RAÇA</Text>
                      <Text style={styles.detailValue}>
                        {selectedPet.raca || 'Não informada'}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.detailRowPair}>
                    <View style={styles.detailItemHalf}>
                      <Text style={styles.detailLabel}>GÊNERO</Text>
                      <Text style={styles.detailValue}>
                        {selectedPet.genero || 'Não informado'}
                      </Text>
                    </View>
                    <View style={styles.detailItemHalf}>
                      <Text style={styles.detailLabel}>DATA DE NASCIMENTO</Text>
                      <Text style={styles.detailValue}>
                        {formatDateBR(selectedPet.data_nascimento)}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.detailItemFull}>
                    <Text style={styles.detailLabel}>RAÇÃO</Text>
                    <Text style={styles.detailValue}>
                      {selectedPet.racao || 'Não informada'}
                    </Text>
                  </View>

                  <View style={styles.detailItemFull}>
                    <Text style={styles.detailLabel}>OBSERVAÇÃO</Text>
                    <Text style={styles.detailValue}>
                      {selectedPet.observacao ||
                        'Nenhuma observação cadastrada.'}
                    </Text>
                  </View>
                </View>

                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={handleNavigateVaccines}
                  style={styles.vaccineHyperlink}
                  accessibilityRole="button"
                >
                  <Text style={styles.vaccineHyperlinkText}>
                    Clique aqui para ver todas as vacinas desse animal
                  </Text>
                </TouchableOpacity>
              </CustomScrollView>
            ) : null}

            <View style={styles.modalFooter}>
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={handleDeletePet}
                disabled={saving}
                style={[styles.footerBtn, styles.btnDanger]}
              >
                <Text style={styles.btnWhiteText}>Deletar Animal</Text>
              </TouchableOpacity>
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={handleRequestEditPet}
                disabled={saving}
                style={[styles.footerBtn, styles.btnPrimary]}
              >
                <Text style={styles.btnWhiteText}>Editar Animal</Text>
              </TouchableOpacity>
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={handleCancelDetails}
                disabled={saving}
                style={[styles.footerBtn, styles.btnSecondary]}
              >
                <Text style={styles.btnSecondaryText}>Cancelar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal 2: Formulário de Edição do Animal */}
      <Modal
        visible={editModalVisible}
        transparent
        statusBarTranslucent
        animationType="fade"
        onRequestClose={() => {
          Keyboard.dismiss();
          handleCancelEditForm();
        }}
      >
        <KeyboardAwareModalOverlay
          cardStyle={[styles.modalBox, styles.keyboardModalBox]}
          onBackdropPress={() => {
            if (!saving) {
              handleCancelEditForm();
            }
          }}
        >
          <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Editar Animal</Text>
              <TouchableOpacity
                onPress={handleCancelEditForm}
                accessibilityRole="button"
                accessibilityLabel="Fechar edição"
              >
                <Text style={styles.modalClose}>×</Text>
              </TouchableOpacity>
            </View>

            {editError ? (
              <View style={styles.errorBanner}>
                <Text style={styles.errorBannerText}>{editError}</Text>
              </View>
            ) : null}

            <CustomScrollView
              ref={editScrollRef}
              shrink
              style={styles.modalScroll}
              keyboardShouldPersistTaps="handled"
            >
              <View style={styles.formStack}>
                <View style={styles.formGroup}>
                  <Text style={styles.formLabel}>Nome do Animal *</Text>
                  <TextInput
                    ref={editNomeInputRef}
                    value={editNome}
                    onChangeText={(txt) => {
                      setEditNome(txt);
                      if (editFieldErrors.nome) {
                        setEditFieldErrors((p) => ({ ...p, nome: false }));
                      }
                      setEditError(null);
                    }}
                    style={[
                      styles.formInput,
                      editFieldErrors.nome && styles.inputError,
                    ]}
                    placeholder="Nome do pet"
                    placeholderTextColor="#9E8A78"
                  />
                </View>

                <View style={styles.formRow}>
                  <View style={[styles.formGroup, styles.flex]}>
                    <Text style={styles.formLabel}>Espécie *</Text>
                    <TouchableOpacity
                      activeOpacity={0.85}
                      onPress={() => {
                        Keyboard.dismiss();
                        setSpeciesPickerVisible(true);
                      }}
                      style={[
                        styles.selectBox,
                        editFieldErrors.especie && styles.inputError,
                      ]}
                      accessibilityRole="button"
                      accessibilityLabel="Selecionar espécie do animal"
                    >
                      <Text style={styles.selectValueText} numberOfLines={1}>
                        {editEspecie || 'Selecione...'}
                      </Text>
                      <Text style={styles.selectChevron}>▾</Text>
                    </TouchableOpacity>
                  </View>
                  <View style={[styles.formGroup, styles.flex]}>
                    <Text style={styles.formLabel}>Gênero *</Text>
                    <TouchableOpacity
                      activeOpacity={0.85}
                      onPress={() => {
                        Keyboard.dismiss();
                        setGenderPickerVisible(true);
                      }}
                      style={[
                        styles.selectBox,
                        editFieldErrors.genero && styles.inputError,
                      ]}
                    >
                      <Text style={styles.selectValueText}>{editGenero}</Text>
                      <Text style={styles.selectChevron}>▾</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                <View style={styles.formRow}>
                  <View style={[styles.formGroup, styles.flex]}>
                    <Text style={styles.formLabel}>Raça</Text>
                    <TextInput
                      value={editRaca}
                      onChangeText={setEditRaca}
                      style={styles.formInput}
                      placeholder="Ex: Golden Retriever"
                      placeholderTextColor="#9E8A78"
                    />
                  </View>
                  <View style={[styles.formGroup, styles.flex]}>
                    <Text style={styles.formLabel}>Data de Nascimento</Text>
                    <TextInput
                      ref={editNascimentoInputRef}
                      value={editNascimento}
                      onChangeText={(txt) => {
                        setEditNascimento(formatDateInputDDMMYYYY(txt));
                        if (editFieldErrors.nascimento) {
                          setEditFieldErrors((p) => ({ ...p, nascimento: false }));
                        }
                        setEditError(null);
                      }}
                      style={[
                        styles.formInput,
                        editFieldErrors.nascimento && styles.inputError,
                      ]}
                      placeholder="dd-mm-aaaa"
                      placeholderTextColor="#9E8A78"
                      keyboardType="number-pad"
                      maxLength={10}
                    />
                  </View>
                </View>

                <View style={styles.formGroup}>
                  <Text style={styles.formLabel}>Ração</Text>
                  <TextInput
                    value={editRacao}
                    onChangeText={setEditRacao}
                    style={styles.formInput}
                    placeholder="Marca ou dieta"
                    placeholderTextColor="#9E8A78"
                  />
                </View>

                <View style={styles.formGroup}>
                  <Text style={styles.formLabel}>Observação</Text>
                  <TextInput
                    value={editObservacao}
                    onChangeText={setEditObservacao}
                    style={[styles.formInput, styles.formTextarea]}
                    multiline
                    numberOfLines={3}
                    textAlignVertical="top"
                    placeholder="Alergias, temperamento ou cuidados..."
                    placeholderTextColor="#9E8A78"
                  />
                </View>

                <View style={styles.formGroup}>
                  <Text style={styles.formLabel}>Foto do Animal</Text>
                  <View style={styles.photoUploadRow}>
                    {editFoto ? (
                      <TouchableOpacity
                        activeOpacity={0.85}
                        onPress={() =>
                          openPhotoViewer(editFoto, editNome.trim() || 'Foto do animal')
                        }
                        accessibilityRole="button"
                        accessibilityLabel="Ver foto do animal em tela cheia"
                      >
                        <Image
                          source={{ uri: editFoto }}
                          style={styles.photoThumb}
                          resizeMode="cover"
                        />
                      </TouchableOpacity>
                    ) : null}
                    <TouchableOpacity
                      activeOpacity={0.85}
                      onPress={handlePickPetPhoto}
                      style={[styles.photoUploadBtn, styles.photoUploadBtnFlex]}
                    >
                      <Text style={styles.photoUploadBtnText}>
                        Alterar foto (câmera ou galeria)
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            </CustomScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={handleCancelEditForm}
                disabled={saving}
                style={[styles.footerBtn, styles.btnSecondary]}
              >
                <Text style={styles.btnSecondaryText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={handleSaveEditForm}
                disabled={saving}
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

      {/* Submodal: Seleção de Espécie na Edição */}
      <Modal
        visible={speciesPickerVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setSpeciesPickerVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setSpeciesPickerVisible(false)}
            accessibilityLabel="Fechar pop-up"
          />
          <View style={[styles.modalBox, styles.smallModalBox]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Selecionar Espécie</Text>
              <TouchableOpacity onPress={() => setSpeciesPickerVisible(false)}>
                <Text style={styles.modalClose}>×</Text>
              </TouchableOpacity>
            </View>
            <CustomScrollView shrink style={{ maxHeight: 300 }}>
              <View style={styles.optionList}>
                {SPECIES_OPTIONS.map((opt) => {
                  const isSelected = editEspecie === opt;
                  return (
                    <TouchableOpacity
                      key={opt}
                      activeOpacity={0.8}
                      onPress={() => {
                        setEditEspecie(opt);
                        if (editFieldErrors.especie) {
                          setEditFieldErrors((p) => ({ ...p, especie: false }));
                        }
                        setEditError(null);
                        setSpeciesPickerVisible(false);
                      }}
                      style={[
                        styles.optionItem,
                        isSelected && styles.optionItemSelected,
                      ]}
                    >
                      <Text
                        style={[
                          styles.optionText,
                          isSelected && styles.optionTextSelected,
                        ]}
                      >
                        {opt}
                      </Text>
                      {isSelected ? (
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

      {/* Submodal: Seleção de Gênero na Edição */}
      <Modal
        visible={genderPickerVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setGenderPickerVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setGenderPickerVisible(false)}
            accessibilityLabel="Fechar pop-up"
          />
          <View style={[styles.modalBox, styles.smallModalBox]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Selecionar Gênero</Text>
              <TouchableOpacity onPress={() => setGenderPickerVisible(false)}>
                <Text style={styles.modalClose}>×</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.optionList}>
              {GENDER_OPTIONS.map((opt) => {
                const isSelected = editGenero === opt;
                return (
                  <TouchableOpacity
                    key={opt}
                    activeOpacity={0.8}
                    onPress={() => {
                      setEditGenero(opt);
                      if (editFieldErrors.genero) {
                        setEditFieldErrors((p) => ({ ...p, genero: false }));
                      }
                      setEditError(null);
                      setGenderPickerVisible(false);
                    }}
                    style={[
                      styles.optionItem,
                      isSelected && styles.optionItemSelected,
                    ]}
                  >
                    <Text
                      style={[
                        styles.optionText,
                        isSelected && styles.optionTextSelected,
                      ]}
                    >
                      {opt}
                    </Text>
                    {isSelected ? (
                      <Text style={styles.optionCheck}>✓</Text>
                    ) : null}
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal 3: Confirmação (Para Cancelar, Editar e Deletar) */}
      <Modal
        visible={confirmState.visible}
        transparent
        animationType="fade"
        onRequestClose={closeConfirmation}
      >
        <View style={[styles.modalOverlay, styles.confirmOverlay]}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={closeConfirmation}
            accessibilityLabel="Fechar pop-up"
          />
          <View style={[styles.modalBox, styles.smallModalBox]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{confirmState.title}</Text>
            </View>
            <Text style={styles.confirmMessage}>{confirmState.message}</Text>
            <View style={styles.modalFooter}>
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={closeConfirmation}
                style={[styles.footerBtn, styles.btnSecondary]}
              >
                <Text style={styles.btnSecondaryText}>Não</Text>
              </TouchableOpacity>
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={handleConfirmYes}
                style={[
                  styles.footerBtn,
                  confirmState.destructive
                    ? styles.btnDanger
                    : styles.btnPrimary,
                ]}
              >
                <Text style={styles.btnWhiteText}>
                  {confirmState.confirmLabel}
                </Text>
              </TouchableOpacity>
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
        onSelectPhoto={handleSelectPetPhoto}
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
    paddingTop: 16,
    paddingBottom: 24,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  mainContainer: {
    width: '100%',
    maxWidth: 480,
  },
  carouselSection: {
    width: '100%',
    alignItems: 'center',
  },
  carouselWrapper: {
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#EBD7C3',
    shadowColor: '#8A4505',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 4,
  },
  carouselSlide: {
    height: 165,
    position: 'relative',
  },
  slideImage: {
    width: '100%',
    height: '100%',
  },
  slideFallbackBg: {
    width: '100%',
    height: '100%',
    backgroundColor: '#FFF3E6',
  },
  slideOverlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    justifyContent: 'flex-end',
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  affiliateBadge: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: 'rgba(217, 107, 8, 0.92)',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 999,
  },
  affiliateBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontFamily: 'PlusJakartaSans_700Bold',
  },
  slideTitle: {
    fontSize: 15,
    fontFamily: 'PlusJakartaSans_700Bold',
    color: '#FFFFFF',
    lineHeight: 19,
    marginBottom: 2,
  },
  slideCta: {
    fontSize: 12,
    fontFamily: 'PlusJakartaSans_500Medium',
    color: '#FFD9B3',
  },
  carouselDots: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 999,
    backgroundColor: '#E2C5AA',
  },
  dotActive: {
    width: 22,
    backgroundColor: '#D96B08',
  },
  petsSection: {
    marginTop: 32,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 18,
    fontFamily: 'PlusJakartaSans_700Bold',
    color: '#8A4505',
  },
  petsCountPill: {
    backgroundColor: '#FFF3E6',
    paddingVertical: 3,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#F0DFCE',
  },
  petsCountText: {
    fontSize: 13,
    fontFamily: 'PlusJakartaSans_600SemiBold',
    color: '#B8651B',
  },
  petsList: {
    gap: 12,
  },
  petCard: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#EBD7C3',
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    shadowColor: '#8A4505',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  petPhoto: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 2,
    borderColor: '#F0DFCE',
    backgroundColor: '#FFF3E6',
  },
  petPhotoPlaceholder: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 2,
    borderColor: '#F0DFCE',
    backgroundColor: '#FFF3E6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  petInfo: {
    flex: 1,
  },
  petName: {
    fontSize: 17,
    fontFamily: 'PlusJakartaSans_700Bold',
    color: '#6E3906',
  },
  petBreed: {
    fontSize: 13,
    fontFamily: 'PlusJakartaSans_500Medium',
    color: '#B8651B',
    marginTop: 2,
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
    maxWidth: 390,
    maxHeight: '88%',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#F0DFCE',
    padding: 20,
    shadowColor: '#3C1E05',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 10,
  },
  smallModalBox: {
    maxWidth: 340,
  },
  keyboardModalBox: {
    maxHeight: '100%',
    flexShrink: 1,
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
  detailHero: {
    alignItems: 'center',
    gap: 8,
    paddingVertical: 4,
    marginBottom: 12,
  },
  detailPhotoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  detailPhotoSpacer: {
    width: 40,
    height: 40,
  },
  detailDownloadBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFF3E6',
    borderWidth: 1.5,
    borderColor: '#D96B08',
    justifyContent: 'center',
    alignItems: 'center',
  },
  detailAvatar: {
    width: 84,
    height: 84,
    borderRadius: 42,
    borderWidth: 3,
    borderColor: '#D96B08',
    backgroundColor: '#FFF3E6',
  },
  avatarCenter: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarInitial: {
    fontSize: 28,
    fontFamily: 'PlusJakartaSans_700Bold',
    color: '#D96B08',
  },
  detailHeroName: {
    fontSize: 18,
    fontFamily: 'PlusJakartaSans_700Bold',
    color: '#8A4505',
  },
  detailGrid: {
    backgroundColor: '#FFFDFB',
    borderWidth: 1,
    borderColor: '#F0DFCE',
    borderRadius: 14,
    padding: 12,
    gap: 10,
    marginBottom: 12,
  },
  detailRowPair: {
    flexDirection: 'row',
    gap: 10,
  },
  detailItemHalf: {
    flex: 1,
    gap: 2,
  },
  detailItemFull: {
    gap: 2,
  },
  detailLabel: {
    fontSize: 11,
    fontFamily: 'PlusJakartaSans_700Bold',
    color: '#B8651B',
  },
  detailValue: {
    fontSize: 14,
    fontFamily: 'PlusJakartaSans_600SemiBold',
    color: '#6E3906',
  },
  vaccineHyperlink: {
    backgroundColor: '#FFF3E6',
    borderWidth: 1.5,
    borderColor: '#D96B08',
    borderRadius: 12,
    paddingVertical: 11,
    paddingHorizontal: 14,
    marginBottom: 8,
  },
  vaccineHyperlinkText: {
    color: '#D96B08',
    fontSize: 13,
    fontFamily: 'PlusJakartaSans_700Bold',
    textDecorationLine: 'underline',
    textAlign: 'center',
  },
  modalFooter: {
    flexDirection: 'row',
    gap: 8,
    paddingTop: 12,
    marginTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F0DFCE',
  },
  footerBtn: {
    flex: 1,
    height: 42,
    borderRadius: 999,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  btnPrimary: {
    backgroundColor: '#D96B08',
  },
  btnDanger: {
    backgroundColor: '#E63946',
  },
  btnSecondary: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#EBD7C3',
  },
  btnWhiteText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontFamily: 'PlusJakartaSans_700Bold',
    textAlign: 'center',
  },
  btnSecondaryText: {
    color: '#8A4505',
    fontSize: 12,
    fontFamily: 'PlusJakartaSans_700Bold',
    textAlign: 'center',
  },
  formStack: {
    gap: 10,
    paddingBottom: 6,
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
    minHeight: 40,
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
    marginBottom: 8,
  },
  errorBannerText: {
    fontSize: 12.5,
    fontFamily: 'PlusJakartaSans_600SemiBold',
    color: '#C92A2A',
    textAlign: 'center',
  },
  formTextarea: {
    minHeight: 72,
  },
  selectBox: {
    minHeight: 40,
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
  },
  selectChevron: {
    fontSize: 14,
    color: '#B8651B',
  },
  photoUploadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  photoThumb: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 2,
    borderColor: '#D96B08',
    backgroundColor: '#FFF3E6',
  },
  photoUploadBtn: {
    width: '100%',
    minHeight: 40,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: '#D96B08',
    borderRadius: 10,
    backgroundColor: '#FFF8F1',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 10,
  },
  photoUploadBtnFlex: {
    flex: 1,
    width: undefined,
  },
  photoUploadBtnText: {
    fontSize: 13,
    fontFamily: 'PlusJakartaSans_700Bold',
    color: '#8A4505',
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
  confirmMessage: {
    fontSize: 14,
    fontFamily: 'PlusJakartaSans_400Regular',
    color: '#6E3906',
    lineHeight: 20,
    marginBottom: 8,
  },
  btnDisabled: {
    opacity: 0.55,
  },
});

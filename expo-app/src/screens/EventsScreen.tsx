import React, { ComponentRef, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Keyboard,
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
import DateTimePicker, {
  DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, Path, Polygon } from 'react-native-svg';
import { CustomScrollView } from '../components/CustomScrollView';
import { KeyboardAwareModalOverlay } from '../components/KeyboardAwareModalOverlay';
import { useApp } from '../context/AppContext';
import { ApiError } from '../services/api';
import {
  ensureExpoNotificationPermissions,
  getAcceptedChannels,
  getDisabledSelectedChannels,
} from '../services/eventNotifications';
import {
  Evento,
  EventoAnimalRef,
  FrequenciaAlarme,
  TipoEvento,
} from '../types';
import {
  formatDateDisplay,
  formatDateInputDDMMYYYY,
  getTodayDisplay,
  getTodayISO,
  toDisplayDate,
  toISODate,
  validateDateInput,
} from '../utils/date';
import {
  formatPhoneMask,
  INVALID_CELLPHONE_MESSAGE,
  isValidCellPhone,
} from '../utils/phone';

const EVENT_TYPES: TipoEvento[] = [
  'Consulta',
  'Vacinação',
  'Tosa e/ou Banho',
  'Passeio',
  'Alarme',
  'Outro',
];

const FREQUENCIA_OPTIONS: Exclude<FrequenciaAlarme, ''>[] = [
  'Uma vez',
  'Diária',
  'Semanal',
  'Mensal',
];

const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const MONTHS_PT = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
];

function getDefaultAlarmTime(): string {
  const now = new Date();
  const hour = now.getHours();
  if (hour >= 23) return '23:59';
  return `${String(hour + 1).padStart(2, '0')}:00`;
}

function formatDateBR(isoDate?: string): string {
  return formatDateDisplay(isoDate);
}

function parseHHMMToDate(hhmm?: string): Date {
  const base = new Date();
  if (hhmm && /^\d{2}:\d{2}$/.test(hhmm.trim())) {
    const [hh, mm] = hhmm.trim().split(':').map(Number);
    if (hh >= 0 && hh <= 23 && mm >= 0 && mm <= 59) {
      base.setHours(hh, mm, 0, 0);
      return base;
    }
  }
  base.setSeconds(0, 0);
  return base;
}

function formatDateToHHMM(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(
    date.getMinutes()
  ).padStart(2, '0')}`;
}

function formatTimeInputMask(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}:${digits.slice(2)}`;
}

export const EventsScreen: React.FC = () => {
  const {
    usuario,
    animais,
    eventos,
    addEvent,
    editEvent,
    removeEvent,
    editAccount,
  } = useApp();

  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list');
  const [selectedAnimals, setSelectedAnimals] = useState<string[]>([]);
  const [selectedTypes, setSelectedTypes] = useState<TipoEvento[]>([]);

  const now = new Date();
  const [calYear, setCalYear] = useState<number>(now.getFullYear());
  const [calMonth, setCalMonth] = useState<number>(now.getMonth());

  // Modais principais
  const [filterModalVisible, setFilterModalVisible] = useState<boolean>(false);
  const [dayEventsModalVisible, setDayEventsModalVisible] =
    useState<boolean>(false);
  const [selectedDayISO, setSelectedDayISO] = useState<string>(getTodayISO());
  const [alarmsModalVisible, setAlarmsModalVisible] = useState<boolean>(false);
  const [formModalVisible, setFormModalVisible] = useState<boolean>(false);

  // Modais de validação
  const [accountActivationModal, setAccountActivationModal] = useState<{
    channel: 'app' | 'whatsapp';
    label: string;
  } | null>(null);
  const [phonePromptVisible, setPhonePromptVisible] = useState<boolean>(false);
  const [phoneInput, setPhoneInput] = useState<string>('');
  const [phoneInputError, setPhoneInputError] = useState<string | null>(null);
  const [pendingNotifType, setPendingNotifType] = useState<'whatsapp' | null>(
    null
  );
  const [timeAlertVisible, setTimeAlertVisible] = useState<boolean>(false);
  const [saveConfirmVisible, setSaveConfirmVisible] = useState<boolean>(false);
  const [selectionMode, setSelectionMode] = useState<boolean>(false);
  const [selectedEventIds, setSelectedEventIds] = useState<string[]>([]);
  const [bulkDeleteConfirmVisible, setBulkDeleteConfirmVisible] =
    useState<boolean>(false);
  const [deletingBulk, setDeletingBulk] = useState<boolean>(false);

  // Pickers internos do formulário
  const [pickerKind, setPickerKind] = useState<
    'tipo' | 'animal' | 'frequencia' | null
  >(null);
  const [timePickerVisible, setTimePickerVisible] = useState<boolean>(false);
  const [iosTempTime, setIosTempTime] = useState<Date>(() => parseHHMMToDate(''));

  // Estado do formulário de Evento / Alarme (sem campo tipo_alarme)
  const [evId, setEvId] = useState<string>('');
  const [evTitulo, setEvTitulo] = useState<string>('');
  const [evTipo, setEvTipo] = useState<TipoEvento | ''>('');
  const [evTipoLocked, setEvTipoLocked] = useState<boolean>(false);
  const [evAnimalIds, setEvAnimalIds] = useState<string[]>([]);
  const [evDia, setEvDia] = useState<string>(getTodayDisplay());
  const [evHorario, setEvHorario] = useState<string>('');
  const [evLocal, setEvLocal] = useState<string>('');
  const [evVeterinario, setEvVeterinario] = useState<string>('');
  const [evFrequencia, setEvFrequencia] =
    useState<Exclude<FrequenciaAlarme, ''>>('Uma vez');
  const [evLigado, setEvLigado] = useState<boolean>(false);
  const [evAnotacao, setEvAnotacao] = useState<string>('');
  const [evNotifApp, setEvNotifApp] = useState<boolean>(false);
  const [evNotifWhats, setEvNotifWhats] = useState<boolean>(false);

  const [saving, setSaving] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{
    titulo?: boolean;
    tipo?: boolean;
    animal?: boolean;
    dia?: boolean;
    horario?: boolean;
  }>({});

  const formScrollRef = useRef<ComponentRef<typeof ScrollView> | null>(null);
  const tituloInputRef = useRef<ComponentRef<typeof TextInput> | null>(null);
  const diaInputRef = useRef<ComponentRef<typeof TextInput> | null>(null);
  const horarioInputRef = useRef<ComponentRef<typeof TextInput> | null>(null);
  const phoneInputRef = useRef<ComponentRef<typeof TextInput> | null>(null);

  const todayISO = getTodayISO();
  const isCalendar = viewMode === 'calendar';
  const totalFilters = selectedAnimals.length + selectedTypes.length;

  const exitSelectionMode = () => {
    setSelectionMode(false);
    setSelectedEventIds([]);
    setBulkDeleteConfirmVisible(false);
  };

  const enterSelectionMode = (eventId: string) => {
    setSelectionMode(true);
    setSelectedEventIds((prev) =>
      prev.includes(eventId) ? prev : [...prev, eventId]
    );
  };

  const toggleEventSelection = (eventId: string) => {
    setSelectedEventIds((prev) =>
      prev.includes(eventId)
        ? prev.filter((id) => id !== eventId)
        : [...prev, eventId]
    );
  };

  const handleConfirmBulkDelete = async () => {
    if (selectedEventIds.length === 0) return;
    const idsToDelete = [...selectedEventIds];
    setDeletingBulk(true);
    try {
      for (const id of idsToDelete) {
        await removeEvent(id);
      }
      exitSelectionMode();
    } catch (error) {
      setBulkDeleteConfirmVisible(false);
      Alert.alert(
        'Erro ao excluir',
        error instanceof ApiError
          ? error.message
          : 'Não foi possível excluir todos os eventos selecionados.'
      );
    } finally {
      setDeletingBulk(false);
    }
  };

  const getAnimalNames = (refs: EventoAnimalRef[]): string => {
    if (!refs || refs.length === 0) return 'Pet';
    return refs
      .map((ref) => {
        const found = animais.find((a) => a.id_animal === ref.id_animal);
        return found ? found.nome : ref.nome || 'Pet';
      })
      .join(', ');
  };

  // Lista futura filtrada e ordenada (Modo Lista)
  const upcomingFilteredEvents = useMemo(() => {
    return eventos
      .filter((ev) => {
        const matchType =
          selectedTypes.length === 0 || selectedTypes.includes(ev.tipo_evento);
        const petIds = (ev.animal || []).map((a) => a.id_animal);
        const matchAnimal =
          selectedAnimals.length === 0 ||
          petIds.some((id) => selectedAnimals.includes(id));
        return matchType && matchAnimal && ev.data >= todayISO;
      })
      .sort((a, b) =>
        `${a.data}T${a.horario || '00:00'}`.localeCompare(
          `${b.data}T${b.horario || '00:00'}`
        )
      );
  }, [eventos, selectedAnimals, selectedTypes, todayISO]);

  // Todos os alarmes para a Central de Alarmes
  const allAlarms = useMemo(() => {
    return eventos
      .filter((ev) => ev.tipo_evento === 'Alarme')
      .sort((a, b) =>
        (a.horario || '99:99').localeCompare(b.horario || '99:99')
      );
  }, [eventos]);

  const activeAlarmsCount = useMemo(
    () => allAlarms.filter((a) => a.alarme_ligado).length,
    [allAlarms]
  );

  // Células do calendário mensal (Exibe TODOS os eventos do mês sem filtro)
  const calendarDays = useMemo(() => {
    const firstDay = new Date(calYear, calMonth, 1);
    const lastDay = new Date(calYear, calMonth + 1, 0);
    const cells: {
      key: string;
      day: number | null;
      iso?: string;
      hasEvent?: boolean;
      isToday?: boolean;
    }[] = [];

    for (let i = 0; i < firstDay.getDay(); i++) {
      cells.push({ key: `empty-${i}`, day: null });
    }

    for (let d = 1; d <= lastDay.getDate(); d++) {
      const iso = `${calYear}-${String(calMonth + 1).padStart(
        2,
        '0'
      )}-${String(d).padStart(2, '0')}`;
      const hasEvent = eventos.some((ev) => ev.data === iso);
      cells.push({
        key: iso,
        day: d,
        iso,
        hasEvent,
        isToday: iso === todayISO,
      });
    }

    return cells;
  }, [calMonth, calYear, eventos, todayISO]);

  const dayModalEvents = useMemo(
    () => eventos.filter((ev) => ev.data === selectedDayISO),
    [eventos, selectedDayISO]
  );

  const toggleViewMode = () => {
    setViewMode((prev) => {
      const next = prev === 'list' ? 'calendar' : 'list';
      if (next === 'calendar') {
        setFilterModalVisible(false);
        exitSelectionMode();
      }
      return next;
    });
  };

  const handlePrevMonth = () => {
    if (calMonth === 0) {
      setCalMonth(11);
      setCalYear((y) => y - 1);
    } else {
      setCalMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (calMonth === 11) {
      setCalMonth(0);
      setCalYear((y) => y + 1);
    } else {
      setCalMonth((m) => m + 1);
    }
  };

  const toggleFilterAnimal = (id: string) => {
    setSelectedAnimals((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const toggleFilterType = (type: TipoEvento) => {
    setSelectedTypes((prev) =>
      prev.includes(type)
        ? prev.filter((item) => item !== type)
        : [...prev, type]
    );
  };

  const openEditEvent = (
    eventId: string | null = null,
    defaultType: TipoEvento | '' = '',
    forceAlarmType = false
  ) => {
    if (animais.length === 0) {
      Alert.alert(
        'Cadastre um animal primeiro',
        'Você precisa ter pelo menos um pet cadastrado para criar um evento.'
      );
      return;
    }

    if (eventId) {
      const ev = eventos.find((item) => item.id_evento === eventId);
      if (!ev) return;
      const finalType: TipoEvento = forceAlarmType ? 'Alarme' : ev.tipo_evento;

      setEvId(ev.id_evento);
      setEvTitulo(ev.titulo);
      setEvTipo(finalType);
      setEvTipoLocked(forceAlarmType);
      setEvAnimalIds(
        ev.animal?.length
          ? ev.animal.map((a) => a.id_animal)
          : [animais[0].id_animal]
      );
      setEvDia(toDisplayDate(ev.data));
      setEvHorario(ev.horario || '');
      setEvLocal(finalType === 'Alarme' ? '' : ev.local || '');
      setEvVeterinario(
        finalType === 'Consulta' || finalType === 'Vacinação'
          ? ev.veterinario || ''
          : ''
      );
      setEvFrequencia(
        (ev.frequencia as Exclude<FrequenciaAlarme, ''>) || 'Uma vez'
      );
      setEvLigado(finalType === 'Alarme' ? ev.alarme_ligado : false);
      setEvAnotacao(ev.anotacao || '');
      setEvNotifApp(Boolean(ev.notificacao_app));
      setEvNotifWhats(Boolean(ev.notificacao_whatsapp));
    } else {
      const finalType: TipoEvento | '' = forceAlarmType ? 'Alarme' : defaultType;
      const hasPhone = isValidCellPhone(usuario?.celular);
      const isAlarmDefault = finalType === 'Alarme';
      setEvId('');
      setEvTitulo('');
      setEvTipo(finalType);
      setEvTipoLocked(forceAlarmType);
      setEvAnimalIds([animais[0].id_animal]);
      setEvDia(getTodayDisplay());
      setEvHorario(isAlarmDefault ? getDefaultAlarmTime() : '');
      setEvLocal('');
      setEvVeterinario('');
      setEvFrequencia('Uma vez');
      setEvLigado(isAlarmDefault);
      setEvAnotacao('');
      setEvNotifApp(Boolean(usuario?.notificacao_app));
      setEvNotifWhats(Boolean(usuario?.notificacao_whatsapp && hasPhone));
    }

    setTimePickerVisible(false);
    setFormError(null);
    setFieldErrors({});
    setFormModalVisible(true);
  };

  const openNativeTimePicker = () => {
    Keyboard.dismiss();
    setIosTempTime(parseHHMMToDate(evHorario));
    setTimePickerVisible(true);
  };

  const handleNativeTimeChange = (
    event: DateTimePickerEvent,
    selectedDate?: Date
  ) => {
    if (Platform.OS === 'android') {
      setTimePickerVisible(false);
      if (event.type === 'set' && selectedDate) {
        handleHorarioChange(formatDateToHHMM(selectedDate));
      }
      return;
    }
    if (selectedDate) {
      setIosTempTime(selectedDate);
    }
  };

  const handleConfirmIosTime = () => {
    handleHorarioChange(formatDateToHHMM(iosTempTime));
    setTimePickerVisible(false);
  };

  const handleSelectTipoEvento = (nextType: TipoEvento) => {
    setEvTipo(nextType);
    if (nextType === 'Alarme') {
      setEvLocal('');
      if (!evId) {
        if (!evHorario.trim()) setEvHorario(getDefaultAlarmTime());
        setEvLigado(true);
      }
    } else {
      setEvLigado(false);
    }
    if (nextType !== 'Consulta' && nextType !== 'Vacinação') {
      setEvVeterinario('');
    }
    setFieldErrors((p) => ({ ...p, tipo: false, horario: false }));
    setFormError(null);
    setPickerKind(null);
  };

  const handleToggleEvLigado = (nextValue: boolean) => {
    if (nextValue && !evHorario.trim()) {
      setEvLigado(false);
      setFieldErrors((p) => ({ ...p, horario: true }));
      setFormError('Para ativar a função Alarme Ligado, selecione o Horário.');
      formScrollRef.current?.scrollTo({ y: 0, animated: true });
      setTimeout(() => {
        openNativeTimePicker();
      }, 60);
      return;
    }
    setEvLigado(nextValue);
  };

  const handleHorarioChange = (raw: string) => {
    const masked = formatTimeInputMask(raw);
    setEvHorario(masked);
    if (!masked.trim() && evLigado) {
      setEvLigado(false);
    }
    if (fieldErrors.horario) {
      setFieldErrors((p) => ({ ...p, horario: false }));
    }
    setFormError(null);
  };

  const handleToggleNotifApp = (nextValue: boolean) => {
    if (nextValue && !usuario?.notificacao_app) {
      setEvNotifApp(false);
      setAccountActivationModal({
        channel: 'app',
        label: 'Barra de Notificações',
      });
      return;
    }
    setEvNotifApp(nextValue);
    if (nextValue) {
      void ensureExpoNotificationPermissions().then((granted) => {
        if (!granted) {
          Alert.alert(
            'Permissão bloqueada',
            'Ative as notificações do PetMood nas configurações do aparelho para exibir lembretes na barra de notificações.',
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
  };

  const handleToggleNotifWhats = (nextValue: boolean) => {
    if (!nextValue) {
      setEvNotifWhats(false);
      return;
    }
    if (!isValidCellPhone(usuario?.celular)) {
      setEvNotifWhats(false);
      setPendingNotifType('whatsapp');
      setPhoneInput(formatPhoneMask(usuario?.celular || ''));
      setPhoneInputError(null);
      setPhonePromptVisible(true);
      return;
    }
    if (!usuario?.notificacao_whatsapp) {
      setEvNotifWhats(false);
      setAccountActivationModal({ channel: 'whatsapp', label: 'WhatsApp' });
      return;
    }
    setEvNotifWhats(true);
  };

  const handleSavePhoneNumber = async () => {
    if (!usuario) return;
    const trimmedPhone = phoneInput.trim();
    if (!isValidCellPhone(trimmedPhone)) {
      setPhoneInputError(INVALID_CELLPHONE_MESSAGE);
      setTimeout(() => phoneInputRef.current?.focus(), 40);
      return;
    }

    setPhoneInputError(null);
    setSaving(true);
    try {
      const updatedUser = await editAccount({
        nome: usuario.nome,
        email: usuario.email,
        celular: trimmedPhone,
        data_nascimento: usuario.data_nascimento,
        genero: usuario.genero,
        foto: usuario.foto,
        notificacao_app: usuario.notificacao_app,
        notificacao_whatsapp: usuario.notificacao_whatsapp,
      });

      const channel = pendingNotifType;
      setPendingNotifType(null);
      setPhonePromptVisible(false);

      if (channel === 'whatsapp') {
        if (updatedUser.notificacao_whatsapp) {
          setEvNotifWhats(true);
        } else {
          setAccountActivationModal({ channel: 'whatsapp', label: 'WhatsApp' });
        }
      }
    } catch (error) {
      setPhoneInputError(
        error instanceof ApiError
          ? error.message
          : 'Não foi possível atualizar seu celular.'
      );
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmAccountActivation = async () => {
    if (!usuario || !accountActivationModal) return;
    const targetChannel = accountActivationModal.channel;
    setSaving(true);
    try {
      await editAccount({
        nome: usuario.nome,
        email: usuario.email,
        celular: usuario.celular,
        data_nascimento: usuario.data_nascimento,
        genero: usuario.genero,
        foto: usuario.foto,
        notificacao_app:
          targetChannel === 'app' ? true : usuario.notificacao_app,
        notificacao_whatsapp:
          targetChannel === 'whatsapp' ? true : usuario.notificacao_whatsapp,
      });
      if (targetChannel === 'app') {
        setEvNotifApp(true);
        void ensureExpoNotificationPermissions();
      } else if (targetChannel === 'whatsapp') {
        setEvNotifWhats(true);
      }
      setAccountActivationModal(null);
    } catch (error) {
      Alert.alert(
        'Erro ao ativar',
        error instanceof ApiError
          ? error.message
          : 'Não foi possível ativar a notificação na sua conta.'
      );
    } finally {
      setSaving(false);
    }
  };

  const handleQuickToggleAlarm = async (alarm: Evento, nextValue: boolean) => {
    if (nextValue && (!alarm.horario || !alarm.horario.trim())) {
      openEditEvent(alarm.id_evento, 'Alarme', true);
      setFieldErrors({ horario: true });
      setFormError('Preencha o campo Horário para ativar e salvar o alarme.');
      setTimeout(() => {
        openNativeTimePicker();
        formScrollRef.current?.scrollTo({ y: 0, animated: true });
      }, 120);
      return;
    }

    try {
      await editEvent({
        id_evento: alarm.id_evento,
        tipo_evento: alarm.tipo_evento,
        animal: alarm.animal,
        titulo: alarm.titulo,
        data: alarm.data,
        horario: alarm.horario,
        local: alarm.local,
        anotacao: alarm.anotacao,
        veterinario: alarm.veterinario,
        alarme_ligado: nextValue,
        frequencia: alarm.frequencia,
        notificacao_app: alarm.notificacao_app,
        notificacao_whatsapp: alarm.notificacao_whatsapp,
      });
    } catch (error) {
      Alert.alert(
        'Erro ao atualizar alarme',
        error instanceof ApiError
          ? error.message
          : 'Não foi possível alterar o status do alarme.'
      );
    }
  };

  const executeSaveEvent = async () => {
    const dateCheck = validateDateInput(evDia, {
      required: true,
      allowFuture: true,
      fieldLabel: 'O dia do evento',
    });
    if (!dateCheck.valid) {
      setFieldErrors((p) => ({ ...p, dia: true }));
      setFormError(dateCheck.error || 'Informe a data no formato dd-mm-aaaa.');
      return;
    }

    const animalRefs: EventoAnimalRef[] = evAnimalIds.map((id) => {
      const found = animais.find((a) => a.id_animal === id);
      return {
        tabela: 'animal',
        id_animal: id,
        nome: found?.nome || 'Pet',
      };
    });

    const selectedType = (evTipo || 'Outro') as TipoEvento;
    const isAlarmType = selectedType === 'Alarme';
    const isVetType =
      selectedType === 'Consulta' || selectedType === 'Vacinação';

    const payload = {
      tipo_evento: selectedType,
      animal: animalRefs,
      titulo: evTitulo.trim(),
      data: dateCheck.iso,
      horario: evHorario.trim(),
      local: isAlarmType ? '' : evLocal.trim(),
      anotacao: evAnotacao.trim(),
      veterinario: isVetType ? evVeterinario.trim() : '',
      alarme_ligado: isAlarmType ? evLigado : false,
      frequencia: isAlarmType ? evFrequencia : '',
      notificacao_app: evNotifApp,
      notificacao_whatsapp: evNotifWhats,
    };

    setSaving(true);
    try {
      if (evId) {
        await editEvent({ ...payload, id_evento: evId });
      } else {
        await addEvent(payload);
      }
      Keyboard.dismiss();
      setFormModalVisible(false);
    } catch (error) {
      Alert.alert(
        'Erro ao salvar',
        error instanceof ApiError
          ? error.message
          : 'Não foi possível salvar o evento.'
      );
    } finally {
      setSaving(false);
    }
  };

  const handleSaveEvent = async () => {
    setFormError(null);

    const trimmedDia = evDia.trim();
    const trimmedHorario = evHorario.trim();
    const dateCheck = validateDateInput(trimmedDia, {
      required: true,
      allowFuture: true,
      fieldLabel: 'A data do evento',
    });

    const tituloErr = !evTitulo.trim();
    const tipoErr = !evTipo;
    const animalErr = evAnimalIds.length === 0;
    const diaErr = !dateCheck.valid;
    const horarioRequiredErr = evTipo === 'Alarme' && !trimmedHorario;
    const isValidTime = (val: string) => {
      if (!/^\d{2}:\d{2}$/.test(val)) return false;
      const [hh, mm] = val.split(':').map(Number);
      return hh >= 0 && hh <= 23 && mm >= 0 && mm <= 59;
    };
    const horarioFormatErr = Boolean(trimmedHorario && !isValidTime(trimmedHorario));
    const horarioErr = horarioRequiredErr || horarioFormatErr;

    if (tituloErr || tipoErr || animalErr || diaErr || horarioErr) {
      setFieldErrors({
        titulo: tituloErr,
        tipo: tipoErr,
        animal: animalErr,
        dia: diaErr,
        horario: horarioErr,
      });

      if (tituloErr || tipoErr || animalErr || !trimmedDia) {
        setFormError(
          horarioRequiredErr
            ? 'Preencha os campos obrigatórios (incluindo Horário do alarme).'
            : 'Preencha os campos obrigatórios destacados em vermelho.'
        );
      } else if (diaErr) {
        setFormError(dateCheck.error || 'Informe uma data válida no formato dd-mm-aaaa.');
      } else if (horarioRequiredErr) {
        setFormError('O campo Horário é obrigatório para salvar o alarme.');
      } else {
        setFormError('Informe um horário válido no formato HH:MM (00:00 a 23:59).');
      }

      formScrollRef.current?.scrollTo({ y: 0, animated: true });
      setTimeout(() => {
        if (tituloErr) {
          tituloInputRef.current?.focus();
        } else if (tipoErr) {
          setPickerKind('tipo');
        } else if (animalErr) {
          setPickerKind('animal');
        } else if (diaErr) {
          diaInputRef.current?.focus();
        } else if (horarioErr) {
          openNativeTimePicker();
        }
        formScrollRef.current?.scrollTo({ y: 0, animated: true });
      }, 40);
      return;
    }

    setFieldErrors({});

    if (evId) {
      setSaveConfirmVisible(true);
      return;
    }

    await executeSaveEvent();
  };

  const handleDeleteEvent = () => {
    if (!evId) return;
    Alert.alert(
      'Confirmar Exclusão',
      'Tem certeza que deseja excluir este registro?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir',
          style: 'destructive',
          onPress: async () => {
            setSaving(true);
            try {
              await removeEvent(evId);
              setFormModalVisible(false);
            } catch (error) {
              Alert.alert(
                'Erro ao excluir',
                error instanceof ApiError
                  ? error.message
                  : 'Não foi possível excluir o evento.'
              );
            } finally {
              setSaving(false);
            }
          },
        },
      ]
    );
  };

  const toggleFormAnimal = (id: string) => {
    setEvAnimalIds((prev) => {
      if (prev.includes(id)) {
        if (prev.length === 1) return prev;
        return prev.filter((item) => item !== id);
      }
      return [...prev, id];
    });
  };

  const selectedFormAnimalNames = evAnimalIds
    .map((id) => animais.find((a) => a.id_animal === id)?.nome || 'Pet')
    .join(', ');

  return (
    <LinearGradient colors={['#FDF8F2', '#F7EDE4']} style={styles.gradient}>
      <View style={styles.screenRoot}>
        <CustomScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.container}>
            <View style={styles.pageHeader}>
              <Text style={styles.pageTitle}>Eventos</Text>
              <Text style={styles.pageSubtitle}>
                Gerencie consultas, vacinas, alarmes e compromissos dos seus
                pets
              </Text>
            </View>

            {/* Controles do Topo */}
            <View style={styles.topControls}>
              <View style={styles.topControlsLeft}>
                <TouchableOpacity
                  activeOpacity={0.85}
                  disabled={isCalendar}
                  onPress={() => setFilterModalVisible(true)}
                  style={[
                    styles.controlBtn,
                    !isCalendar && totalFilters > 0 && styles.controlBtnActive,
                    isCalendar && styles.controlBtnDisabled,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel="Filtrar eventos"
                  accessibilityState={{ disabled: isCalendar }}
                >
                  <Svg
                    width={18}
                    height={18}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke={
                      !isCalendar && totalFilters > 0 ? '#FFFFFF' : '#8A4505'
                    }
                    strokeWidth={2}
                  >
                    <Polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
                  </Svg>
                  {!isCalendar && totalFilters > 0 ? (
                    <View style={styles.filterBadge}>
                      <Text style={styles.filterBadgeText}>{totalFilters}</Text>
                    </View>
                  ) : null}
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                activeOpacity={0.85}
                onPress={toggleViewMode}
                style={[
                  styles.controlBtn,
                  isCalendar && styles.controlBtnActive,
                ]}
                accessibilityRole="button"
                accessibilityLabel={
                  isCalendar ? 'Modo Lista' : 'Modo Calendário'
                }
              >
                <Text
                  style={[
                    styles.controlBtnText,
                    isCalendar && styles.controlBtnTextActive,
                  ]}
                >
                  {isCalendar ? 'Modo Lista' : 'Modo Calendário'}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Visualização 1: Modo Lista */}
            {!isCalendar ? (
              upcomingFilteredEvents.length === 0 ? (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyStateText}>
                    Nenhum evento futuro encontrado.
                  </Text>
                </View>
              ) : (
                <View style={styles.eventsList}>
                  {selectionMode ? (
                    <View style={styles.selectionBar}>
                      <View style={styles.selectionBarTop}>
                        <View style={styles.selectionBarInfo}>
                          <Text style={styles.selectionBarTitle}>
                            {selectedEventIds.length}{' '}
                            {selectedEventIds.length === 1
                              ? 'evento selecionado'
                              : 'eventos selecionados'}
                          </Text>
                          <Text style={styles.selectionBarSubtitle}>
                            Toque nos eventos para selecionar ou desmarcar
                          </Text>
                        </View>
                        <TouchableOpacity
                          activeOpacity={0.85}
                          onPress={exitSelectionMode}
                          style={styles.selectionCancelBtn}
                        >
                          <Text style={styles.selectionCancelText}>Cancelar</Text>
                        </TouchableOpacity>
                      </View>
                      <View style={styles.selectionBarActions}>
                        <TouchableOpacity
                          activeOpacity={0.85}
                          onPress={() => {
                            const allVisibleIds = upcomingFilteredEvents.map(
                              (item) => item.id_evento
                            );
                            const allSelected =
                              allVisibleIds.length > 0 &&
                              allVisibleIds.every((id) =>
                                selectedEventIds.includes(id)
                              );
                            setSelectedEventIds(allSelected ? [] : allVisibleIds);
                          }}
                          style={styles.selectionSecondaryBtn}
                        >
                          <Text style={styles.selectionSecondaryText}>
                            {upcomingFilteredEvents.every((item) =>
                              selectedEventIds.includes(item.id_evento)
                            )
                              ? 'Desmarcar todos'
                              : 'Selecionar todos'}
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          activeOpacity={0.85}
                          disabled={selectedEventIds.length === 0 || deletingBulk}
                          onPress={() => setBulkDeleteConfirmVisible(true)}
                          style={[
                            styles.selectionDeleteBtn,
                            (selectedEventIds.length === 0 || deletingBulk) &&
                              styles.disabledBtn,
                          ]}
                        >
                          <Text style={styles.btnWhiteText}>
                            Excluir ({selectedEventIds.length})
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ) : (
                    <Text style={styles.selectionHintText}>
                      Segure um evento para selecionar vários e excluir de uma vez
                    </Text>
                  )}

                  {upcomingFilteredEvents.map((ev) => {
                    const timeText = ev.horario ? ` às ${ev.horario}` : '';
                    const alarmInfo =
                      ev.tipo_evento === 'Alarme'
                        ? ` • ${
                            ev.alarme_ligado
                              ? '🔔 ' + (ev.frequencia || 'Uma vez')
                              : 'Desligado'
                          }`
                        : '';
                    const localText =
                      ev.tipo_evento !== 'Alarme' && ev.local
                        ? ` • ${ev.local}`
                        : '';
                    const accepted = getAcceptedChannels(ev, usuario);
                    const disabledSelected = getDisabledSelectedChannels(
                      ev,
                      usuario
                    );
                    const isSelected = selectedEventIds.includes(ev.id_evento);

                    return (
                      <TouchableOpacity
                        key={ev.id_evento}
                        activeOpacity={0.85}
                        delayLongPress={400}
                        onLongPress={() => enterSelectionMode(ev.id_evento)}
                        onPress={() => {
                          if (selectionMode) {
                            toggleEventSelection(ev.id_evento);
                          } else {
                            openEditEvent(ev.id_evento, 'Consulta', false);
                          }
                        }}
                        accessibilityState={
                          selectionMode ? { selected: isSelected } : undefined
                        }
                        style={[
                          styles.eventCard,
                          selectionMode && isSelected && styles.eventCardSelected,
                        ]}
                      >
                        {selectionMode ? (
                          <View
                            style={[
                              styles.selectionCheckBox,
                              isSelected && styles.selectionCheckBoxActive,
                            ]}
                          >
                            {isSelected ? (
                              <Text style={styles.selectionCheckMark}>✓</Text>
                            ) : null}
                          </View>
                        ) : null}
                        <View style={styles.eventInfo}>
                          <View style={styles.eventTagRow}>
                            <View style={styles.eventTypeBadge}>
                              <Text style={styles.eventTypeBadgeText}>
                                {ev.tipo_evento}
                              </Text>
                            </View>
                            <Text style={styles.eventPetsNames}>
                              • {getAnimalNames(ev.animal)}
                              {alarmInfo}
                            </Text>
                          </View>
                          <Text style={styles.eventTitle} numberOfLines={1}>
                            {ev.titulo}
                          </Text>
                          <Text style={styles.eventDatetime}>
                            {formatDateBR(ev.data)}
                            {timeText}
                            {localText}
                          </Text>
                          {accepted.length > 0 ? (
                            <Text style={styles.eventNotifChannels}>
                              Avisos (2d/1d/1h/hora):{' '}
                              {accepted
                                .map((c) => (c === 'app' ? 'Barra' : 'WhatsApp'))
                                .join(' • ')}
                            </Text>
                          ) : null}
                          {disabledSelected.length > 0 ? (
                            <Text style={styles.eventNotifDisabledWarning}>
                              Desativado na conta (não irá funcionar):{' '}
                              {disabledSelected
                                .map((c) => (c === 'app' ? 'Barra' : 'WhatsApp'))
                                .join(' • ')}
                            </Text>
                          ) : null}
                        </View>
                        {!selectionMode ? (
                          <Text style={styles.chevron}>&gt;</Text>
                        ) : null}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )
            ) : (
              /* Visualização 2: Modo Calendário */
              <View style={styles.calendarContainer}>
                <View style={styles.calendarHeader}>
                  <TouchableOpacity
                    onPress={handlePrevMonth}
                    style={styles.calNavBtn}
                    accessibilityRole="button"
                    accessibilityLabel="Mês anterior"
                  >
                    <Text style={styles.calNavBtnText}>&lt;</Text>
                  </TouchableOpacity>
                  <Text style={styles.calMonthTitle}>
                    {MONTHS_PT[calMonth]} de {calYear}
                  </Text>
                  <TouchableOpacity
                    onPress={handleNextMonth}
                    style={styles.calNavBtn}
                    accessibilityRole="button"
                    accessibilityLabel="Próximo mês"
                  >
                    <Text style={styles.calNavBtnText}>&gt;</Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.calendarWeekdays}>
                  {WEEKDAYS.map((dayName) => (
                    <View key={dayName} style={styles.weekdayCell}>
                      <Text style={styles.weekdayText}>{dayName}</Text>
                    </View>
                  ))}
                </View>

                <View style={styles.calendarGrid}>
                  {calendarDays.map((cell) => {
                    if (cell.day === null) {
                      return <View key={cell.key} style={styles.calDayCell} />;
                    }
                    return (
                      <TouchableOpacity
                        key={cell.key}
                        activeOpacity={0.8}
                        onPress={() => {
                          if (cell.iso) {
                            setSelectedDayISO(cell.iso);
                            setDayEventsModalVisible(true);
                          }
                        }}
                        style={[
                          styles.calDayCell,
                          cell.hasEvent && styles.calDayHasEvent,
                          cell.isToday && styles.calDayToday,
                        ]}
                      >
                        <Text
                          style={[
                            styles.calDayNumber,
                            cell.hasEvent && styles.calDayNumberEvent,
                            cell.isToday && styles.calDayNumberToday,
                          ]}
                        >
                          {cell.day}
                        </Text>
                        {cell.hasEvent ? <View style={styles.calDot} /> : null}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            )}
          </View>
        </CustomScrollView>

        {/* Botão Flutuante Inferior Esquerdo: Central de Alarmes */}
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => setAlarmsModalVisible(true)}
          style={styles.fabAlarms}
          accessibilityRole="button"
          accessibilityLabel="Ver todos os alarmes"
        >
          <Svg
            width={22}
            height={22}
            viewBox="0 0 24 24"
            fill="none"
            stroke="#D96B08"
            strokeWidth={2.2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <Circle cx="12" cy="13" r="8" />
            <Path d="M12 9v4l2.5 2.5" />
            <Path d="M5 3 2 6" />
            <Path d="m22 6-3-3" />
            <Path d="M6.38 18.7 4 21" />
            <Path d="M17.64 18.67 20 21" />
          </Svg>
          <Text style={styles.fabAlarmsText}>Alarmes</Text>
          <View style={styles.alarmCountBadge}>
            <Text style={styles.alarmCountBadgeText}>{activeAlarmsCount}</Text>
          </View>
        </TouchableOpacity>

        {/* Botão Flutuante Inferior Direito (+) */}
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => openEditEvent(null, '', false)}
          style={styles.fabAdd}
          accessibilityRole="button"
          accessibilityLabel="Novo evento"
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

      {/* Modal 1: Filtros */}
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
              <Text style={styles.modalTitle}>Filtrar Eventos</Text>
              <TouchableOpacity onPress={() => setFilterModalVisible(false)}>
                <Text style={styles.modalClose}>×</Text>
              </TouchableOpacity>
            </View>

            <CustomScrollView shrink style={styles.modalScroll}>
              <View style={styles.filterSection}>
                <Text style={styles.formLabel}>Por Animal</Text>
                <View style={styles.optionList}>
                  {animais.map((a) => {
                    const selected = selectedAnimals.includes(a.id_animal);
                    return (
                      <TouchableOpacity
                        key={a.id_animal}
                        activeOpacity={0.8}
                        onPress={() => toggleFilterAnimal(a.id_animal)}
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

              <View style={styles.filterSection}>
                <Text style={styles.formLabel}>Por Tipo de Evento</Text>
                <View style={styles.optionList}>
                  {EVENT_TYPES.map((type) => {
                    const selected = selectedTypes.includes(type);
                    return (
                      <TouchableOpacity
                        key={type}
                        activeOpacity={0.8}
                        onPress={() => toggleFilterType(type)}
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
                          {type}
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
                  setSelectedAnimals([]);
                  setSelectedTypes([]);
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

      {/* Modal 2: Eventos do Dia (Calendário) */}
      <Modal
        visible={dayEventsModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setDayEventsModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setDayEventsModalVisible(false)}
            accessibilityLabel="Fechar pop-up"
          />
          <View style={styles.modalBox}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                Eventos em {formatDateBR(selectedDayISO)}
              </Text>
              <TouchableOpacity
                onPress={() => setDayEventsModalVisible(false)}
              >
                <Text style={styles.modalClose}>×</Text>
              </TouchableOpacity>
            </View>

            <CustomScrollView shrink style={styles.modalScroll}>
              {dayModalEvents.length === 0 ? (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyStateText}>
                    Nenhum evento neste dia.
                  </Text>
                </View>
              ) : (
                <View style={styles.eventsList}>
                  {dayModalEvents.map((ev) => {
                    const localText =
                      ev.tipo_evento !== 'Alarme' && ev.local
                        ? ` • ${ev.local}`
                        : '';
                    return (
                      <TouchableOpacity
                        key={ev.id_evento}
                        activeOpacity={0.85}
                        onPress={() => {
                          setDayEventsModalVisible(false);
                          openEditEvent(ev.id_evento, 'Consulta', false);
                        }}
                        style={styles.eventCard}
                      >
                        <View style={styles.eventInfo}>
                          <View style={styles.eventTagRow}>
                            <View style={styles.eventTypeBadge}>
                              <Text style={styles.eventTypeBadgeText}>
                                {ev.tipo_evento}
                              </Text>
                            </View>
                            <Text style={styles.eventPetsNames}>
                              • {getAnimalNames(ev.animal)}
                            </Text>
                          </View>
                          <Text style={styles.eventTitle}>{ev.titulo}</Text>
                          <Text style={styles.eventDatetime}>
                            {ev.horario || 'Sem horário'}
                            {localText}
                          </Text>
                        </View>
                        <Text style={styles.editHint}>Editar &gt;</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
            </CustomScrollView>
          </View>
        </View>
      </Modal>

      {/* Modal 3: Central de Alarmes */}
      <Modal
        visible={alarmsModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setAlarmsModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setAlarmsModalVisible(false)}
            accessibilityLabel="Fechar pop-up"
          />
          <View style={styles.modalBox}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Meus Alarmes</Text>
              <TouchableOpacity onPress={() => setAlarmsModalVisible(false)}>
                <Text style={styles.modalClose}>×</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.alarmsSubtitle}>
              Toque em um alarme para editar seus detalhes ou use a chave ao
              lado para ativar/desativar rapidamente.
            </Text>

            <CustomScrollView shrink style={styles.modalScroll}>
              {allAlarms.length === 0 ? (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyStateText}>
                    Nenhum alarme cadastrado ainda. Toque em "+ Novo Alarme"
                    abaixo para criar.
                  </Text>
                </View>
              ) : (
                <View style={styles.eventsList}>
                  {allAlarms.map((alarm) => (
                    <View
                      key={alarm.id_evento}
                      style={[
                        styles.alarmItemCard,
                        !alarm.alarme_ligado && styles.alarmItemCardInactive,
                      ]}
                    >
                      <TouchableOpacity
                        activeOpacity={0.8}
                        onPress={() =>
                          openEditEvent(alarm.id_evento, 'Alarme', true)
                        }
                        style={styles.alarmItemMain}
                      >
                        <Text style={styles.alarmTimeLarge}>
                          {alarm.horario || '--:--'}
                        </Text>
                        <Text style={styles.eventTitle} numberOfLines={1}>
                          {alarm.titulo}
                        </Text>
                        <View style={styles.eventTagRow}>
                          <View style={styles.eventTypeBadge}>
                            <Text style={styles.eventTypeBadgeText}>
                              {alarm.frequencia || 'Uma vez'}
                            </Text>
                          </View>
                          <Text style={styles.eventPetsNames}>
                            • {getAnimalNames(alarm.animal)}
                          </Text>
                        </View>
                      </TouchableOpacity>

                      <Switch
                        value={alarm.alarme_ligado}
                        onValueChange={(val) =>
                          handleQuickToggleAlarm(alarm, val)
                        }
                        trackColor={{ false: '#EBD7C3', true: '#D96B08' }}
                        thumbColor="#FFFFFF"
                        accessibilityLabel={`Ativar alarme ${alarm.titulo}`}
                      />
                    </View>
                  ))}
                </View>
              )}
            </CustomScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => setAlarmsModalVisible(false)}
                style={[styles.footerBtn, styles.btnSecondary]}
              >
                <Text style={styles.btnSecondaryText}>Fechar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => openEditEvent(null, 'Alarme', true)}
                style={[styles.footerBtn, styles.btnPrimary]}
              >
                <Text style={styles.btnWhiteText}>+ Novo Alarme</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal 4: Criar / Editar Evento ou Alarme */}
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
                {evId
                  ? evTipo === 'Alarme'
                    ? 'Editar Alarme'
                    : 'Editar Evento'
                  : evTipo === 'Alarme'
                  ? 'Novo Alarme'
                  : 'Novo Evento'}
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
                  <Text style={styles.formLabel}>Título *</Text>
                  <TextInput
                    ref={tituloInputRef}
                    value={evTitulo}
                    onChangeText={(txt) => {
                      setEvTitulo(txt);
                      if (fieldErrors.titulo) setFieldErrors((p) => ({ ...p, titulo: false }));
                      setFormError(null);
                    }}
                    placeholder="Ex: Retorno veterinário ou Remédio"
                    placeholderTextColor="#9E8A78"
                    style={[
                      styles.formInput,
                      fieldErrors.titulo && styles.inputError,
                    ]}
                  />
                </View>

                <View style={styles.formGroup}>
                  <Text style={styles.formLabel}>Tipo de Evento *</Text>
                  <TouchableOpacity
                    activeOpacity={0.85}
                    disabled={evTipoLocked}
                    onPress={() => {
                      Keyboard.dismiss();
                      setPickerKind('tipo');
                    }}
                    style={[
                      styles.selectBox,
                      evTipoLocked && styles.selectBoxDisabled,
                      fieldErrors.tipo && styles.inputError,
                    ]}
                  >
                    <Text
                      style={[
                        styles.selectValueText,
                        !evTipo && styles.selectPlaceholderText,
                        evTipoLocked && styles.selectValueTextDisabled,
                      ]}
                    >
                      {evTipo || 'Selecione...'}
                    </Text>
                    {!evTipoLocked ? (
                      <Text style={styles.selectChevron}>▾</Text>
                    ) : null}
                  </TouchableOpacity>
                </View>

                <View style={styles.formGroup}>
                  <Text style={styles.formLabel}>Animal *</Text>
                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={() => {
                      Keyboard.dismiss();
                      setPickerKind('animal');
                    }}
                    style={[
                      styles.selectBox,
                      fieldErrors.animal && styles.inputError,
                    ]}
                  >
                    <Text style={styles.selectValueText} numberOfLines={1}>
                      {selectedFormAnimalNames || 'Selecione o animal'}
                    </Text>
                    <Text style={styles.selectChevron}>▾</Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.formRow}>
                  <View style={[styles.formGroup, styles.flex]}>
                    <Text style={styles.formLabel}>Dia *</Text>
                    <TextInput
                      ref={diaInputRef}
                      value={evDia}
                      onChangeText={(txt) => {
                        setEvDia(formatDateInputDDMMYYYY(txt));
                        if (fieldErrors.dia) setFieldErrors((p) => ({ ...p, dia: false }));
                        setFormError(null);
                      }}
                      placeholder="dd-mm-aaaa"
                      placeholderTextColor="#9E8A78"
                      keyboardType="number-pad"
                      maxLength={10}
                      style={[
                        styles.formInput,
                        fieldErrors.dia && styles.inputError,
                      ]}
                    />
                  </View>

                  <View style={[styles.formGroup, styles.flex]}>
                    <Text style={styles.formLabel}>
                      Horário{evTipo === 'Alarme' ? ' *' : ''}
                    </Text>
                    {Platform.OS === 'web' ? (
                      <TextInput
                        ref={horarioInputRef}
                        value={evHorario}
                        onChangeText={handleHorarioChange}
                        placeholder="HH:MM"
                        placeholderTextColor="#9E8A78"
                        keyboardType="number-pad"
                        maxLength={5}
                        style={[
                          styles.formInput,
                          fieldErrors.horario && styles.inputError,
                        ]}
                      />
                    ) : (
                      <View
                        style={[
                          styles.timePickerField,
                          fieldErrors.horario && styles.inputError,
                        ]}
                      >
                        <TouchableOpacity
                          activeOpacity={0.8}
                          onPress={openNativeTimePicker}
                          style={styles.timePickerTouch}
                          accessibilityRole="button"
                          accessibilityLabel="Selecionar horário no relógio do dispositivo"
                        >
                          <Svg
                            width={16}
                            height={16}
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="#D96B08"
                            strokeWidth={2.1}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <Circle cx="12" cy="12" r="9" />
                            <Path d="M12 7v5l3 2" />
                          </Svg>
                          <Text
                            style={[
                              styles.selectValueText,
                              !evHorario && styles.selectPlaceholderText,
                            ]}
                            numberOfLines={1}
                          >
                            {evHorario || 'HH:MM'}
                          </Text>
                        </TouchableOpacity>
                        {evHorario && evTipo !== 'Alarme' ? (
                          <TouchableOpacity
                            onPress={() => handleHorarioChange('')}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            accessibilityLabel="Limpar horário"
                          >
                            <Text style={styles.timeClearBtnText}>×</Text>
                          </TouchableOpacity>
                        ) : null}
                      </View>
                    )}
                  </View>
                </View>

                {/* Condicional: Local (Oculto quando Alarme) */}
                {evTipo !== 'Alarme' ? (
                  <View style={styles.formGroup}>
                    <Text style={styles.formLabel}>Local</Text>
                    <TextInput
                      value={evLocal}
                      onChangeText={setEvLocal}
                      placeholder="Clínica ou endereço"
                      placeholderTextColor="#9E8A78"
                      style={styles.formInput}
                    />
                  </View>
                ) : null}

                {/* Condicional: Veterinário (Apenas Consulta ou Vacinação) */}
                {evTipo === 'Consulta' || evTipo === 'Vacinação' ? (
                  <View style={styles.formGroup}>
                    <Text style={styles.formLabel}>Veterinário</Text>
                    <TextInput
                      value={evVeterinario}
                      onChangeText={setEvVeterinario}
                      placeholder="Nome do profissional"
                      placeholderTextColor="#9E8A78"
                      style={styles.formInput}
                    />
                  </View>
                ) : null}

                {/* Condicional: Alarme (Apenas quando Tipo de Evento === Alarme, sem tipo_alarme) */}
                {evTipo === 'Alarme' ? (
                  <View style={styles.alarmBox}>
                    <View style={styles.formGroup}>
                      <Text style={styles.formLabel}>Frequência</Text>
                      <TouchableOpacity
                        activeOpacity={0.85}
                        onPress={() => {
                          Keyboard.dismiss();
                          setPickerKind('frequencia');
                        }}
                        style={styles.selectBox}
                      >
                        <Text style={styles.selectValueText}>
                          {evFrequencia}
                        </Text>
                        <Text style={styles.selectChevron}>▾</Text>
                      </TouchableOpacity>
                    </View>

                    <View style={styles.switchRow}>
                      <Text style={styles.switchLabel}>Alarme Ligado</Text>
                      <Switch
                        value={evLigado}
                        onValueChange={handleToggleEvLigado}
                        trackColor={{ false: '#EBD7C3', true: '#D96B08' }}
                        thumbColor="#FFFFFF"
                      />
                    </View>
                    <Text style={styles.reminderSubtitle}>
                      No horário configurado, o alarme toca no aplicativo e também dispara notificações nos canais aceitos abaixo.
                    </Text>
                  </View>
                ) : null}

                <View style={styles.formGroup}>
                  <Text style={styles.formLabel}>Anotação</Text>
                  <TextInput
                    value={evAnotacao}
                    onChangeText={setEvAnotacao}
                    placeholder="Observações importantes..."
                    placeholderTextColor="#9E8A78"
                    multiline
                    numberOfLines={2}
                    textAlignVertical="top"
                    style={[styles.formInput, styles.formTextarea]}
                  />
                </View>

                {/* Notificações */}
                <View style={styles.notifSwitchBlock}>
                  <View style={styles.switchRow}>
                    <View style={styles.switchLabelWrap}>
                      <Text style={styles.switchLabel}>
                        Barra de Notificações (Celular)
                      </Text>
                      {!usuario?.notificacao_app && !evNotifApp ? (
                        <Text style={styles.notifStatusTag}>
                          (Desativada na conta — não irá funcionar)
                        </Text>
                      ) : null}
                    </View>
                    <Switch
                      value={evNotifApp}
                      onValueChange={handleToggleNotifApp}
                      trackColor={{ false: '#EBD7C3', true: '#D96B08' }}
                      thumbColor="#FFFFFF"
                    />
                  </View>
                  {evNotifApp && !usuario?.notificacao_app ? (
                    <View style={styles.notifDisabledBanner}>
                      <Text style={styles.notifDisabledBannerText}>
                        Desativada nas configurações — esta notificação não irá funcionar até ser reativada.
                      </Text>
                    </View>
                  ) : null}
                </View>

                <View style={styles.notifSwitchBlock}>
                  <View style={styles.switchRow}>
                    <View style={styles.switchLabelWrap}>
                      <Text style={styles.switchLabel}>Aviso por WhatsApp</Text>
                      {!evNotifWhats && !isValidCellPhone(usuario?.celular) ? (
                        <Text style={styles.notifStatusTag}>
                          (Requer celular cadastrado)
                        </Text>
                      ) : !evNotifWhats && !usuario?.notificacao_whatsapp ? (
                        <Text style={styles.notifStatusTag}>
                          (Desativado na conta — não irá funcionar)
                        </Text>
                      ) : null}
                    </View>
                    <Switch
                      value={evNotifWhats}
                      onValueChange={handleToggleNotifWhats}
                      trackColor={{ false: '#EBD7C3', true: '#D96B08' }}
                      thumbColor="#FFFFFF"
                    />
                  </View>
                  {evNotifWhats && !isValidCellPhone(usuario?.celular) ? (
                    <View style={styles.notifDisabledBanner}>
                      <Text style={styles.notifDisabledBannerText}>
                        Celular não cadastrado ou inválido — esta notificação não irá funcionar até cadastrar um celular válido.
                      </Text>
                    </View>
                  ) : evNotifWhats && !usuario?.notificacao_whatsapp ? (
                    <View style={styles.notifDisabledBanner}>
                      <Text style={styles.notifDisabledBannerText}>
                        Desativada nas configurações — esta notificação não irá funcionar até ser reativada.
                      </Text>
                    </View>
                  ) : null}
                </View>
              </View>
            </CustomScrollView>

            <View style={styles.modalFooter}>
              {evId ? (
                <TouchableOpacity
                  activeOpacity={0.85}
                  disabled={saving}
                  onPress={handleDeleteEvent}
                  style={[styles.footerBtn, styles.btnDanger]}
                >
                  <Text style={styles.btnWhiteText}>Excluir</Text>
                </TouchableOpacity>
              ) : null}
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
                onPress={handleSaveEvent}
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

      {/* Submodal Picker: Tipo de Evento, Animal ou Frequência */}
      <Modal
        visible={pickerKind !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setPickerKind(null)}
      >
        <View style={styles.modalOverlay}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setPickerKind(null)}
            accessibilityLabel="Fechar pop-up"
          />
          <View style={[styles.modalBox, styles.smallModalBox]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {pickerKind === 'tipo'
                  ? 'Tipo de Evento'
                  : pickerKind === 'animal'
                  ? 'Selecionar Animal'
                  : 'Frequência'}
              </Text>
              <TouchableOpacity onPress={() => setPickerKind(null)}>
                <Text style={styles.modalClose}>×</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.optionList}>
              {pickerKind === 'tipo' &&
                EVENT_TYPES.map((type) => {
                  const selected = evTipo === type;
                  return (
                    <TouchableOpacity
                      key={type}
                      activeOpacity={0.8}
                      onPress={() => handleSelectTipoEvento(type)}
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
                        {type}
                      </Text>
                      <Text style={styles.optionCheck}>
                        {selected ? '✓' : ''}
                      </Text>
                    </TouchableOpacity>
                  );
                })}

              {pickerKind === 'animal' &&
                animais.map((pet) => {
                  const selected = evAnimalIds.includes(pet.id_animal);
                  return (
                    <TouchableOpacity
                      key={pet.id_animal}
                      activeOpacity={0.8}
                      onPress={() => toggleFormAnimal(pet.id_animal)}
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
                        {pet.nome}
                      </Text>
                      <Text style={styles.optionCheck}>
                        {selected ? '✓' : ''}
                      </Text>
                    </TouchableOpacity>
                  );
                })}

              {pickerKind === 'frequencia' &&
                FREQUENCIA_OPTIONS.map((freq) => {
                  const selected = evFrequencia === freq;
                  return (
                    <TouchableOpacity
                      key={freq}
                      activeOpacity={0.8}
                      onPress={() => {
                        setEvFrequencia(freq);
                        setPickerKind(null);
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
                        {freq}
                      </Text>
                      <Text style={styles.optionCheck}>
                        {selected ? '✓' : ''}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
            </View>

            {pickerKind === 'animal' ? (
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => setPickerKind(null)}
                style={styles.btnPrimarySingle}
              >
                <Text style={styles.btnWhiteText}>Concluir</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      </Modal>

      {/* Modal 5: Ativar Função na Conta */}
      <Modal
        visible={accountActivationModal !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setAccountActivationModal(null)}
      >
        <View style={styles.modalOverlay}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => {
              if (!saving) setAccountActivationModal(null);
            }}
            accessibilityLabel="Fechar pop-up"
          />
          <View style={[styles.modalBox, styles.smallModalBox]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Ativar Função na Conta</Text>
              <TouchableOpacity
                disabled={saving}
                onPress={() => setAccountActivationModal(null)}
              >
                <Text style={styles.modalClose}>×</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.modalMessage}>
              A função de notificações via{' '}
              <Text style={styles.boldText}>{accountActivationModal?.label}</Text>{' '}
              está desativada na sua conta de usuário e será ativada agora ao
              confirmar.
            </Text>
            <View style={styles.modalFooter}>
              <TouchableOpacity
                activeOpacity={0.85}
                disabled={saving}
                onPress={() => setAccountActivationModal(null)}
                style={[styles.footerBtn, styles.btnSecondary]}
              >
                <Text style={styles.btnSecondaryText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                activeOpacity={0.85}
                disabled={saving}
                onPress={() => void handleConfirmAccountActivation()}
                style={[styles.footerBtn, styles.btnPrimary]}
              >
                {saving ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.btnWhiteText}>Ativar e Continuar</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal 6: Cadastrar Celular */}
      <Modal
        visible={phonePromptVisible}
        transparent
        statusBarTranslucent
        animationType="fade"
        onRequestClose={() => {
          Keyboard.dismiss();
          setPhonePromptVisible(false);
          setPhoneInputError(null);
          setPendingNotifType(null);
        }}
      >
        <KeyboardAwareModalOverlay
          cardStyle={[styles.modalBox, styles.smallModalBox, styles.keyboardModalBox]}
          onBackdropPress={() => {
            if (!saving) {
              setPhonePromptVisible(false);
              setPhoneInputError(null);
              setPendingNotifType(null);
            }
          }}
        >
          <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Celular Obrigatório</Text>
              <TouchableOpacity
                disabled={saving}
                onPress={() => {
                  setPhonePromptVisible(false);
                  setPhoneInputError(null);
                  setPendingNotifType(null);
                }}
              >
                <Text style={styles.modalClose}>×</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.modalMessage}>
              Para ativar notificações via{' '}
              <Text style={styles.boldText}>WhatsApp</Text>
              , é necessário cadastrar um número de telefone válido com 8 ou 9 dígitos no formato
              (DD) XXXX-XXXX ou (DD) 9XXXX-XXXX:
            </Text>
            {phoneInputError ? (
              <View style={styles.errorBanner}>
                <Text style={styles.errorBannerText}>{phoneInputError}</Text>
              </View>
            ) : null}
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Número de Celular com DDD *</Text>
              <TextInput
                ref={phoneInputRef}
                value={phoneInput}
                onChangeText={(txt) => {
                  setPhoneInput(formatPhoneMask(txt));
                  if (phoneInputError) setPhoneInputError(null);
                }}
                placeholder="(11) 99999-9999"
                placeholderTextColor="#9E8A78"
                keyboardType="phone-pad"
                maxLength={15}
                style={[
                  styles.formInput,
                  Boolean(phoneInputError) && styles.inputError,
                ]}
              />
            </View>
            <View style={styles.modalFooter}>
              <TouchableOpacity
                activeOpacity={0.85}
                disabled={saving}
                onPress={() => {
                  setPhonePromptVisible(false);
                  setPhoneInputError(null);
                  setPendingNotifType(null);
                }}
                style={[styles.footerBtn, styles.btnSecondary]}
              >
                <Text style={styles.btnSecondaryText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                activeOpacity={0.85}
                disabled={saving}
                onPress={handleSavePhoneNumber}
                style={[styles.footerBtn, styles.btnPrimary]}
              >
                {saving ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.btnWhiteText}>Salvar Número</Text>
                )}
              </TouchableOpacity>
            </View>
        </KeyboardAwareModalOverlay>
      </Modal>

      {/* Modal 7: Horário Obrigatório para Alarme Ligado */}
      <Modal
        visible={timeAlertVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setTimeAlertVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setTimeAlertVisible(false)}
            accessibilityLabel="Fechar pop-up"
          />
          <View style={[styles.modalBox, styles.smallModalBox]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Horário Necessário</Text>
              <TouchableOpacity onPress={() => setTimeAlertVisible(false)}>
                <Text style={styles.modalClose}>×</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.modalMessage}>
              Para ativar a função{' '}
              <Text style={styles.boldText}>Alarme Ligado</Text>, preencha
              primeiro o campo de <Text style={styles.boldText}>Horário</Text>{' '}
              do alarme.
            </Text>
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => {
                setTimeAlertVisible(false);
                setTimeout(() => openNativeTimePicker(), 120);
              }}
              style={styles.btnPrimarySingle}
            >
              <Text style={styles.btnWhiteText}>Preencher Horário</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Modal 8: Confirmação antes de Salvar Edição */}
      <Modal
        visible={saveConfirmVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setSaveConfirmVisible(false)}
      >
        <View style={styles.modalOverlay}>
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
            <Text style={styles.modalMessage}>
              Tem certeza que deseja salvar as modificações feitas neste{' '}
              {evTipo === 'Alarme' ? 'alarme' : 'evento'}?
            </Text>
            <View style={styles.modalFooter}>
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => setSaveConfirmVisible(false)}
                style={[styles.footerBtn, styles.btnSecondary]}
              >
                <Text style={styles.btnSecondaryText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                activeOpacity={0.85}
                disabled={saving}
                onPress={() => {
                  setSaveConfirmVisible(false);
                  void executeSaveEvent();
                }}
                style={[styles.footerBtn, styles.btnPrimary]}
              >
                <Text style={styles.btnWhiteText}>Confirmar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal 9: Confirmação de Exclusão em Lote */}
      <Modal
        visible={bulkDeleteConfirmVisible}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (!deletingBulk) setBulkDeleteConfirmVisible(false);
        }}
      >
        <View style={styles.modalOverlay}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => {
              if (!deletingBulk) setBulkDeleteConfirmVisible(false);
            }}
            accessibilityLabel="Fechar pop-up"
          />
          <View style={[styles.modalBox, styles.smallModalBox]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Excluir Eventos</Text>
              <TouchableOpacity
                disabled={deletingBulk}
                onPress={() => setBulkDeleteConfirmVisible(false)}
              >
                <Text style={styles.modalClose}>×</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.modalMessage}>
              Tem certeza que deseja excluir{' '}
              <Text style={styles.boldText}>
                {selectedEventIds.length === 1
                  ? '1 evento selecionado'
                  : `${selectedEventIds.length} eventos selecionados`}
              </Text>
              ? Esta ação não pode ser desfeita.
            </Text>
            <View style={styles.modalFooter}>
              <TouchableOpacity
                activeOpacity={0.85}
                disabled={deletingBulk}
                onPress={() => setBulkDeleteConfirmVisible(false)}
                style={[styles.footerBtn, styles.btnSecondary]}
              >
                <Text style={styles.btnSecondaryText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                activeOpacity={0.85}
                disabled={deletingBulk}
                onPress={handleConfirmBulkDelete}
                style={[styles.footerBtn, styles.btnDanger]}
              >
                {deletingBulk ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.btnWhiteText}>
                    Excluir ({selectedEventIds.length})
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      {/* Relógio nativo do dispositivo (Android) */}
      {timePickerVisible && Platform.OS === 'android' ? (
        <DateTimePicker
          value={parseHHMMToDate(evHorario)}
          mode="time"
          is24Hour
          display="clock"
          onChange={handleNativeTimeChange}
        />
      ) : null}

      {/* Relógio nativo do dispositivo (iOS) */}
      {Platform.OS === 'ios' ? (
        <Modal
          visible={timePickerVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setTimePickerVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <Pressable
              style={StyleSheet.absoluteFill}
              onPress={() => setTimePickerVisible(false)}
              accessibilityLabel="Fechar seletor de horário"
            />
            <View style={[styles.modalBox, styles.smallModalBox]}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Selecionar Horário</Text>
                <TouchableOpacity onPress={() => setTimePickerVisible(false)}>
                  <Text style={styles.modalClose}>×</Text>
                </TouchableOpacity>
              </View>
              <DateTimePicker
                value={iosTempTime}
                mode="time"
                is24Hour
                display="spinner"
                locale="pt-BR"
                onChange={handleNativeTimeChange}
              />
              <View style={styles.modalFooter}>
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={() => setTimePickerVisible(false)}
                  style={[styles.footerBtn, styles.btnSecondary]}
                >
                  <Text style={styles.btnSecondaryText}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={handleConfirmIosTime}
                  style={[styles.footerBtn, styles.btnPrimary]}
                >
                  <Text style={styles.btnWhiteText}>Confirmar</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      ) : null}
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
  flex: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: 24,
    paddingBottom: 96,
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
    gap: 8,
  },
  topControlsLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
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
  controlBtnDisabled: {
    opacity: 0.42,
    elevation: 0,
  },
  controlBtnText: {
    fontSize: 13,
    fontFamily: 'PlusJakartaSans_700Bold',
    color: '#8A4505',
  },
  controlBtnTextActive: {
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
  eventsList: {
    gap: 12,
  },
  selectionHintText: {
    fontSize: 11.5,
    fontFamily: 'PlusJakartaSans_500Medium',
    color: '#B8651B',
    opacity: 0.85,
    textAlign: 'center',
  },
  selectionBar: {
    backgroundColor: '#FFF8F1',
    borderWidth: 2,
    borderColor: '#D96B08',
    borderRadius: 16,
    padding: 12,
    gap: 10,
  },
  selectionBarTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  selectionBarInfo: {
    flex: 1,
  },
  selectionBarTitle: {
    fontSize: 13.5,
    fontFamily: 'PlusJakartaSans_700Bold',
    color: '#8A4505',
  },
  selectionBarSubtitle: {
    fontSize: 11.5,
    fontFamily: 'PlusJakartaSans_400Regular',
    color: '#B8651B',
  },
  selectionCancelBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#EBD7C3',
    backgroundColor: '#FFFFFF',
  },
  selectionCancelText: {
    fontSize: 12,
    fontFamily: 'PlusJakartaSans_700Bold',
    color: '#8A4505',
  },
  selectionBarActions: {
    flexDirection: 'row',
    gap: 8,
  },
  selectionSecondaryBtn: {
    flex: 1,
    height: 38,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#EBD7C3',
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  selectionSecondaryText: {
    fontSize: 12,
    fontFamily: 'PlusJakartaSans_700Bold',
    color: '#8A4505',
  },
  selectionDeleteBtn: {
    flex: 1,
    height: 38,
    borderRadius: 999,
    backgroundColor: '#E63946',
    justifyContent: 'center',
    alignItems: 'center',
  },
  eventCard: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#EBD7C3',
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    shadowColor: '#8A4505',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  eventCardSelected: {
    backgroundColor: '#FFF3E6',
    borderWidth: 2,
    borderColor: '#D96B08',
  },
  selectionCheckBox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#D6B89A',
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  selectionCheckBoxActive: {
    backgroundColor: '#D96B08',
    borderColor: '#D96B08',
  },
  selectionCheckMark: {
    color: '#FFFFFF',
    fontSize: 14,
    fontFamily: 'PlusJakartaSans_700Bold',
  },
  eventInfo: {
    flex: 1,
    gap: 4,
  },
  eventTagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  eventTypeBadge: {
    backgroundColor: '#FFF3E6',
    borderWidth: 1,
    borderColor: '#F0DFCE',
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 999,
  },
  eventTypeBadgeText: {
    fontSize: 11,
    fontFamily: 'PlusJakartaSans_700Bold',
    color: '#D96B08',
  },
  eventPetsNames: {
    fontSize: 12,
    fontFamily: 'PlusJakartaSans_600SemiBold',
    color: '#B8651B',
  },
  eventTitle: {
    fontSize: 16,
    fontFamily: 'PlusJakartaSans_700Bold',
    color: '#6E3906',
  },
  eventDatetime: {
    fontSize: 13,
    fontFamily: 'PlusJakartaSans_500Medium',
    color: '#8A4505',
  },
  eventNotifChannels: {
    fontSize: 11,
    fontFamily: 'PlusJakartaSans_600SemiBold',
    color: '#B8651B',
  },
  eventNotifDisabledWarning: {
    fontSize: 11,
    fontFamily: 'PlusJakartaSans_600SemiBold',
    color: '#C92A2A',
  },
  chevron: {
    fontSize: 16,
    fontFamily: 'PlusJakartaSans_700Bold',
    color: '#D96B08',
  },
  editHint: {
    fontSize: 12,
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
  calendarContainer: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#EBD7C3',
    borderRadius: 18,
    padding: 16,
    shadowColor: '#8A4505',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  calendarHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  calNavBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#EBD7C3',
    backgroundColor: '#FFFDFB',
    justifyContent: 'center',
    alignItems: 'center',
  },
  calNavBtnText: {
    fontSize: 16,
    fontFamily: 'PlusJakartaSans_700Bold',
    color: '#8A4505',
  },
  calMonthTitle: {
    fontSize: 15,
    fontFamily: 'PlusJakartaSans_700Bold',
    color: '#8A4505',
    textTransform: 'capitalize',
  },
  calendarWeekdays: {
    flexDirection: 'row',
    marginBottom: 6,
  },
  weekdayCell: {
    width: '14.285%',
    alignItems: 'center',
    paddingBottom: 4,
  },
  weekdayText: {
    fontSize: 11.5,
    fontFamily: 'PlusJakartaSans_700Bold',
    color: '#B8651B',
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  calDayCell: {
    width: '14.285%',
    aspectRatio: 1,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  calDayHasEvent: {
    backgroundColor: '#FFF3E6',
  },
  calDayToday: {
    borderColor: '#D96B08',
  },
  calDayNumber: {
    fontSize: 13,
    fontFamily: 'PlusJakartaSans_600SemiBold',
    color: '#6E3906',
  },
  calDayNumberEvent: {
    color: '#D96B08',
    fontFamily: 'PlusJakartaSans_700Bold',
  },
  calDayNumberToday: {
    fontFamily: 'PlusJakartaSans_700Bold',
  },
  calDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#D96B08',
    marginTop: 2,
  },
  fabAlarms: {
    position: 'absolute',
    bottom: 20,
    left: 20,
    height: 54,
    paddingHorizontal: 18,
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#D96B08',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    shadowColor: '#8A4505',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 6,
  },
  fabAlarmsText: {
    fontSize: 14,
    fontFamily: 'PlusJakartaSans_700Bold',
    color: '#8A4505',
  },
  alarmCountBadge: {
    backgroundColor: '#D96B08',
    minWidth: 20,
    height: 20,
    paddingHorizontal: 6,
    borderRadius: 999,
    justifyContent: 'center',
    alignItems: 'center',
  },
  alarmCountBadgeText: {
    color: '#FFFFFF',
    fontSize: 11.5,
    fontFamily: 'PlusJakartaSans_700Bold',
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
  modalBox: {
    width: '100%',
    maxWidth: 360,
    maxHeight: '88%',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#F0DFCE',
    padding: 20,
    gap: 12,
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
  modalMessage: {
    fontSize: 14,
    fontFamily: 'PlusJakartaSans_400Regular',
    color: '#8A4505',
    lineHeight: 20,
  },
  boldText: {
    fontFamily: 'PlusJakartaSans_700Bold',
  },
  alarmsSubtitle: {
    fontSize: 12.5,
    fontFamily: 'PlusJakartaSans_400Regular',
    color: '#B8651B',
    lineHeight: 18,
  },
  alarmItemCard: {
    width: '100%',
    backgroundColor: '#FFFDFB',
    borderWidth: 1.5,
    borderColor: '#EBD7C3',
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  alarmItemCardInactive: {
    opacity: 0.68,
    backgroundColor: '#F9F4EF',
  },
  alarmItemMain: {
    flex: 1,
    gap: 3,
  },
  alarmTimeLarge: {
    fontSize: 20,
    fontFamily: 'PlusJakartaSans_700Bold',
    color: '#8A4505',
    lineHeight: 24,
  },
  filterSection: {
    gap: 6,
    marginBottom: 12,
  },
  formStack: {
    gap: 10,
    paddingBottom: 14,
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
  },
  errorBannerText: {
    fontSize: 12.5,
    fontFamily: 'PlusJakartaSans_600SemiBold',
    color: '#C92A2A',
    textAlign: 'center',
  },
  formTextarea: {
    minHeight: 68,
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
  selectBoxDisabled: {
    backgroundColor: '#F5EBE1',
    opacity: 0.85,
  },
  selectValueText: {
    fontSize: 14,
    fontFamily: 'PlusJakartaSans_400Regular',
    color: '#6E3906',
    flex: 1,
  },
  selectPlaceholderText: {
    color: '#9E8A78',
  },
  selectValueTextDisabled: {
    color: '#8A4505',
    fontFamily: 'PlusJakartaSans_700Bold',
  },
  selectChevron: {
    fontSize: 14,
    color: '#B8651B',
    marginLeft: 6,
  },
  timePickerField: {
    minHeight: 40,
    backgroundColor: '#FFFDFB',
    borderWidth: 1.5,
    borderColor: '#EBD7C3',
    borderRadius: 10,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  timePickerTouch: {
    flex: 1,
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  timeClearBtnText: {
    fontSize: 18,
    color: '#B8651B',
    fontFamily: 'PlusJakartaSans_700Bold',
    lineHeight: 20,
    paddingHorizontal: 2,
  },
  alarmBox: {
    backgroundColor: '#FFF8F1',
    borderWidth: 1,
    borderColor: '#F0DFCE',
    borderRadius: 12,
    padding: 12,
    gap: 10,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  switchLabelWrap: {
    flex: 1,
    marginRight: 8,
  },
  switchLabel: {
    fontSize: 13,
    fontFamily: 'PlusJakartaSans_600SemiBold',
    color: '#6E3906',
  },
  notifSwitchBlock: {
    gap: 5,
  },
  notifStatusTag: {
    fontSize: 11,
    fontFamily: 'PlusJakartaSans_600SemiBold',
    color: '#B8651B',
    marginTop: 1,
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
    fontSize: 11,
    fontFamily: 'PlusJakartaSans_600SemiBold',
    color: '#C92A2A',
    lineHeight: 15,
  },
  optionList: {
    gap: 6,
  },
  optionItem: {
    paddingVertical: 9,
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
  modalFooter: {
    flexDirection: 'row',
    gap: 8,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F0DFCE',
  },
  footerBtn: {
    flex: 1,
    height: 40,
    borderRadius: 999,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  btnPrimary: {
    backgroundColor: '#D96B08',
  },
  btnPrimarySingle: {
    width: '100%',
    height: 42,
    borderRadius: 999,
    backgroundColor: '#D96B08',
    justifyContent: 'center',
    alignItems: 'center',
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
    fontSize: 12.5,
    fontFamily: 'PlusJakartaSans_700Bold',
    textAlign: 'center',
  },
  btnSecondaryText: {
    color: '#8A4505',
    fontSize: 12.5,
    fontFamily: 'PlusJakartaSans_700Bold',
    textAlign: 'center',
  },
  disabledBtn: {
    opacity: 0.5,
  },
});

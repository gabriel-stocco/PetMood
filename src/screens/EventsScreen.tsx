import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../context/AppContext';
import { ApiError } from '../services/api';
import {
  getAcceptedChannels,
  getBrowserNotificationPermission,
  getDisabledSelectedChannels,
  requestBrowserNotificationPermission,
  type BrowserNotificationPermissionState,
} from '../services/eventNotifications';
import type {
  Evento,
  EventoAnimalRef,
  FrequenciaAlarme,
  TipoEvento,
} from '../types';
import { CustomScrollArea, type CustomScrollAreaHandle } from '../components/CustomScrollbar';
import { KeyboardAwareModal } from '../components/KeyboardAwareModal';
import {
  formatPhoneMask,
  INVALID_CELLPHONE_MESSAGE,
  isValidCellPhone,
} from '../utils/phone';
import {
  formatDateDisplay,
  formatDateInputDDMMYYYY,
  getTodayDisplay,
  getTodayISO,
  toDisplayDate,
  toISODate,
  validateDateInput,
} from '../utils/date';

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
  return formatDateDisplay(isoDate, '');
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
  const [calYear, setCalYear] = useState(now.getFullYear());
  const [calMonth, setCalMonth] = useState(now.getMonth());

  const [filterModalVisible, setFilterModalVisible] = useState(false);
  const [dayEventsModalVisible, setDayEventsModalVisible] = useState(false);
  const [selectedDayISO, setSelectedDayISO] = useState(getTodayISO());
  const [alarmsModalVisible, setAlarmsModalVisible] = useState(false);
  const [formModalVisible, setFormModalVisible] = useState(false);

  const [browserPerm, setBrowserPerm] = useState<BrowserNotificationPermissionState>(() =>
    getBrowserNotificationPermission()
  );

  const [accountActivationModal, setAccountActivationModal] = useState<{
    channel: 'app' | 'whatsapp';
    label: string;
  } | null>(null);
  const [phonePromptVisible, setPhonePromptVisible] = useState(false);
  const [phoneInput, setPhoneInput] = useState('');
  const [phoneInputError, setPhoneInputError] = useState<string | null>(null);
  const [pendingNotifType, setPendingNotifType] = useState<'whatsapp' | null>(null);
  const [timeAlertVisible, setTimeAlertVisible] = useState(false);
  const [saveConfirmVisible, setSaveConfirmVisible] = useState(false);
  const [noticeModal, setNoticeModal] = useState<{ title: string; message: string } | null>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedEventIds, setSelectedEventIds] = useState<string[]>([]);
  const [bulkDeleteConfirmVisible, setBulkDeleteConfirmVisible] = useState(false);
  const [deletingBulk, setDeletingBulk] = useState(false);

  const [evId, setEvId] = useState('');
  const [evTitulo, setEvTitulo] = useState('');
  const [evTipo, setEvTipo] = useState<TipoEvento | ''>('');
  const [evTipoLocked, setEvTipoLocked] = useState(false);
  const [evAnimalIds, setEvAnimalIds] = useState<string[]>([]);
  const [evDia, setEvDia] = useState(getTodayDisplay());
  const [evHorario, setEvHorario] = useState('');
  const [evLocal, setEvLocal] = useState('');
  const [evVeterinario, setEvVeterinario] = useState('');
  const [evFrequencia, setEvFrequencia] = useState<Exclude<FrequenciaAlarme, ''>>('Uma vez');
  const [evLigado, setEvLigado] = useState(false);
  const [evAnotacao, setEvAnotacao] = useState('');
  const [evNotifApp, setEvNotifApp] = useState(false);
  const [evNotifWhats, setEvNotifWhats] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{
    titulo?: boolean;
    tipo?: boolean;
    animais?: boolean;
    dia?: boolean;
    horario?: boolean;
  }>({});

  const tituloRef = useRef<HTMLInputElement | null>(null);
  const tipoRef = useRef<HTMLSelectElement | null>(null);
  const firstAnimalBtnRef = useRef<HTMLButtonElement | null>(null);
  const diaRef = useRef<HTMLInputElement | null>(null);
  const horarioRef = useRef<HTMLInputElement | null>(null);
  const phoneInputRef = useRef<HTMLInputElement | null>(null);
  const formScrollRef = useRef<CustomScrollAreaHandle | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressOriginRef = useRef<{ x: number; y: number } | null>(null);
  const longPressTriggeredIdRef = useRef<string | null>(null);
  const longPressResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const todayISO = getTodayISO();
  const isCalendar = viewMode === 'calendar';
  const totalFilters = selectedAnimals.length + selectedTypes.length;

  const clearLongPressTimer = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    longPressOriginRef.current = null;
  };

  const handleCardPointerEnd = () => {
    clearLongPressTimer();
    if (longPressTriggeredIdRef.current) {
      if (longPressResetTimerRef.current) {
        clearTimeout(longPressResetTimerRef.current);
      }
      longPressResetTimerRef.current = setTimeout(() => {
        longPressTriggeredIdRef.current = null;
        longPressResetTimerRef.current = null;
      }, 250);
    }
  };

  useEffect(() => {
    return () => {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
      }
      if (longPressResetTimerRef.current) {
        clearTimeout(longPressResetTimerRef.current);
      }
    };
  }, []);

  const exitSelectionMode = () => {
    clearLongPressTimer();
    setSelectionMode(false);
    setSelectedEventIds([]);
    setBulkDeleteConfirmVisible(false);
  };

  const enterSelectionMode = (eventId: string) => {
    setSelectionMode(true);
    setSelectedEventIds((prev) => (prev.includes(eventId) ? prev : [...prev, eventId]));
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      try {
        navigator.vibrate(25);
      } catch {
        // Ignore vibrate errors
      }
    }
  };

  const toggleEventSelection = (eventId: string) => {
    setSelectedEventIds((prev) =>
      prev.includes(eventId) ? prev.filter((id) => id !== eventId) : [...prev, eventId]
    );
  };

  const handleCardPointerDown = (
    e: React.PointerEvent<HTMLButtonElement>,
    eventId: string
  ) => {
    if (selectionMode) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    clearLongPressTimer();
    longPressTriggeredIdRef.current = null;
    longPressOriginRef.current = { x: e.clientX, y: e.clientY };
    longPressTimerRef.current = setTimeout(() => {
      longPressTimerRef.current = null;
      longPressTriggeredIdRef.current = eventId;
      enterSelectionMode(eventId);
    }, 450);
  };

  const handleCardPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!longPressOriginRef.current || !longPressTimerRef.current) return;
    const dx = e.clientX - longPressOriginRef.current.x;
    const dy = e.clientY - longPressOriginRef.current.y;
    if (Math.hypot(dx, dy) > 10) {
      clearLongPressTimer();
    }
  };

  const handleCardClick = (eventId: string) => {
    clearLongPressTimer();
    if (longPressTriggeredIdRef.current === eventId) {
      longPressTriggeredIdRef.current = null;
      if (longPressResetTimerRef.current) {
        clearTimeout(longPressResetTimerRef.current);
        longPressResetTimerRef.current = null;
      }
      return;
    }
    longPressTriggeredIdRef.current = null;
    if (selectionMode) {
      toggleEventSelection(eventId);
      return;
    }
    openEditEvent(eventId, 'Consulta', false);
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
      setNoticeModal({
        title: 'Erro ao excluir',
        message:
          error instanceof ApiError
            ? error.message
            : 'Não foi possível excluir todos os eventos selecionados.',
      });
    } finally {
      setDeletingBulk(false);
    }
  };

  const getAnimalNames = (refs: EventoAnimalRef[]) => {
    if (!refs || refs.length === 0) return 'Pet';
    return refs
      .map((ref) => animais.find((a) => a.id_animal === ref.id_animal)?.nome || ref.nome || 'Pet')
      .join(', ');
  };

  const upcomingFilteredEvents = useMemo(() => {
    return eventos
      .filter((ev) => {
        const matchType = selectedTypes.length === 0 || selectedTypes.includes(ev.tipo_evento);
        const petIds = (ev.animal || []).map((a) => a.id_animal);
        const matchAnimal =
          selectedAnimals.length === 0 || petIds.some((id) => selectedAnimals.includes(id));
        return matchType && matchAnimal && ev.data >= todayISO;
      })
      .sort((a, b) =>
        `${a.data}T${a.horario || '00:00'}`.localeCompare(`${b.data}T${b.horario || '00:00'}`)
      );
  }, [eventos, selectedAnimals, selectedTypes, todayISO]);

  const allAlarms = useMemo(
    () =>
      eventos
        .filter((ev) => ev.tipo_evento === 'Alarme')
        .sort((a, b) => (a.horario || '99:99').localeCompare(b.horario || '99:99')),
    [eventos]
  );

  const activeAlarmsCount = useMemo(
    () => allAlarms.filter((a) => a.alarme_ligado).length,
    [allAlarms]
  );

  const calendarDays = useMemo(() => {
    const firstDay = new Date(calYear, calMonth, 1);
    const lastDay = new Date(calYear, calMonth + 1, 0);
    const cells: { key: string; day: number | null; iso?: string; hasEvent?: boolean; isToday?: boolean }[] = [];

    for (let i = 0; i < firstDay.getDay(); i++) {
      cells.push({ key: `empty-${i}`, day: null });
    }
    for (let d = 1; d <= lastDay.getDate(); d++) {
      const iso = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(d).padStart(
        2,
        '0'
      )}`;
      cells.push({
        key: iso,
        day: d,
        iso,
        hasEvent: eventos.some((ev) => ev.data === iso),
        isToday: iso === todayISO,
      });
    }
    return cells;
  }, [calMonth, calYear, eventos, todayISO]);

  const dayModalEvents = useMemo(
    () => eventos.filter((ev) => ev.data === selectedDayISO),
    [eventos, selectedDayISO]
  );

  const openEditEvent = (
    eventId: string | null = null,
    defaultType: TipoEvento | '' = '',
    forceAlarmType = false
  ) => {
    if (animais.length === 0) {
      setNoticeModal({
        title: 'Cadastre um animal primeiro',
        message: 'Você precisa ter pelo menos um pet cadastrado para criar um evento.',
      });
      return;
    }

    if (eventId) {
      const ev = eventos.find((i) => i.id_evento === eventId);
      if (!ev) return;
      const finalType: TipoEvento = forceAlarmType ? 'Alarme' : ev.tipo_evento;
      setEvId(ev.id_evento);
      setEvTitulo(ev.titulo);
      setEvTipo(finalType);
      setEvTipoLocked(forceAlarmType);
      setEvAnimalIds(
        ev.animal?.length ? ev.animal.map((a) => a.id_animal) : [animais[0].id_animal]
      );
      setEvDia(toDisplayDate(ev.data));
      setEvHorario(ev.horario || '');
      setEvLocal(finalType === 'Alarme' ? '' : ev.local || '');
      setEvVeterinario(
        finalType === 'Consulta' || finalType === 'Vacinação' ? ev.veterinario || '' : ''
      );
      setEvFrequencia((ev.frequencia as Exclude<FrequenciaAlarme, ''>) || 'Uma vez');
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
    setFormError(null);
    setFieldErrors({});
    setFormModalVisible(true);
  };

  const handleQuickToggleAlarm = async (alarm: Evento, nextValue: boolean) => {
    if (nextValue && (!alarm.horario || !alarm.horario.trim())) {
      openEditEvent(alarm.id_evento, 'Alarme', true);
      setFieldErrors({ horario: true });
      setFormError('Preencha o campo Horário para ativar e salvar o alarme.');
      setTimeout(() => {
        horarioRef.current?.focus({ preventScroll: true });
        formScrollRef.current?.scrollToTop();
      }, 80);
      return;
    }
    await editEvent({ ...alarm, alarme_ligado: nextValue });
  };

  const executeSaveEvent = async () => {
    const animalRefs: EventoAnimalRef[] = evAnimalIds.map((id) => ({
      tabela: 'animal',
      id_animal: id,
      nome: animais.find((a) => a.id_animal === id)?.nome || 'Pet',
    }));

    const selectedType = (evTipo || 'Outro') as TipoEvento;
    const isAlarm = selectedType === 'Alarme';
    const isVet = selectedType === 'Consulta' || selectedType === 'Vacinação';
    const diaISO = toISODate(evDia) || evDia.trim();

    const payload = {
      tipo_evento: selectedType,
      animal: animalRefs,
      titulo: evTitulo.trim(),
      data: diaISO,
      horario: evHorario.trim(),
      local: isAlarm ? '' : evLocal.trim(),
      anotacao: evAnotacao.trim(),
      veterinario: isVet ? evVeterinario.trim() : '',
      alarme_ligado: isAlarm ? evLigado : false,
      frequencia: isAlarm ? evFrequencia : '',
      notificacao_app: evNotifApp,
      notificacao_whatsapp: evNotifWhats,
    };

    setSaving(true);
    try {
      if (evId) await editEvent({ ...payload, id_evento: evId });
      else await addEvent(payload);
      setFormModalVisible(false);
    } catch (error) {
      setNoticeModal({
        title: 'Erro ao salvar',
        message: error instanceof ApiError ? error.message : 'Erro ao salvar evento.',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleSaveEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const tituloErr = !evTitulo.trim();
    const tipoErr = !evTipo;
    const animaisErr = evAnimalIds.length === 0;
    const diaCheck = validateDateInput(evDia, {
      required: true,
      allowFuture: true,
      fieldLabel: 'A data do evento',
    });
    const diaErr = !diaCheck.valid;
    const horarioErr = evTipo === 'Alarme' && !evHorario.trim();

    if (tituloErr || tipoErr || animaisErr || diaErr || horarioErr) {
      setFieldErrors({
        titulo: tituloErr,
        tipo: tipoErr,
        animais: animaisErr,
        dia: diaErr,
        horario: horarioErr,
      });
      if (diaErr && !tituloErr && !tipoErr && !animaisErr && !horarioErr) {
        setFormError(diaCheck.error || 'Informe uma data válida no formato dd-mm-aaaa.');
      } else if (horarioErr && !tituloErr && !tipoErr && !animaisErr && !diaErr) {
        setFormError('O campo Horário é obrigatório para salvar o alarme.');
      } else if (horarioErr) {
        setFormError('Preencha os campos obrigatórios destacados em vermelho (incluindo Horário).');
      } else {
        setFormError(
          diaErr && diaCheck.error
            ? diaCheck.error
            : 'Preencha todos os campos obrigatórios destacados em vermelho.'
        );
      }
      formScrollRef.current?.scrollToTop();
      setTimeout(() => {
        if (tituloErr) {
          tituloRef.current?.focus({ preventScroll: true });
        } else if (tipoErr) {
          tipoRef.current?.focus({ preventScroll: true });
        } else if (animaisErr) {
          firstAnimalBtnRef.current?.focus({ preventScroll: true });
        } else if (diaErr) {
          diaRef.current?.focus({ preventScroll: true });
        } else if (horarioErr) {
          horarioRef.current?.focus({ preventScroll: true });
        }
        formScrollRef.current?.scrollToTop();
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
      const updatedUser = await editAccount({ ...usuario, celular: trimmedPhone });
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
        error instanceof ApiError ? error.message : 'Não foi possível salvar o celular.'
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
        ...usuario,
        notificacao_app: targetChannel === 'app' ? true : usuario.notificacao_app,
        notificacao_whatsapp:
          targetChannel === 'whatsapp' ? true : usuario.notificacao_whatsapp,
      });
      if (targetChannel === 'app') {
        setEvNotifApp(true);
        if (getBrowserNotificationPermission() === 'default') {
          void requestBrowserNotificationPermission().then(setBrowserPerm);
        }
      } else if (targetChannel === 'whatsapp') {
        setEvNotifWhats(true);
      }
      setAccountActivationModal(null);
    } catch (error) {
      setNoticeModal({
        title: 'Erro ao ativar',
        message:
          error instanceof ApiError
            ? error.message
            : 'Não foi possível ativar a notificação na sua conta.',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleRequestBrowserPermission = async () => {
    const perm = await requestBrowserNotificationPermission();
    setBrowserPerm(perm);
  };

  return (
    <div className="relative w-full max-w-[390px] mx-auto px-5 py-6 pb-24 flex flex-col gap-4 min-h-full">
      <div className="text-center">
        <h1 className="text-[22px] font-bold text-[#8A4505] mb-1">Eventos</h1>
        <p className="text-[13.5px] text-[#B8651B]">
          Gerencie consultas, vacinas, alarmes e compromissos dos seus pets
        </p>
      </div>

      {/* Permissão da Barra de Notificações do Dispositivo */}
      {browserPerm === 'default' && usuario?.notificacao_app && (
        <div className="bg-[#FFF8F1] border border-[#F0DFCE] rounded-xl p-3 flex items-center justify-between gap-2.5">
          <p className="text-[12px] text-[#8A4505] leading-snug">
            Ative a barra de notificações do dispositivo para alertas de 2d, 1d, 1h e na hora do evento.
          </p>
          <button
            type="button"
            onClick={handleRequestBrowserPermission}
            className="shrink-0 px-3 py-1.5 rounded-lg bg-[#D96B08] text-white text-[11.5px] font-bold"
          >
            Ativar
          </button>
        </div>
      )}
      {browserPerm === 'denied' && usuario?.notificacao_app && (
        <div className="bg-[#FFF8F1] border border-[#F0DFCE] rounded-xl p-3">
          <p className="text-[12px] text-[#8A4505] leading-snug">
            Notificações na barra do dispositivo estão bloqueadas neste navegador. Libere nas permissões do site para receber alertas fora da tela do app.
          </p>
        </div>
      )}

      {/* Controles do Topo */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={isCalendar}
            onClick={() => setFilterModalVisible(true)}
            aria-label="Filtrar eventos"
            className={`relative h-11 min-w-[44px] px-3 rounded-xl border-[1.5px] flex items-center justify-center transition-all ${
              isCalendar
                ? 'opacity-40 cursor-not-allowed bg-white border-[#EBD7C3] text-[#8A4505]'
                : totalFilters > 0
                ? 'bg-[#D96B08] border-[#D96B08] text-white'
                : 'bg-white border-[#EBD7C3] text-[#8A4505]'
            }`}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
            </svg>
            {!isCalendar && totalFilters > 0 && (
              <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-[#6E3906] text-white text-[11px] font-bold flex items-center justify-center">
                {totalFilters}
              </span>
            )}
          </button>
        </div>

        <button
          type="button"
          onClick={() =>
            setViewMode((prev) => {
              const next = prev === 'list' ? 'calendar' : 'list';
              if (next === 'calendar') {
                setFilterModalVisible(false);
                exitSelectionMode();
              }
              return next;
            })
          }
          className={`h-11 px-3.5 rounded-xl border-[1.5px] text-[13px] font-bold transition-colors ${
            isCalendar
              ? 'bg-[#D96B08] border-[#D96B08] text-white'
              : 'bg-white border-[#EBD7C3] text-[#8A4505]'
          }`}
        >
          {isCalendar ? 'Modo Lista' : 'Modo Calendário'}
        </button>
      </div>

      {/* Lista ou Calendário */}
      {!isCalendar ? (
        upcomingFilteredEvents.length === 0 ? (
          <div className="bg-white border-[1.5px] border-dashed border-[#EBD7C3] rounded-2xl p-7 text-center">
            <p className="text-[14px] font-medium text-[#B8651B]">
              Nenhum evento futuro encontrado.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {selectionMode ? (
              <div
                data-testid="event-selection-bar"
                className="bg-[#FFF8F1] border-2 border-[#D96B08] rounded-2xl p-3 flex flex-col gap-2.5 shadow-[0_6px_16px_rgba(217,107,8,0.14)]"
              >
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-[13.5px] font-bold text-[#8A4505]">
                      {selectedEventIds.length}{' '}
                      {selectedEventIds.length === 1 ? 'evento selecionado' : 'eventos selecionados'}
                    </p>
                    <p className="text-[11.5px] text-[#B8651B]">
                      Toque nos eventos abaixo para selecionar ou desmarcar
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={exitSelectionMode}
                    className="px-2.5 py-1 rounded-lg border border-[#EBD7C3] bg-white text-[#8A4505] text-[12px] font-bold"
                  >
                    Cancelar
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const allVisibleIds = upcomingFilteredEvents.map((item) => item.id_evento);
                      const allSelected =
                        allVisibleIds.length > 0 &&
                        allVisibleIds.every((id) => selectedEventIds.includes(id));
                      setSelectedEventIds(allSelected ? [] : allVisibleIds);
                    }}
                    className="flex-1 h-9 rounded-full border border-[#EBD7C3] bg-white text-[#8A4505] text-[12px] font-bold"
                  >
                    {upcomingFilteredEvents.every((item) =>
                      selectedEventIds.includes(item.id_evento)
                    )
                      ? 'Desmarcar todos'
                      : 'Selecionar todos'}
                  </button>
                  <button
                    type="button"
                    disabled={selectedEventIds.length === 0 || deletingBulk}
                    onClick={() => setBulkDeleteConfirmVisible(true)}
                    className="flex-1 h-9 rounded-full bg-[#E63946] text-white text-[12px] font-bold disabled:opacity-45"
                  >
                    Excluir ({selectedEventIds.length})
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-[11.5px] font-medium text-[#B8651B]/85 text-center -mt-1">
                Segure um evento para selecionar vários e excluir de uma vez
              </p>
            )}

            {upcomingFilteredEvents.map((ev) => {
              const accepted = getAcceptedChannels(ev, usuario);
              const disabledSelected = getDisabledSelectedChannels(ev, usuario);
              const isSelected = selectedEventIds.includes(ev.id_evento);
              return (
                <button
                  key={ev.id_evento}
                  type="button"
                  data-testid={`event-card-${ev.id_evento}`}
                  data-selected={isSelected ? 'true' : 'false'}
                  aria-pressed={selectionMode ? isSelected : undefined}
                  onPointerDown={(e) => handleCardPointerDown(e, ev.id_evento)}
                  onPointerMove={handleCardPointerMove}
                  onPointerUp={handleCardPointerEnd}
                  onPointerLeave={handleCardPointerEnd}
                  onPointerCancel={handleCardPointerEnd}
                  onContextMenu={(e) => e.preventDefault()}
                  onClick={() => handleCardClick(ev.id_evento)}
                  className={`w-full rounded-2xl p-3.5 flex items-center justify-between gap-3 text-left select-none transition-all shadow-[0_3px_10px_rgba(138,69,5,0.05)] ${
                    selectionMode && isSelected
                      ? 'bg-[#FFF3E6] border-2 border-[#D96B08]'
                      : 'bg-white border-[1.5px] border-[#EBD7C3] hover:border-[#D96B08]'
                  }`}
                >
                  {selectionMode && (
                    <span
                      aria-hidden="true"
                      className={`w-6 h-6 rounded-md border-2 flex items-center justify-center shrink-0 transition-colors ${
                        isSelected
                          ? 'bg-[#D96B08] border-[#D96B08] text-white'
                          : 'bg-white border-[#D6B89A] text-transparent'
                      }`}
                    >
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    </span>
                  )}
                  <div className="flex-1 min-w-0 flex flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="px-2 py-0.5 rounded-md bg-[#FFF3E6] border border-[#F0DFCE] text-[#D96B08] text-[11px] font-bold">
                        {ev.tipo_evento}
                      </span>
                      <span className="text-[12px] font-semibold text-[#B8651B]">
                        • {getAnimalNames(ev.animal)}
                        {ev.tipo_evento === 'Alarme'
                          ? ` • ${ev.alarme_ligado ? `🔔 ${ev.frequencia || 'Uma vez'}` : 'Desligado'}`
                          : ''}
                      </span>
                    </div>
                    <p className="text-[15.5px] font-bold text-[#6E3906] truncate">{ev.titulo}</p>
                    <p className="text-[12.5px] font-medium text-[#8A4505]">
                      {formatDateBR(ev.data)}
                      {ev.horario ? ` às ${ev.horario}` : ''}
                      {ev.tipo_evento !== 'Alarme' && ev.local ? ` • ${ev.local}` : ''}
                    </p>
                    {accepted.length > 0 && (
                      <p className="text-[11px] font-semibold text-[#B8651B]">
                        Avisos (2d/1d/1h/hora):{' '}
                        {accepted.map((c) => (c === 'app' ? 'Barra' : 'WhatsApp')).join(' • ')}
                      </p>
                    )}
                    {disabledSelected.length > 0 && (
                      <p
                        data-testid={`event-card-disabled-notifs-${ev.id_evento}`}
                        className="text-[11px] font-semibold text-[#C92A2A]"
                      >
                        Desativado na conta (não irá funcionar):{' '}
                        {disabledSelected
                          .map((c) => (c === 'app' ? 'Barra' : 'WhatsApp'))
                          .join(' • ')}
                      </p>
                    )}
                  </div>
                  {!selectionMode && <span className="text-[#D96B08] font-bold">&gt;</span>}
                </button>
              );
            })}
          </div>
        )
      ) : (
        <div className="bg-white border-[1.5px] border-[#EBD7C3] rounded-[18px] p-4 shadow-[0_4px_12px_rgba(138,69,5,0.05)]">
          <div className="flex items-center justify-between mb-3.5">
            <button
              type="button"
              onClick={() => {
                if (calMonth === 0) {
                  setCalMonth(11);
                  setCalYear((y) => y - 1);
                } else setCalMonth((m) => m - 1);
              }}
              className="w-8 h-8 rounded-lg border border-[#EBD7C3] bg-[#FFFDFB] font-bold text-[#8A4505]"
            >
              &lt;
            </button>
            <h3 className="text-[15px] font-bold text-[#8A4505] capitalize">
              {MONTHS_PT[calMonth]} de {calYear}
            </h3>
            <button
              type="button"
              onClick={() => {
                if (calMonth === 11) {
                  setCalMonth(0);
                  setCalYear((y) => y + 1);
                } else setCalMonth((m) => m + 1);
              }}
              className="w-8 h-8 rounded-lg border border-[#EBD7C3] bg-[#FFFDFB] font-bold text-[#8A4505]"
            >
              &gt;
            </button>
          </div>

          <div className="grid grid-cols-7 text-center mb-1.5">
            {WEEKDAYS.map((w) => (
              <span key={w} className="text-[11.5px] font-bold text-[#B8651B]">
                {w}
              </span>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {calendarDays.map((cell) =>
              cell.day === null ? (
                <div key={cell.key} />
              ) : (
                <button
                  key={cell.key}
                  type="button"
                  onClick={() => {
                    if (cell.iso) {
                      setSelectedDayISO(cell.iso);
                      setDayEventsModalVisible(true);
                    }
                  }}
                  className={`aspect-square rounded-lg flex flex-col items-center justify-center border text-[13px] font-semibold ${
                    cell.hasEvent
                      ? 'bg-[#FFF3E6] text-[#D96B08] font-bold'
                      : 'text-[#6E3906]'
                  } ${cell.isToday ? 'border-[#D96B08]' : 'border-transparent'}`}
                >
                  <span>{cell.day}</span>
                  {cell.hasEvent && <span className="w-1.5 h-1.5 rounded-full bg-[#D96B08] mt-0.5" />}
                </button>
              )
            )}
          </div>
        </div>
      )}

      {/* Botões Flutuantes Inferiores */}
      <div className="fixed bottom-[86px] inset-x-0 z-40 pointer-events-none">
        <div className="w-full max-w-[390px] mx-auto px-5 flex items-center justify-between">
          <button
            type="button"
            onClick={() => setAlarmsModalVisible(true)}
            className="pointer-events-auto h-[52px] px-4 rounded-full bg-white border-2 border-[#D96B08] shadow-lg flex items-center gap-2"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#D96B08" strokeWidth="2.2">
              <circle cx="12" cy="13" r="8" />
              <path d="M12 9v4l2.5 2.5" />
              <path d="M5 3 2 6" />
              <path d="m22 6-3-3" />
            </svg>
            <span className="text-[13.5px] font-bold text-[#8A4505]">Alarmes</span>
            <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-[#D96B08] text-white text-[11px] font-bold flex items-center justify-center">
              {activeAlarmsCount}
            </span>
          </button>

          <button
            type="button"
            onClick={() => openEditEvent(null, '', false)}
            aria-label="Novo evento"
            className="pointer-events-auto w-[52px] h-[52px] rounded-full bg-[#D96B08] text-white shadow-lg flex items-center justify-center shrink-0"
          >
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Modal Filtros */}
      {filterModalVisible && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) setFilterModalVisible(false);
          }}
          className="fixed inset-0 z-50 bg-[#281402]/45 flex items-center justify-center p-4"
        >
          <div className="w-full max-w-[350px] bg-white rounded-[20px] border border-[#F0DFCE] p-5 flex flex-col gap-3 max-h-[85vh]">
            <div className="flex justify-between items-center pb-2 border-b border-[#F0DFCE]">
              <h3 className="text-[17px] font-bold text-[#8A4505]">Filtrar Eventos</h3>
              <button type="button" onClick={() => setFilterModalVisible(false)} className="text-2xl text-[#B8651B]">×</button>
            </div>
            <CustomScrollArea
              outerClassName="flex-1 min-h-0 flex flex-col"
              className="flex-1 min-h-0 flex flex-col gap-3"
            >
              <div>
                <p className="text-[13px] font-semibold text-[#8A4505] mb-1.5">Por Animal</p>
                <div className="flex flex-col gap-1.5">
                  {animais.map((a) => {
                    const selected = selectedAnimals.includes(a.id_animal);
                    return (
                      <button
                        key={a.id_animal}
                        type="button"
                        onClick={() =>
                          setSelectedAnimals((p) =>
                            p.includes(a.id_animal)
                              ? p.filter((i) => i !== a.id_animal)
                              : [...p, a.id_animal]
                          )
                        }
                        className={`px-3 py-2 rounded-xl border flex justify-between text-[13.5px] font-semibold ${
                          selected ? 'bg-[#FFF3E6] border-[#D96B08] text-[#D96B08]' : 'border-[#EBD7C3] text-[#6E3906]'
                        }`}
                      >
                        <span>{a.nome}</span>
                        <span>{selected ? '✓' : ''}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <p className="text-[13px] font-semibold text-[#8A4505] mb-1.5">Por Tipo</p>
                <div className="flex flex-col gap-1.5">
                  {EVENT_TYPES.map((type) => {
                    const selected = selectedTypes.includes(type);
                    return (
                      <button
                        key={type}
                        type="button"
                        onClick={() =>
                          setSelectedTypes((p) =>
                            p.includes(type) ? p.filter((i) => i !== type) : [...p, type]
                          )
                        }
                        className={`px-3 py-2 rounded-xl border flex justify-between text-[13.5px] font-semibold ${
                          selected ? 'bg-[#FFF3E6] border-[#D96B08] text-[#D96B08]' : 'border-[#EBD7C3] text-[#6E3906]'
                        }`}
                      >
                        <span>{type}</span>
                        <span>{selected ? '✓' : ''}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </CustomScrollArea>
            <div className="shrink-0 grid grid-cols-2 gap-2 pt-2 border-t border-[#F0DFCE]">
              <button
                type="button"
                onClick={() => {
                  setSelectedAnimals([]);
                  setSelectedTypes([]);
                }}
                className="h-10 rounded-full border border-[#EBD7C3] text-[#8A4505] text-[13px] font-bold"
              >
                Limpar
              </button>
              <button
                type="button"
                onClick={() => setFilterModalVisible(false)}
                className="h-10 rounded-full bg-[#D96B08] text-white text-[13px] font-bold"
              >
                Concluir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Eventos do Dia */}
      {dayEventsModalVisible && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) setDayEventsModalVisible(false);
          }}
          className="fixed inset-0 z-50 bg-[#281402]/45 flex items-center justify-center p-4"
        >
          <div className="w-full max-w-[350px] bg-white rounded-[20px] border border-[#F0DFCE] p-5 flex flex-col gap-3 max-h-[85vh]">
            <div className="flex justify-between items-center pb-2 border-b border-[#F0DFCE]">
              <h3 className="text-[16px] font-bold text-[#8A4505]">
                Eventos em {formatDateBR(selectedDayISO)}
              </h3>
              <button type="button" onClick={() => setDayEventsModalVisible(false)} className="text-2xl text-[#B8651B]">×</button>
            </div>
            <CustomScrollArea
              outerClassName="flex-1 min-h-0 flex flex-col"
              className="flex-1 min-h-0 flex flex-col gap-2.5"
            >
              {dayModalEvents.length === 0 ? (
                <p className="text-center py-6 text-[13.5px] text-[#B8651B]">
                  Nenhum evento neste dia.
                </p>
              ) : (
                dayModalEvents.map((ev) => (
                  <button
                    key={ev.id_evento}
                    type="button"
                    onClick={() => {
                      setDayEventsModalVisible(false);
                      openEditEvent(ev.id_evento, 'Consulta', false);
                    }}
                    className="w-full border border-[#EBD7C3] rounded-xl p-3 text-left flex justify-between items-center"
                  >
                    <div>
                      <span className="text-[11px] font-bold text-[#D96B08]">
                        {ev.tipo_evento} • {getAnimalNames(ev.animal)}
                      </span>
                      <p className="text-[14.5px] font-bold text-[#6E3906]">{ev.titulo}</p>
                      <p className="text-[12px] text-[#8A4505]">
                        {ev.horario || 'Sem horário'}
                        {ev.tipo_evento !== 'Alarme' && ev.local ? ` • ${ev.local}` : ''}
                      </p>
                    </div>
                    <span className="text-[12px] font-bold text-[#D96B08]">Editar &gt;</span>
                  </button>
                ))
              )}
            </CustomScrollArea>
          </div>
        </div>
      )}

      {/* Central de Alarmes */}
      {alarmsModalVisible && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) setAlarmsModalVisible(false);
          }}
          className="fixed inset-0 z-50 bg-[#281402]/45 flex items-center justify-center p-4"
        >
          <div className="w-full max-w-[350px] bg-white rounded-[20px] border border-[#F0DFCE] p-5 flex flex-col gap-3 max-h-[85vh]">
            <div className="flex justify-between items-center pb-2 border-b border-[#F0DFCE]">
              <h3 className="text-[17px] font-bold text-[#8A4505]">Meus Alarmes</h3>
              <button type="button" onClick={() => setAlarmsModalVisible(false)} className="text-2xl text-[#B8651B]">×</button>
            </div>
            <p className="text-[12px] text-[#B8651B]">
              Toque em um alarme para editar ou use o seletor para ligar/desligar rapidamente.
            </p>
            <CustomScrollArea
              outerClassName="flex-1 min-h-0 flex flex-col"
              className="flex-1 min-h-0 flex flex-col gap-2.5"
            >
              {allAlarms.length === 0 ? (
                <p className="text-center py-6 text-[13.5px] text-[#B8651B]">
                  Nenhum alarme cadastrado ainda.
                </p>
              ) : (
                allAlarms.map((alarm) => (
                  <div
                    key={alarm.id_evento}
                    className={`border-[1.5px] border-[#EBD7C3] rounded-2xl p-3 flex items-center justify-between gap-2 ${
                      !alarm.alarme_ligado ? 'opacity-65 bg-[#F9F4EF]' : 'bg-[#FFFDFB]'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => openEditEvent(alarm.id_evento, 'Alarme', true)}
                      className="flex-1 text-left"
                    >
                      <p className="text-[19px] font-bold text-[#8A4505]">
                        {alarm.horario || '--:--'}
                      </p>
                      <p className="text-[14px] font-bold text-[#6E3906] truncate">{alarm.titulo}</p>
                      <p className="text-[11.5px] font-semibold text-[#D96B08]">
                        {alarm.frequencia || 'Uma vez'} • {getAnimalNames(alarm.animal)}
                      </p>
                    </button>
                    <input
                      type="checkbox"
                      checked={alarm.alarme_ligado}
                      onChange={(e) => handleQuickToggleAlarm(alarm, e.target.checked)}
                      className="w-5 h-5 accent-[#D96B08] cursor-pointer"
                    />
                  </div>
                ))
              )}
            </CustomScrollArea>
            <div className="shrink-0 grid grid-cols-2 gap-2 pt-2 border-t border-[#F0DFCE]">
              <button
                type="button"
                onClick={() => setAlarmsModalVisible(false)}
                className="h-10 rounded-full border border-[#EBD7C3] text-[#8A4505] text-[13px] font-bold"
              >
                Fechar
              </button>
              <button
                type="button"
                onClick={() => openEditEvent(null, 'Alarme', true)}
                className="h-10 rounded-full bg-[#D96B08] text-white text-[13px] font-bold"
              >
                + Novo Alarme
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Criar / Editar Evento ou Alarme */}
      {formModalVisible && (
        <KeyboardAwareModal
          zIndexClassName="z-[55]"
          onBackdropClick={() => {
            if (!saving) setFormModalVisible(false);
          }}
        >
          <form
            noValidate
            onSubmit={handleSaveEvent}
            className="w-full max-w-[360px] max-h-full bg-white rounded-[20px] border border-[#F0DFCE] p-5 flex flex-col gap-3"
          >
            <div className="shrink-0 flex justify-between items-center pb-2 border-b border-[#F0DFCE]">
              <h3 className="text-[17px] font-bold text-[#8A4505]">
                {evId
                  ? evTipo === 'Alarme'
                    ? 'Editar Alarme'
                    : 'Editar Evento'
                  : evTipo === 'Alarme'
                  ? 'Novo Alarme'
                  : 'Novo Evento'}
              </h3>
              <button type="button" onClick={() => setFormModalVisible(false)} className="text-2xl text-[#B8651B]">×</button>
            </div>

            {formError && (
              <div className="shrink-0 bg-[#FFF5F5] border border-[#F8CACA] rounded-xl px-3 py-2 text-[12.5px] font-semibold text-[#C92A2A] text-center">
                {formError}
              </div>
            )}

            <CustomScrollArea
              ref={formScrollRef}
              outerClassName="flex-1 min-h-0 flex flex-col"
              className="flex-1 min-h-0 flex flex-col gap-2.5 pr-0.5"
            >
              <div className="flex flex-col gap-1">
                <label className="text-[12.5px] font-semibold text-[#8A4505]">Título *</label>
                <input
                  ref={tituloRef}
                  type="text"
                  value={evTitulo}
                  onChange={(e) => {
                    setEvTitulo(e.target.value);
                    if (fieldErrors.titulo) setFieldErrors((p) => ({ ...p, titulo: false }));
                    setFormError(null);
                  }}
                  placeholder="Ex: Retorno veterinário"
                  aria-invalid={Boolean(fieldErrors.titulo)}
                  className={`h-10 bg-[#FFFDFB] rounded-lg px-3 text-[14px] text-[#6E3906] focus:outline-none ${
                    fieldErrors.titulo
                      ? 'border-[2.5px] border-[#E63946] focus:border-[#E63946]'
                      : 'border-[1.5px] border-[#EBD7C3] focus:border-[#D96B08]'
                  }`}
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[12.5px] font-semibold text-[#8A4505]">Tipo de Evento *</label>
                <select
                  ref={tipoRef}
                  disabled={evTipoLocked}
                  value={evTipo}
                  aria-invalid={Boolean(fieldErrors.tipo)}
                  onChange={(e) => {
                    const nextType = e.target.value as TipoEvento | '';
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
                    if (nextType !== 'Consulta' && nextType !== 'Vacinação') setEvVeterinario('');
                    if (fieldErrors.tipo) setFieldErrors((p) => ({ ...p, tipo: false }));
                    setFieldErrors((p) => ({ ...p, horario: false }));
                    setFormError(null);
                  }}
                  className={`h-10 bg-[#FFFDFB] rounded-lg px-3 text-[14px] focus:outline-none disabled:bg-[#F5EBE1] ${
                    evTipo ? 'text-[#6E3906]' : 'text-[#9E8A78]'
                  } ${
                    fieldErrors.tipo
                      ? 'border-[2.5px] border-[#E63946] focus:border-[#E63946]'
                      : 'border-[1.5px] border-[#EBD7C3] focus:border-[#D96B08]'
                  }`}
                >
                  <option value="">Selecione...</option>
                  {EVENT_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[12.5px] font-semibold text-[#8A4505]">Animais *</label>
                <div
                  className={`flex flex-wrap gap-1.5 rounded-lg p-1.5 ${
                    fieldErrors.animais
                      ? 'border-[2.5px] border-[#E63946] bg-[#FFF5F5]'
                      : 'border-[1.5px] border-transparent p-0'
                  }`}
                >
                  {animais.map((pet, idx) => {
                    const selected = evAnimalIds.includes(pet.id_animal);
                    return (
                      <button
                        key={pet.id_animal}
                        ref={idx === 0 ? firstAnimalBtnRef : undefined}
                        type="button"
                        onClick={() => {
                          setEvAnimalIds((prev) =>
                            prev.includes(pet.id_animal)
                              ? prev.length === 1
                                ? prev
                                : prev.filter((id) => id !== pet.id_animal)
                              : [...prev, pet.id_animal]
                          );
                          if (fieldErrors.animais) setFieldErrors((p) => ({ ...p, animais: false }));
                          setFormError(null);
                        }}
                        className={`px-2.5 py-1 rounded-md border text-[12px] font-semibold ${
                          selected
                            ? 'bg-[#D96B08] border-[#D96B08] text-white'
                            : 'bg-white border-[#EBD7C3] text-[#6E3906]'
                        }`}
                      >
                        {pet.nome}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="flex flex-col gap-1">
                  <label className="text-[12.5px] font-semibold text-[#8A4505]">Dia *</label>
                  <input
                    ref={diaRef}
                    type="text"
                    inputMode="numeric"
                    maxLength={10}
                    placeholder="dd-mm-aaaa"
                    value={evDia}
                    onChange={(e) => {
                      setEvDia(formatDateInputDDMMYYYY(e.target.value));
                      if (fieldErrors.dia) setFieldErrors((p) => ({ ...p, dia: false }));
                      setFormError(null);
                    }}
                    aria-invalid={Boolean(fieldErrors.dia)}
                    className={`h-10 bg-[#FFFDFB] rounded-lg px-2.5 text-[13px] text-[#6E3906] focus:outline-none ${
                      fieldErrors.dia
                        ? 'border-[2.5px] border-[#E63946] focus:border-[#E63946]'
                        : 'border-[1.5px] border-[#EBD7C3] focus:border-[#D96B08]'
                    }`}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[12.5px] font-semibold text-[#8A4505]">
                    Horário{evTipo === 'Alarme' ? ' *' : ''}
                  </label>
                  <input
                    ref={horarioRef}
                    type="time"
                    value={evHorario}
                    onClick={(e) => {
                      try {
                        e.currentTarget.showPicker?.();
                      } catch {
                        // Ignore unsupported showPicker environments
                      }
                    }}
                    onChange={(e) => {
                      setEvHorario(e.target.value);
                      if (!e.target.value && evLigado) setEvLigado(false);
                      if (fieldErrors.horario) setFieldErrors((p) => ({ ...p, horario: false }));
                      setFormError(null);
                    }}
                    aria-invalid={Boolean(fieldErrors.horario)}
                    className={`h-10 bg-[#FFFDFB] rounded-lg px-2.5 text-[13px] text-[#6E3906] focus:outline-none cursor-pointer ${
                      fieldErrors.horario
                        ? 'border-[2.5px] border-[#E63946] focus:border-[#E63946]'
                        : 'border-[1.5px] border-[#EBD7C3] focus:border-[#D96B08]'
                    }`}
                  />
                </div>
              </div>

              {evTipo !== 'Alarme' && (
                <div className="flex flex-col gap-1">
                  <label className="text-[12.5px] font-semibold text-[#8A4505]">Local</label>
                  <input
                    type="text"
                    value={evLocal}
                    onChange={(e) => setEvLocal(e.target.value)}
                    placeholder="Clínica ou endereço"
                    className="h-10 bg-[#FFFDFB] border-[1.5px] border-[#EBD7C3] rounded-lg px-3 text-[14px] text-[#6E3906]"
                  />
                </div>
              )}

              {(evTipo === 'Consulta' || evTipo === 'Vacinação') && (
                <div className="flex flex-col gap-1">
                  <label className="text-[12.5px] font-semibold text-[#8A4505]">Veterinário</label>
                  <input
                    type="text"
                    value={evVeterinario}
                    onChange={(e) => setEvVeterinario(e.target.value)}
                    placeholder="Nome do profissional"
                    className="h-10 bg-[#FFFDFB] border-[1.5px] border-[#EBD7C3] rounded-lg px-3 text-[14px] text-[#6E3906]"
                  />
                </div>
              )}

              {evTipo === 'Alarme' && (
                <div className="bg-[#FFF8F1] border border-[#F0DFCE] rounded-xl p-3 flex flex-col gap-2.5">
                  <div className="flex flex-col gap-1">
                    <label className="text-[12.5px] font-semibold text-[#8A4505]">Frequência</label>
                    <select
                      value={evFrequencia}
                      onChange={(e) =>
                        setEvFrequencia(e.target.value as Exclude<FrequenciaAlarme, ''>)
                      }
                      className="h-10 bg-white border-[1.5px] border-[#EBD7C3] rounded-lg px-3 text-[13.5px] text-[#6E3906]"
                    >
                      {FREQUENCIA_OPTIONS.map((freq) => (
                        <option key={freq} value={freq}>
                          {freq}
                        </option>
                      ))}
                    </select>
                  </div>
                  <label className="flex items-center justify-between text-[13px] font-semibold text-[#6E3906]">
                    <span>Alarme Ligado</span>
                    <input
                      type="checkbox"
                      checked={evLigado}
                      onChange={(e) => {
                        if (e.target.checked && !evHorario.trim()) {
                          setEvLigado(false);
                          setFieldErrors((p) => ({ ...p, horario: true }));
                          setFormError('Para ativar a função Alarme Ligado, preencha o Horário.');
                          setTimeout(() => {
                            horarioRef.current?.focus({ preventScroll: true });
                            formScrollRef.current?.scrollToTop();
                          }, 40);
                          return;
                        }
                        setEvLigado(e.target.checked);
                      }}
                      className="w-4 h-4 accent-[#D96B08]"
                    />
                  </label>
                  <p className="text-[11px] text-[#B8651B] leading-snug">
                    No horário configurado, o alarme toca no app e também dispara notificações nos canais aceitos abaixo.
                  </p>
                </div>
              )}

              <div className="flex flex-col gap-1">
                <label className="text-[12.5px] font-semibold text-[#8A4505]">Anotação</label>
                <textarea
                  rows={2}
                  value={evAnotacao}
                  onChange={(e) => setEvAnotacao(e.target.value)}
                  className="bg-[#FFFDFB] border-[1.5px] border-[#EBD7C3] rounded-lg p-2.5 text-[13.5px] text-[#6E3906]"
                />
              </div>

              <div className="flex flex-col gap-2 pt-1 text-[13px] font-semibold text-[#6E3906]">
                <div className="flex flex-col gap-1">
                  <label className="flex items-center justify-between gap-2">
                    <span>
                      Barra de Notificações (App){' '}
                      {!usuario?.notificacao_app && !evNotifApp && (
                        <span className="text-[11px] text-[#B8651B]">
                          (Desativada na conta — não irá funcionar)
                        </span>
                      )}
                    </span>
                    <input
                      type="checkbox"
                      data-testid="event-notif-app-checkbox"
                      checked={evNotifApp}
                      onChange={(e) => {
                        if (e.target.checked && !usuario?.notificacao_app) {
                          setAccountActivationModal({
                            channel: 'app',
                            label: 'Barra de Notificações',
                          });
                          return;
                        }
                        setEvNotifApp(e.target.checked);
                        if (e.target.checked && getBrowserNotificationPermission() === 'default') {
                          void requestBrowserNotificationPermission().then(setBrowserPerm);
                        }
                      }}
                      className="w-4 h-4 accent-[#D96B08] shrink-0"
                    />
                  </label>
                  {evNotifApp && !usuario?.notificacao_app && (
                    <p
                      data-testid="event-notif-app-disabled-warning"
                      className="text-[11px] font-semibold text-[#C92A2A] bg-[#FFF5F5] border border-[#F8CACA] rounded-lg px-2.5 py-1.5 leading-snug"
                    >
                      Desativada nas configurações — esta notificação não irá funcionar até ser reativada.
                    </p>
                  )}
                </div>

                <div className="flex flex-col gap-1">
                  <label className="flex items-center justify-between gap-2">
                    <span>
                      Aviso por WhatsApp{' '}
                      {!evNotifWhats && !isValidCellPhone(usuario?.celular) ? (
                        <span className="text-[11px] text-[#B8651B]">(Requer celular cadastrado)</span>
                      ) : !evNotifWhats && !usuario?.notificacao_whatsapp ? (
                        <span className="text-[11px] text-[#B8651B]">
                          (Desativado na conta — não irá funcionar)
                        </span>
                      ) : null}
                    </span>
                    <input
                      type="checkbox"
                      data-testid="event-notif-whatsapp-checkbox"
                      checked={evNotifWhats}
                      onChange={(e) => {
                        if (!e.target.checked) {
                          setEvNotifWhats(false);
                          return;
                        }
                        if (!isValidCellPhone(usuario?.celular)) {
                          setPendingNotifType('whatsapp');
                          setPhoneInput(formatPhoneMask(usuario?.celular || ''));
                          setPhoneInputError(null);
                          setPhonePromptVisible(true);
                          return;
                        }
                        if (!usuario?.notificacao_whatsapp) {
                          setAccountActivationModal({ channel: 'whatsapp', label: 'WhatsApp' });
                          return;
                        }
                        setEvNotifWhats(true);
                      }}
                      className="w-4 h-4 accent-[#D96B08] shrink-0"
                    />
                  </label>
                  {evNotifWhats && !isValidCellPhone(usuario?.celular) ? (
                    <p
                      data-testid="event-notif-whatsapp-disabled-warning"
                      className="text-[11px] font-semibold text-[#C92A2A] bg-[#FFF5F5] border border-[#F8CACA] rounded-lg px-2.5 py-1.5 leading-snug"
                    >
                      Celular não cadastrado ou inválido — esta notificação não irá funcionar até cadastrar um celular válido.
                    </p>
                  ) : evNotifWhats && !usuario?.notificacao_whatsapp ? (
                    <p
                      data-testid="event-notif-whatsapp-disabled-warning"
                      className="text-[11px] font-semibold text-[#C92A2A] bg-[#FFF5F5] border border-[#F8CACA] rounded-lg px-2.5 py-1.5 leading-snug"
                    >
                      Desativada nas configurações — esta notificação não irá funcionar até ser reativada.
                    </p>
                  ) : null}
                </div>
              </div>
            </CustomScrollArea>

            <div className="shrink-0 flex gap-2 pt-2 border-t border-[#F0DFCE]">
              {evId && (
                <button
                  type="button"
                  disabled={saving}
                  onClick={async () => {
                    setSaving(true);
                    try {
                      await removeEvent(evId);
                      setFormModalVisible(false);
                    } finally {
                      setSaving(false);
                    }
                  }}
                  className="flex-1 h-10 rounded-full bg-[#E63946] text-white text-[12.5px] font-bold"
                >
                  Excluir
                </button>
              )}
              <button
                type="button"
                disabled={saving}
                onClick={() => setFormModalVisible(false)}
                className="flex-1 h-10 rounded-full border border-[#EBD7C3] text-[#8A4505] text-[12.5px] font-bold"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={saving}
                className="flex-1 h-10 rounded-full bg-[#D96B08] text-white text-[12.5px] font-bold"
              >
                {saving ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </form>
        </KeyboardAwareModal>
      )}

      {/* Modais de Validação */}
      {accountActivationModal && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget && !saving) setAccountActivationModal(null);
          }}
          className="fixed inset-0 z-[65] bg-[#281402]/55 flex items-center justify-center p-4"
        >
          <div className="w-full max-w-[330px] bg-white rounded-[20px] p-5 flex flex-col gap-3">
            <h4 className="text-[16px] font-bold text-[#8A4505]">Ativar Função na Conta</h4>
            <p className="text-[13.5px] text-[#6E3906]">
              A função de notificações via <strong>{accountActivationModal.label}</strong> está desativada na sua conta de usuário e será ativada agora ao confirmar.
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={saving}
                onClick={() => setAccountActivationModal(null)}
                className="h-10 rounded-full border border-[#EBD7C3] text-[#8A4505] text-[12.5px] font-bold"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={handleConfirmAccountActivation}
                className="h-10 rounded-full bg-[#D96B08] text-white text-[12.5px] font-bold"
              >
                {saving ? 'Ativando...' : 'Ativar e Continuar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {phonePromptVisible && (
        <KeyboardAwareModal
          zIndexClassName="z-[65]"
          backdropClassName="bg-[#281402]/55"
          onBackdropClick={() => {
            if (!saving) {
              setPhonePromptVisible(false);
              setPhoneInputError(null);
              setPendingNotifType(null);
            }
          }}
        >
          <div className="w-full max-w-[330px] max-h-full overflow-y-auto bg-white rounded-[20px] p-5 flex flex-col gap-3">
            <h4 className="text-[16px] font-bold text-[#8A4505]">Celular Obrigatório</h4>
            <p className="text-[13px] text-[#6E3906]">
              Para ativar notificações por{' '}
              <strong>WhatsApp</strong>, é necessário cadastrar um número de telefone válido com 8 ou 9 dígitos no formato (DD) XXXX-XXXX ou (DD) 9XXXX-XXXX:
            </p>
            {phoneInputError && (
              <div className="bg-[#FFF5F5] border border-[#F8CACA] rounded-xl px-3 py-2 text-[12px] font-semibold text-[#C92A2A]">
                {phoneInputError}
              </div>
            )}
            <input
              ref={phoneInputRef}
              type="tel"
              maxLength={15}
              value={phoneInput}
              onChange={(e) => {
                setPhoneInput(formatPhoneMask(e.target.value));
                if (phoneInputError) setPhoneInputError(null);
              }}
              placeholder="(11) 99999-9999"
              aria-invalid={Boolean(phoneInputError)}
              className={`h-10 bg-[#FFFDFB] rounded-lg px-3 text-[14px] text-[#6E3906] focus:outline-none ${
                phoneInputError
                  ? 'border-[2.5px] border-[#E63946] focus:border-[#E63946]'
                  : 'border-[1.5px] border-[#EBD7C3] focus:border-[#D96B08]'
              }`}
            />
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={saving}
                onClick={() => {
                  setPhonePromptVisible(false);
                  setPhoneInputError(null);
                  setPendingNotifType(null);
                }}
                className="h-10 rounded-full border border-[#EBD7C3] text-[#8A4505] text-[12.5px] font-bold"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={handleSavePhoneNumber}
                className="h-10 rounded-full bg-[#D96B08] text-white text-[12.5px] font-bold"
              >
                {saving ? 'Salvando...' : 'Salvar Número'}
              </button>
            </div>
          </div>
        </KeyboardAwareModal>
      )}

      {timeAlertVisible && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) setTimeAlertVisible(false);
          }}
          className="fixed inset-0 z-[65] bg-[#281402]/55 flex items-center justify-center p-4"
        >
          <div className="w-full max-w-[330px] bg-white rounded-[20px] p-5 flex flex-col gap-3">
            <h4 className="text-[16px] font-bold text-[#8A4505]">Horário Necessário</h4>
            <p className="text-[13.5px] text-[#6E3906]">
              Para ativar a função <strong>Alarme Ligado</strong>, preencha primeiro o campo de Horário.
            </p>
            <button
              type="button"
              onClick={() => {
                setTimeAlertVisible(false);
                setTimeout(() => horarioRef.current?.focus(), 100);
              }}
              className="h-10 rounded-full bg-[#D96B08] text-white text-[13px] font-bold"
            >
              Preencher Horário
            </button>
          </div>
        </div>
      )}

      {saveConfirmVisible && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget && !saving) setSaveConfirmVisible(false);
          }}
          className="fixed inset-0 z-[65] bg-[#281402]/55 flex items-center justify-center p-4"
        >
          <div className="w-full max-w-[330px] bg-white rounded-[20px] p-5 flex flex-col gap-3">
            <h4 className="text-[16px] font-bold text-[#8A4505]">Salvar Alterações</h4>
            <p className="text-[13.5px] text-[#6E3906]">
              Tem certeza que deseja salvar as modificações feitas neste{' '}
              {evTipo === 'Alarme' ? 'alarme' : 'evento'}?
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setSaveConfirmVisible(false)}
                className="h-10 rounded-full border border-[#EBD7C3] text-[#8A4505] text-[12.5px] font-bold"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={async () => {
                  setSaveConfirmVisible(false);
                  await executeSaveEvent();
                }}
                className="h-10 rounded-full bg-[#D96B08] text-white text-[12.5px] font-bold"
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}

      {bulkDeleteConfirmVisible && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget && !deletingBulk) setBulkDeleteConfirmVisible(false);
          }}
          className="fixed inset-0 z-[65] bg-[#281402]/55 flex items-center justify-center p-4"
        >
          <div className="w-full max-w-[330px] bg-white rounded-[20px] p-5 flex flex-col gap-3">
            <h4 className="text-[16px] font-bold text-[#8A4505]">Excluir Eventos</h4>
            <p className="text-[13.5px] text-[#6E3906]">
              Tem certeza que deseja excluir{' '}
              <strong>
                {selectedEventIds.length === 1
                  ? '1 evento selecionado'
                  : `${selectedEventIds.length} eventos selecionados`}
              </strong>
              ? Esta ação não pode ser desfeita.
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={deletingBulk}
                onClick={() => setBulkDeleteConfirmVisible(false)}
                className="h-10 rounded-full border border-[#EBD7C3] text-[#8A4505] text-[12.5px] font-bold"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={deletingBulk}
                onClick={handleConfirmBulkDelete}
                className="h-10 rounded-full bg-[#E63946] text-white text-[12.5px] font-bold disabled:opacity-50"
              >
                {deletingBulk ? 'Excluindo...' : `Excluir (${selectedEventIds.length})`}
              </button>
            </div>
          </div>
        </div>
      )}

      {noticeModal && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) setNoticeModal(null);
          }}
          className="fixed inset-0 z-[65] bg-[#281402]/55 flex items-center justify-center p-4"
        >
          <div className="w-full max-w-[330px] bg-white rounded-[20px] p-5 flex flex-col gap-3">
            <h4 className="text-[16px] font-bold text-[#8A4505]">{noticeModal.title}</h4>
            <p className="text-[13.5px] text-[#6E3906]">{noticeModal.message}</p>
            <button
              type="button"
              onClick={() => setNoticeModal(null)}
              className="h-10 rounded-full bg-[#D96B08] text-white text-[13px] font-bold"
            >
              Entendi
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

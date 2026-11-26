import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../context/AppContext';
import { ApiError } from '../services/api';
import type { Vacina } from '../types';
import { PhotoSourceModal } from '../components/PhotoSourceModal';
import { CustomScrollArea, type CustomScrollAreaHandle } from '../components/CustomScrollbar';
import { KeyboardAwareModal } from '../components/KeyboardAwareModal';
import {
  formatDateDisplay,
  formatDateInputDDMMYYYY,
  toDisplayDate,
  toISODate,
  validateDateInput,
} from '../utils/date';

interface FlattenedVaccine extends Vacina {
  animalNome: string;
  animalEspecie: string;
  animalFoto: string;
}

function formatDateBR(isoDate?: string): string {
  return formatDateDisplay(isoDate, '');
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

  const [filterModalVisible, setFilterModalVisible] = useState(false);
  const [sortModalVisible, setSortModalVisible] = useState(false);
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [formModalVisible, setFormModalVisible] = useState(false);
  const [saveConfirmVisible, setSaveConfirmVisible] = useState(false);
  const [deleteConfirmVisible, setDeleteConfirmVisible] = useState(false);
  const [noticeModal, setNoticeModal] = useState<{ title: string; message: string } | null>(null);

  const [selectedVacRef, setSelectedVacRef] = useState<{
    animalId: string;
    vacId: string;
  } | null>(null);

  const [vacId, setVacId] = useState('');
  const [vacAnimalId, setVacAnimalId] = useState('');
  const [vacNome, setVacNome] = useState('');
  const [vacData, setVacData] = useState('');
  const [vacObs, setVacObs] = useState('');
  const [vacFoto, setVacFoto] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{
    animal?: boolean;
    nome?: boolean;
    data?: boolean;
    foto?: boolean;
  }>({});
  const [saving, setSaving] = useState(false);

  const [photoModalOpen, setPhotoModalOpen] = useState(false);

  const vacAnimalRef = useRef<HTMLSelectElement | null>(null);
  const vacNomeRef = useRef<HTMLInputElement | null>(null);
  const vacDataRef = useRef<HTMLInputElement | null>(null);
  const vacFotoButtonRef = useRef<HTMLButtonElement | null>(null);
  const formScrollRef = useRef<CustomScrollAreaHandle | null>(null);

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
        selectedSpecies.length === 0 || selectedSpecies.includes(item.animalEspecie);
      const matchAnimal =
        selectedAnimals.length === 0 || selectedAnimals.includes(item.id_animal);
      return matchSpecies && matchAnimal;
    });

    if (sortBy === 'data') {
      filtered.sort((a, b) => b.data_aplicacao.localeCompare(a.data_aplicacao));
    } else {
      filtered.sort((a, b) => a.nome_vacina.localeCompare(b.nome_vacina, 'pt-BR'));
    }

    return filtered;
  }, [animais, selectedAnimals, selectedSpecies, sortBy]);

  const activeDetailItem = useMemo(() => {
    if (!selectedVacRef) return null;
    const animal = animais.find((a) => a.id_animal === selectedVacRef.animalId);
    const vac = animal?.vacinas.find((v) => v.id_vacina === selectedVacRef.vacId);
    if (!animal || !vac) return null;
    return { animal, vac };
  }, [animais, selectedVacRef]);

  const totalFilters = selectedSpecies.length + selectedAnimals.length;

  const openVaccineForm = (isEdit = false) => {
    if (animais.length === 0) {
      setNoticeModal({
        title: 'Cadastre um animal primeiro',
        message: 'Cadastre pelo menos um pet antes de adicionar uma vacina.',
      });
      return;
    }

    setFormError(null);
    setFieldErrors({});
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
    setFormModalVisible(true);
  };

  const handleSelectPhoto = (dataUrl: string) => {
    setVacFoto(dataUrl);
    setFieldErrors((p) => ({ ...p, foto: false }));
    setFormError(null);
  };

  const executeSaveVaccine = async () => {
    const dataISO = toISODate(vacData) || vacData.trim();
    setSaving(true);
    try {
      if (vacId && selectedVacRef) {
        await editVaccine({
          id_vacina: vacId,
          id_animal: vacAnimalId,
          nome_vacina: vacNome.trim(),
          data_aplicacao: dataISO,
          observacao: vacObs.trim(),
          foto_carteira: vacFoto,
        });
      } else {
        await addVaccine({
          id_animal: vacAnimalId,
          nome_vacina: vacNome.trim(),
          data_aplicacao: dataISO,
          observacao: vacObs.trim(),
          foto_carteira: vacFoto,
        });
      }
      setSaveConfirmVisible(false);
      setFormModalVisible(false);
    } catch (error) {
      setFormError(error instanceof ApiError ? error.message : 'Erro ao salvar vacina.');
      setSaveConfirmVisible(false);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveVaccine = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const animalErr = !vacAnimalId.trim();
    const nomeErr = !vacNome.trim();
    const dataCheck = validateDateInput(vacData, {
      required: true,
      allowFuture: false,
      fieldLabel: 'A data da aplicação',
    });
    const dataErr = !dataCheck.valid;
    const fotoErr = !vacFoto.trim();

    if (animalErr || nomeErr || dataErr || fotoErr) {
      setFieldErrors({
        animal: animalErr,
        nome: nomeErr,
        data: dataErr,
        foto: fotoErr,
      });
      if (dataErr && !animalErr && !nomeErr && !fotoErr) {
        setFormError(dataCheck.error || 'Informe uma data válida no formato dd-mm-aaaa.');
      } else {
        setFormError(
          dataErr && vacData.trim() && dataCheck.error
            ? dataCheck.error
            : 'Nome da vacina, Data da aplicação e Foto da carteira são obrigatórios.'
        );
      }
      formScrollRef.current?.scrollToTop();
      setTimeout(() => {
        if (animalErr) {
          vacAnimalRef.current?.focus({ preventScroll: true });
        } else if (nomeErr) {
          vacNomeRef.current?.focus({ preventScroll: true });
        } else if (dataErr) {
          vacDataRef.current?.focus({ preventScroll: true });
        } else if (fotoErr) {
          vacFotoButtonRef.current?.focus({ preventScroll: true });
        }
        formScrollRef.current?.scrollToTop();
      }, 40);
      return;
    }

    setFieldErrors({});

    if (vacId && selectedVacRef) {
      setSaveConfirmVisible(true);
      return;
    }

    await executeSaveVaccine();
  };

  return (
    <div className="relative w-full max-w-[390px] mx-auto px-5 py-6 pb-24 flex flex-col gap-4">
      <div className="text-center">
        <h1 className="text-[22px] font-bold text-[#8A4505] mb-1">Carteira de Vacinação</h1>
        <p className="text-[13.5px] text-[#B8651B]">
          Acompanhe e cadastre os comprovantes de vacinas dos seus pets
        </p>
      </div>

      {/* Controles Filtro e Ordenar */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setFilterModalVisible(true)}
          aria-label="Filtrar vacinas"
          className={`relative h-11 min-w-[44px] px-3 rounded-xl border-[1.5px] flex items-center justify-center ${
            totalFilters > 0
              ? 'bg-[#D96B08] border-[#D96B08] text-white'
              : 'bg-white border-[#EBD7C3] text-[#8A4505]'
          }`}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
          </svg>
          {totalFilters > 0 && (
            <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-[#6E3906] text-white text-[11px] font-bold flex items-center justify-center">
              {totalFilters}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setSortModalVisible(true)}
          className="h-11 px-3.5 rounded-xl bg-[#D96B08] text-white text-[13px] font-bold flex items-center gap-2"
        >
          <span>{sortBy === 'data' ? 'Data' : 'Nome'}</span>
        </button>
      </div>

      {flattenedVaccines.length === 0 ? (
        <div className="bg-white border-[1.5px] border-dashed border-[#EBD7C3] rounded-2xl p-7 text-center">
          <p className="text-[14px] font-medium text-[#B8651B]">
            Nenhuma vacina encontrada para os filtros selecionados.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {flattenedVaccines.map((item) => (
            <div
              key={item.id_vacina}
              role="button"
              tabIndex={0}
              onClick={() => {
                setSelectedVacRef({ animalId: item.id_animal, vacId: item.id_vacina });
                setDetailModalVisible(true);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setSelectedVacRef({ animalId: item.id_animal, vacId: item.id_vacina });
                  setDetailModalVisible(true);
                }
              }}
              className="w-full bg-white border-[1.5px] border-[#EBD7C3] hover:border-[#D96B08] rounded-2xl p-3.5 flex items-center gap-3 text-left shadow-[0_3px_10px_rgba(138,69,5,0.05)] cursor-pointer"
            >
              {item.animalFoto ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    openPhotoViewer(item.animalFoto, item.animalNome);
                  }}
                  aria-label={`Ver foto de ${item.animalNome}`}
                  title="Ver foto em tela cheia"
                  className="w-12 h-12 rounded-full overflow-hidden border-2 border-[#D96B08] shrink-0 cursor-pointer transition-transform active:scale-95"
                >
                  <img
                    src={item.animalFoto}
                    alt={item.animalNome}
                    className="w-full h-full object-cover"
                  />
                </button>
              ) : (
                <div className="w-12 h-12 rounded-full bg-[#FFF3E6] border-2 border-[#D96B08] flex items-center justify-center text-[#D96B08] font-bold shrink-0">
                  {item.animalNome.charAt(0).toUpperCase()}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-[12px] font-bold text-[#D96B08]">
                  {item.animalNome} • {item.animalEspecie}
                </p>
                <p className="text-[15px] font-bold text-[#6E3906] truncate">{item.nome_vacina}</p>
                <p className="text-[12.5px] font-medium text-[#8A4505]">
                  Aplicada em {formatDateBR(item.data_aplicacao)}
                </p>
              </div>
              <span className="text-[#D96B08] font-bold">&gt;</span>
            </div>
          ))}
        </div>
      )}

      {/* Botão Flutuante (+) */}
      <div className="fixed bottom-[86px] inset-x-0 z-40 pointer-events-none">
        <div className="w-full max-w-[390px] mx-auto px-5 flex items-center justify-end">
          <button
            type="button"
            onClick={() => openVaccineForm(false)}
            aria-label="Nova vacina"
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

      {/* Modal Filtro */}
      {filterModalVisible && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) setFilterModalVisible(false);
          }}
          className="fixed inset-0 z-50 bg-[#281402]/45 flex items-center justify-center p-4"
        >
          <div className="w-full max-w-[350px] bg-white rounded-[20px] p-5 flex flex-col gap-3 max-h-[85vh]">
            <div className="flex justify-between items-center pb-2 border-b border-[#F0DFCE]">
              <h3 className="text-[17px] font-bold text-[#8A4505]">Filtrar Vacinas</h3>
              <button type="button" onClick={() => setFilterModalVisible(false)} className="text-2xl text-[#B8651B]">×</button>
            </div>
            <CustomScrollArea
              outerClassName="flex-1 min-h-0 flex flex-col"
              className="flex-1 min-h-0 flex flex-col gap-3"
            >
              <div>
                <p className="text-[13px] font-semibold text-[#8A4505] mb-1.5">Por Espécie</p>
                <div className="flex flex-col gap-1.5">
                  {uniqueSpecies.map((sp) => {
                    const selected = selectedSpecies.includes(sp);
                    return (
                      <button
                        key={sp}
                        type="button"
                        onClick={() =>
                          setSelectedSpecies((p) =>
                            p.includes(sp) ? p.filter((i) => i !== sp) : [...p, sp]
                          )
                        }
                        className={`px-3 py-2 rounded-xl border flex justify-between text-[13.5px] font-semibold ${
                          selected ? 'bg-[#FFF3E6] border-[#D96B08] text-[#D96B08]' : 'border-[#EBD7C3] text-[#6E3906]'
                        }`}
                      >
                        <span>{sp}</span>
                        <span>{selected ? '✓' : ''}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
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
            </CustomScrollArea>
            <div className="shrink-0 grid grid-cols-2 gap-2 pt-2 border-t border-[#F0DFCE]">
              <button
                type="button"
                onClick={() => {
                  setSelectedSpecies([]);
                  setSelectedAnimals([]);
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

      {/* Modal Ordenar */}
      {sortModalVisible && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) setSortModalVisible(false);
          }}
          className="fixed inset-0 z-50 bg-[#281402]/45 flex items-center justify-center p-4"
        >
          <div className="w-full max-w-[330px] bg-white rounded-[20px] p-5 flex flex-col gap-3">
            <div className="flex justify-between items-center pb-2 border-b border-[#F0DFCE]">
              <h3 className="text-[16px] font-bold text-[#8A4505]">Ordenar por:</h3>
              <button type="button" onClick={() => setSortModalVisible(false)} className="text-2xl text-[#B8651B]">×</button>
            </div>
            <button
              type="button"
              onClick={() => {
                setSortBy('nome');
                setSortModalVisible(false);
              }}
              className={`px-3 py-2.5 rounded-xl border flex justify-between text-[13.5px] font-semibold ${
                sortBy === 'nome' ? 'bg-[#FFF3E6] border-[#D96B08] text-[#D96B08]' : 'border-[#EBD7C3] text-[#6E3906]'
              }`}
            >
              <span>Nome • A-Z</span>
              <span>{sortBy === 'nome' ? '✓' : ''}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setSortBy('data');
                setSortModalVisible(false);
              }}
              className={`px-3 py-2.5 rounded-xl border flex justify-between text-[13.5px] font-semibold ${
                sortBy === 'data' ? 'bg-[#FFF3E6] border-[#D96B08] text-[#D96B08]' : 'border-[#EBD7C3] text-[#6E3906]'
              }`}
            >
              <span>Data • Mais Novo-Mais antigo</span>
              <span>{sortBy === 'data' ? '✓' : ''}</span>
            </button>
          </div>
        </div>
      )}

      {/* Modal Nova / Editar Vacina */}
      {formModalVisible && (
        <KeyboardAwareModal
          onBackdropClick={() => {
            if (!saving) setFormModalVisible(false);
          }}
        >
          <form
            noValidate
            onSubmit={handleSaveVaccine}
            className="w-full max-w-[360px] max-h-full bg-white rounded-[20px] p-5 flex flex-col gap-3"
          >
            <div className="shrink-0 flex justify-between items-center pb-2 border-b border-[#F0DFCE]">
              <h3 className="text-[17px] font-bold text-[#8A4505]">
                {vacId ? 'Editar Vacina' : 'Nova Vacina'}
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
              className="flex-1 min-h-0 flex flex-col gap-3"
            >

            <div className="flex flex-col gap-1">
              <label className="text-[12.5px] font-semibold text-[#8A4505]">Animal *</label>
              <select
                ref={vacAnimalRef}
                value={vacAnimalId}
                onChange={(e) => {
                  setVacAnimalId(e.target.value);
                  if (fieldErrors.animal) setFieldErrors((p) => ({ ...p, animal: false }));
                  setFormError(null);
                }}
                aria-invalid={Boolean(fieldErrors.animal)}
                className={`h-10 bg-[#FFFDFB] rounded-lg px-3 text-[14px] text-[#6E3906] focus:outline-none ${
                  fieldErrors.animal
                    ? 'border-[2.5px] border-[#E63946] focus:border-[#E63946]'
                    : 'border-[1.5px] border-[#EBD7C3] focus:border-[#D96B08]'
                }`}
              >
                <option value="">Selecione...</option>
                {animais.map((pet) => (
                  <option key={pet.id_animal} value={pet.id_animal}>
                    {pet.nome} ({pet.especie})
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-[12.5px] font-semibold text-[#8A4505]">Nome da vacina *</label>
              <input
                ref={vacNomeRef}
                type="text"
                value={vacNome}
                onChange={(e) => {
                  setVacNome(e.target.value);
                  if (fieldErrors.nome) setFieldErrors((p) => ({ ...p, nome: false }));
                  setFormError(null);
                }}
                placeholder="Ex: V10 (Polivalente)"
                aria-invalid={Boolean(fieldErrors.nome)}
                className={`h-10 bg-[#FFFDFB] rounded-lg px-3 text-[14px] text-[#6E3906] focus:outline-none ${
                  fieldErrors.nome
                    ? 'border-[2.5px] border-[#E63946] focus:border-[#E63946]'
                    : 'border-[1.5px] border-[#EBD7C3] focus:border-[#D96B08]'
                }`}
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-[12.5px] font-semibold text-[#8A4505]">Data da aplicação *</label>
              <input
                ref={vacDataRef}
                type="text"
                inputMode="numeric"
                maxLength={10}
                placeholder="dd-mm-aaaa"
                value={vacData}
                onChange={(e) => {
                  setVacData(formatDateInputDDMMYYYY(e.target.value));
                  if (fieldErrors.data) setFieldErrors((p) => ({ ...p, data: false }));
                  setFormError(null);
                }}
                aria-invalid={Boolean(fieldErrors.data)}
                className={`h-10 bg-[#FFFDFB] rounded-lg px-3 text-[14px] text-[#6E3906] focus:outline-none ${
                  fieldErrors.data
                    ? 'border-[2.5px] border-[#E63946] focus:border-[#E63946]'
                    : 'border-[1.5px] border-[#EBD7C3] focus:border-[#D96B08]'
                }`}
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-[12.5px] font-semibold text-[#8A4505]">Observação</label>
              <textarea
                rows={3}
                value={vacObs}
                onChange={(e) => setVacObs(e.target.value)}
                className="bg-[#FFFDFB] border-[1.5px] border-[#EBD7C3] rounded-lg p-2.5 text-[13.5px] text-[#6E3906]"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[12.5px] font-semibold text-[#8A4505]">
                Foto da carteira / comprovante *
              </label>
              <button
                ref={vacFotoButtonRef}
                type="button"
                disabled={saving}
                onClick={() => setPhotoModalOpen(true)}
                className={`h-11 bg-[#FFF8F1] hover:bg-[#FFF0E0] border-dashed rounded-xl px-3 flex items-center justify-center gap-2 text-[13px] font-bold text-[#8A4505] cursor-pointer focus:outline-none ${
                  fieldErrors.foto
                    ? 'border-[2.5px] border-[#E63946] bg-[#FFF5F5]'
                    : 'border-[1.5px] border-[#D96B08]'
                }`}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#D96B08" strokeWidth="2">
                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                  <circle cx="12" cy="13" r="4" />
                </svg>
                <span>
                  {vacFoto
                    ? 'Alterar foto (câmera ou galeria)'
                    : 'Adicionar foto (câmera ou galeria)'}
                </span>
              </button>
              {vacFoto && (
                <button
                  type="button"
                  onClick={() => openPhotoViewer(vacFoto, vacNome.trim() || 'Carteira de vacinação')}
                  aria-label="Ver foto da carteira em tela cheia"
                  title="Ver foto em tela cheia"
                  className="w-full text-left cursor-pointer"
                >
                  <img
                    src={vacFoto}
                    alt="Prévia da carteira"
                    className="w-full h-40 object-cover rounded-xl border border-[#EBD7C3]"
                  />
                  <span className="text-[12px] font-bold text-[#D96B08]">
                    Toque na imagem para ampliar
                  </span>
                </button>
              )}
            </div>

            </CustomScrollArea>

            <div className="shrink-0 grid grid-cols-2 gap-2.5 pt-2 border-t border-[#F0DFCE]">
              <button
                type="button"
                onClick={() => setFormModalVisible(false)}
                className="h-10 rounded-full border border-[#EBD7C3] text-[#8A4505] text-[13px] font-bold"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={saving}
                className="h-10 rounded-full bg-[#D96B08] text-white text-[13px] font-bold"
              >
                {saving ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </form>
        </KeyboardAwareModal>
      )}

      {/* Modal Detalhes da Vacina */}
      {detailModalVisible && activeDetailItem && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) setDetailModalVisible(false);
          }}
          className="fixed inset-0 z-50 bg-[#281402]/45 flex items-center justify-center p-4"
        >
          <div className="w-full max-w-[350px] max-h-[88vh] bg-white rounded-[20px] p-5 flex flex-col gap-3">
            <div className="shrink-0 flex justify-between items-center pb-2 border-b border-[#F0DFCE]">
              <h3 className="text-[17px] font-bold text-[#8A4505]">Detalhes da Vacina</h3>
              <button type="button" onClick={() => setDetailModalVisible(false)} className="text-2xl text-[#B8651B]">×</button>
            </div>
            <CustomScrollArea
              outerClassName="flex-1 min-h-0 flex flex-col"
              className="flex-1 min-h-0 flex flex-col gap-2.5 text-[14px]"
            >
              <div>
                <p className="text-[11.5px] font-bold text-[#B8651B]">Animal</p>
                <p className="font-semibold text-[#6E3906]">
                  {activeDetailItem.animal.nome} ({activeDetailItem.animal.especie})
                </p>
              </div>
              <div>
                <p className="text-[11.5px] font-bold text-[#B8651B]">Vacina</p>
                <p className="font-semibold text-[#6E3906]">{activeDetailItem.vac.nome_vacina}</p>
              </div>
              <div>
                <p className="text-[11.5px] font-bold text-[#B8651B]">Data da Aplicação</p>
                <p className="font-semibold text-[#6E3906]">
                  {formatDateBR(activeDetailItem.vac.data_aplicacao)}
                </p>
              </div>
              <div>
                <p className="text-[11.5px] font-bold text-[#B8651B]">Observação</p>
                <p className="text-[#6E3906]">
                  {activeDetailItem.vac.observacao || 'Nenhuma observação registrada.'}
                </p>
              </div>
              {activeDetailItem.vac.foto_carteira && (
                <div>
                  <p className="text-[11.5px] font-bold text-[#B8651B] mb-1">Comprovante</p>
                  <button
                    type="button"
                    onClick={() =>
                      openPhotoViewer(
                        activeDetailItem.vac.foto_carteira,
                        activeDetailItem.vac.nome_vacina || 'Carteira de vacinação'
                      )
                    }
                    className="w-full text-left cursor-pointer"
                  >
                    <img
                      src={activeDetailItem.vac.foto_carteira}
                      alt="Carteira de vacinação"
                      className="w-full h-40 object-cover rounded-xl border border-[#EBD7C3]"
                    />
                    <span className="text-[12px] font-bold text-[#D96B08]">
                      Toque na imagem para ampliar
                    </span>
                  </button>
                </div>
              )}
            </CustomScrollArea>
            <div className="shrink-0 grid grid-cols-2 gap-2.5 pt-2 border-t border-[#F0DFCE]">
              <button
                type="button"
                onClick={() => setDeleteConfirmVisible(true)}
                className="h-10 rounded-full bg-[#E63946] text-white text-[13px] font-bold"
              >
                Excluir
              </button>
              <button
                type="button"
                onClick={() => {
                  setDetailModalVisible(false);
                  openVaccineForm(true);
                }}
                className="h-10 rounded-full bg-[#D96B08] text-white text-[13px] font-bold"
              >
                Editar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmação Salvar Alterações */}
      {saveConfirmVisible && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget && !saving) setSaveConfirmVisible(false);
          }}
          className="fixed inset-0 z-[60] bg-[#281402]/55 flex items-center justify-center p-4"
        >
          <div className="w-full max-w-[330px] bg-white rounded-[20px] p-5 flex flex-col gap-3">
            <h4 className="text-[16px] font-bold text-[#8A4505]">Salvar Alterações</h4>
            <p className="text-[13.5px] text-[#6E3906]">
              Tem certeza que deseja salvar as modificações feitas nesta vacina?
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={saving}
                onClick={() => setSaveConfirmVisible(false)}
                className="h-10 rounded-full border border-[#EBD7C3] text-[#8A4505] text-[13px] font-bold"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={executeSaveVaccine}
                className="h-10 rounded-full bg-[#D96B08] text-white text-[13px] font-bold"
              >
                {saving ? 'Salvando...' : 'Sim, salvar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmação Exclusão */}
      {deleteConfirmVisible && selectedVacRef && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget && !saving) setDeleteConfirmVisible(false);
          }}
          className="fixed inset-0 z-[60] bg-[#281402]/55 flex items-center justify-center p-4"
        >
          <div className="w-full max-w-[330px] bg-white rounded-[20px] p-5 flex flex-col gap-3">
            <h4 className="text-[16px] font-bold text-[#8A4505]">Confirmar Exclusão</h4>
            <p className="text-[13.5px] text-[#6E3906]">
              Tem certeza que deseja excluir permanentemente este registro de vacina?
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setDeleteConfirmVisible(false)}
                className="h-10 rounded-full border border-[#EBD7C3] text-[#8A4505] text-[13px] font-bold"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={async () => {
                  setSaving(true);
                  try {
                    await removeVaccine(selectedVacRef.vacId, selectedVacRef.animalId);
                    setDeleteConfirmVisible(false);
                    setDetailModalVisible(false);
                    setSelectedVacRef(null);
                  } finally {
                    setSaving(false);
                  }
                }}
                className="h-10 rounded-full bg-[#E63946] text-white text-[13px] font-bold"
              >
                Sim, excluir
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

      <PhotoSourceModal
        open={photoModalOpen}
        title="Foto da Carteira / Comprovante"
        theme="orange"
        preferredFacingMode="environment"
        onClose={() => setPhotoModalOpen(false)}
        onSelectPhoto={handleSelectPhoto}
        onError={(msg) => setFormError(msg)}
      />
    </div>
  );
};

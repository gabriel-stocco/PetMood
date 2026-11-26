import React, { useEffect, useRef, useState } from 'react';
import { useApp } from '../context/AppContext';
import { ApiError } from '../services/api';
import type { Animal, GeneroAnimal } from '../types';
import { downloadAnimalPdf } from '../utils/animalPdf';
import { PhotoSourceModal } from '../components/PhotoSourceModal';
import { SpeciesDropdown, type SpeciesDropdownHandle } from '../components/SpeciesDropdown';
import { CustomScrollArea, type CustomScrollAreaHandle } from '../components/CustomScrollbar';
import { KeyboardAwareModal } from '../components/KeyboardAwareModal';
import {
  formatDateDisplay,
  formatDateInputDDMMYYYY,
  toDisplayDate,
  validateDateInput,
} from '../utils/date';

const GENDER_OPTIONS: Exclude<GeneroAnimal, ''>[] = ['Macho', 'Fêmea'];

function formatDateBR(isoDate?: string): string {
  return formatDateDisplay(isoDate, 'Não informada');
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

  const slides = propagandas.slice(0, 5);
  const [currentSlide, setCurrentSlide] = useState(0);

  useEffect(() => {
    if (slides.length <= 1) return;
    const timer = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % slides.length);
    }, 5000);
    return () => clearInterval(timer);
  }, [slides.length]);

  const [selectedPet, setSelectedPet] = useState<Animal | null>(null);
  const [detailsVisible, setDetailsVisible] = useState(false);
  const [editVisible, setEditVisible] = useState(false);
  const [saving, setSaving] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [pdfFeedback, setPdfFeedback] = useState<string | null>(null);

  const [editId, setEditId] = useState('');
  const [editNome, setEditNome] = useState('');
  const [editEspecie, setEditEspecie] = useState('Cachorro');
  const [editGenero, setEditGenero] = useState('Macho');
  const [editRaca, setEditRaca] = useState('');
  const [editNascimento, setEditNascimento] = useState('');
  const [editRacao, setEditRacao] = useState('');
  const [editObservacao, setEditObservacao] = useState('');
  const [editFoto, setEditFoto] = useState('');
  const [editError, setEditError] = useState<string | null>(null);
  const [editFieldErrors, setEditFieldErrors] = useState<{
    nome?: boolean;
    especie?: boolean;
    genero?: boolean;
    nascimento?: boolean;
  }>({});

  const editNomeRef = useRef<HTMLInputElement | null>(null);
  const editSpeciesRef = useRef<SpeciesDropdownHandle | null>(null);
  const editGeneroRef = useRef<HTMLSelectElement | null>(null);
  const editNascimentoRef = useRef<HTMLInputElement | null>(null);
  const editScrollRef = useRef<CustomScrollAreaHandle | null>(null);

  const [confirmDialog, setConfirmDialog] = useState<{
    visible: boolean;
    title: string;
    message: string;
    confirmLabel: string;
    destructive?: boolean;
    onConfirm: (() => Promise<void> | void) | null;
  }>({
    visible: false,
    title: '',
    message: '',
    confirmLabel: 'Confirmar',
    onConfirm: null,
  });

  const openPetDetails = (pet: Animal) => {
    setSelectedPet(pet);
    setPdfFeedback(null);
    setDetailsVisible(true);
  };

  const handleDownloadPetPdf = async () => {
    if (!selectedPet || downloadingPdf) return;
    setDownloadingPdf(true);
    setPdfFeedback(null);
    try {
      const filename = await downloadAnimalPdf(selectedPet, eventos);
      setPdfFeedback(`PDF gerado: ${filename}`);
    } catch {
      setPdfFeedback('Não foi possível gerar o PDF deste animal.');
    } finally {
      setDownloadingPdf(false);
    }
  };

  const openEditForm = (pet: Animal) => {
    setEditId(pet.id_animal);
    setEditNome(pet.nome || '');
    setEditEspecie(pet.especie || 'Cachorro');
    setEditGenero(pet.genero || 'Macho');
    setEditRaca(pet.raca || '');
    setEditNascimento(toDisplayDate(pet.data_nascimento));
    setEditRacao(pet.racao || '');
    setEditObservacao(pet.observacao || '');
    setEditFoto(pet.foto || '');
    setEditError(null);
    setEditFieldErrors({});
    setDetailsVisible(false);
    setEditVisible(true);
  };

  const handleDeletePet = () => {
    if (!selectedPet) return;
    setConfirmDialog({
      visible: true,
      title: 'Deletar Animal',
      message: `Tem certeza que deseja excluir permanentemente ${selectedPet.nome} e suas vacinas?`,
      confirmLabel: 'Sim, excluir',
      destructive: true,
      onConfirm: async () => {
        setSaving(true);
        try {
          await removeAnimal(selectedPet.id_animal);
          setDetailsVisible(false);
          setSelectedPet(null);
        } catch (error) {
          alert(error instanceof ApiError ? error.message : 'Erro ao excluir pet.');
        } finally {
          setSaving(false);
        }
      },
    });
  };

  const handleRequestEditPet = () => {
    if (!selectedPet) return;
    setConfirmDialog({
      visible: true,
      title: 'Editar Animal',
      message: `Deseja alterar os dados cadastrados de ${selectedPet.nome}?`,
      confirmLabel: 'Sim, editar',
      onConfirm: () => {
        openEditForm(selectedPet);
      },
    });
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    setEditError(null);

    const nomeErr = !editNome.trim();
    const especieErr = !editEspecie.trim();
    const generoErr = !editGenero.trim();
    const birthCheck = validateDateInput(editNascimento, {
      required: false,
      allowFuture: false,
      fieldLabel: 'A data de nascimento do animal',
    });
    const nascimentoErr = !birthCheck.valid;

    if (nomeErr || especieErr || generoErr || nascimentoErr) {
      setEditFieldErrors({
        nome: nomeErr,
        especie: especieErr,
        genero: generoErr,
        nascimento: nascimentoErr,
      });
      if (nomeErr || especieErr || generoErr) {
        setEditError('Preencha Nome, Espécie e Gênero do animal.');
      } else {
        setEditError(
          birthCheck.error || 'Informe uma data de nascimento válida no formato dd-mm-aaaa.'
        );
      }
      editScrollRef.current?.scrollToTop();
      setTimeout(() => {
        if (nomeErr) {
          editNomeRef.current?.focus({ preventScroll: true });
        } else if (especieErr) {
          editSpeciesRef.current?.openAndFocus({ preventScroll: true });
        } else if (generoErr) {
          editGeneroRef.current?.focus({ preventScroll: true });
        } else if (nascimentoErr) {
          editNascimentoRef.current?.focus({ preventScroll: true });
        }
        editScrollRef.current?.scrollToTop();
      }, 40);
      return;
    }

    setEditFieldErrors({});

    setConfirmDialog({
      visible: true,
      title: 'Salvar Alterações',
      message: 'Confirmar a atualização dos dados deste animal?',
      confirmLabel: 'Sim, salvar',
      onConfirm: async () => {
        setSaving(true);
        try {
          const updated = await editAnimal({
            id_animal: editId,
            nome: editNome.trim(),
            especie: editEspecie.trim(),
            genero: editGenero.trim(),
            raca: editRaca.trim(),
            data_nascimento: birthCheck.iso,
            racao: editRacao.trim(),
            observacao: editObservacao.trim(),
            foto: editFoto,
          });
          setEditVisible(false);
          setSelectedPet(updated);
        } catch (error) {
          setEditError(error instanceof ApiError ? error.message : 'Erro ao atualizar animal.');
        } finally {
          setSaving(false);
        }
      },
    });
  };

  const [photoModalOpen, setPhotoModalOpen] = useState(false);

  const handleSelectEditPhoto = (dataUrl: string) => {
    setEditFoto(dataUrl);
    setEditError(null);
  };

  return (
    <div className="w-full max-w-[390px] mx-auto px-5 py-6 flex flex-col gap-7">
      {/* Carrossel de Ofertas / Propagandas */}
      <section aria-label="Produtos em destaque">
        {slides.length > 0 && (
          <div className="relative w-full h-[210px] rounded-[20px] overflow-hidden border-[1.5px] border-[#EBD7C3] bg-white shadow-[0_6px_18px_rgba(138,69,5,0.08)]">
            <a
              href={slides[currentSlide].link}
              target="_blank"
              rel="noopener noreferrer"
              className="block w-full h-full relative"
            >
              <img
                src={slides[currentSlide].foto}
                alt={slides[currentSlide].nome}
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#3C1E02]/80 via-[#3C1E02]/15 to-transparent flex flex-col justify-end p-4 pb-8">
                <span className="self-start px-2.5 py-0.5 rounded-full bg-[#D96B08] text-white text-[10.5px] font-bold mb-1">
                  Oferta em destaque
                </span>
                <p className="text-white text-[15px] font-bold leading-snug">
                  {slides[currentSlide].nome}
                </p>
              </div>
            </a>

            {slides.length > 1 && (
              <>
                <button
                  type="button"
                  onClick={() =>
                    setCurrentSlide((prev) => (prev - 1 + slides.length) % slides.length)
                  }
                  aria-label="Slide anterior"
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/90 text-[#8A4505] font-bold flex items-center justify-center shadow"
                >
                  &lt;
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentSlide((prev) => (prev + 1) % slides.length)}
                  aria-label="Próximo slide"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/90 text-[#8A4505] font-bold flex items-center justify-center shadow"
                >
                  &gt;
                </button>
                <div className="absolute bottom-2.5 left-0 right-0 flex justify-center gap-1.5">
                  {slides.map((s, idx) => (
                    <button
                      key={s.id_propaganda}
                      type="button"
                      onClick={() => setCurrentSlide(idx)}
                      aria-label={`Slide ${idx + 1}`}
                      className={`h-2 rounded-full transition-all ${
                        idx === currentSlide ? 'w-5 bg-[#D96B08]' : 'w-2 bg-white/75'
                      }`}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </section>

      {/* Meus Animais */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-[19px] font-bold text-[#8A4505]">Meus Animais</h2>
          <span className="text-[12.5px] font-semibold text-[#B8651B]">
            {animais.length} {animais.length === 1 ? 'pet' : 'pets'}
          </span>
        </div>

        {animais.length === 0 ? (
          <div className="bg-white border-[1.5px] border-dashed border-[#EBD7C3] rounded-2xl p-7 text-center">
            <p className="text-[14px] font-medium text-[#B8651B]">
              Você ainda não possui animais cadastrados. Use o botão "+" na barra inferior para adicionar seu primeiro pet!
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {animais.map((pet) => (
              <div
                key={pet.id_animal}
                role="button"
                tabIndex={0}
                onClick={() => openPetDetails(pet)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    openPetDetails(pet);
                  }
                }}
                className="w-full bg-white border-[1.5px] border-[#EBD7C3] hover:border-[#D96B08] rounded-2xl p-3.5 flex items-center gap-3.5 text-left shadow-[0_4px_12px_rgba(138,69,5,0.05)] transition-colors cursor-pointer"
              >
                {pet.foto ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      openPhotoViewer(pet.foto, pet.nome);
                    }}
                    aria-label={`Ver foto de ${pet.nome}`}
                    title="Ver foto em tela cheia"
                    className="w-14 h-14 rounded-full overflow-hidden border-2 border-[#D96B08] shrink-0 cursor-pointer transition-transform active:scale-95"
                  >
                    <img
                      src={pet.foto}
                      alt={pet.nome}
                      className="w-full h-full object-cover"
                    />
                  </button>
                ) : (
                  <div className="w-14 h-14 rounded-full bg-[#FFF3E6] border-2 border-[#D96B08] flex items-center justify-center text-[#D96B08] text-xl font-bold shrink-0">
                    {pet.nome.charAt(0).toUpperCase()}
                  </div>
                )}

                <div className="flex-1 min-w-0">
                  <p className="text-[16px] font-bold text-[#6E3906] truncate">{pet.nome}</p>
                  <p className="text-[13px] font-semibold text-[#D96B08]">
                    {pet.especie}
                    {pet.raca ? ` • ${pet.raca}` : ''}
                  </p>
                  <p className="text-[12px] text-[#B8651B] mt-0.5">
                    {pet.vacinas?.length || 0} vacina(s) registrada(s)
                  </p>
                </div>

                <span className="text-[#D96B08] text-base font-bold">&gt;</span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Modal 1: Detalhes do Animal */}
      {detailsVisible && selectedPet && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget && !saving) setDetailsVisible(false);
          }}
          className="fixed inset-0 z-50 bg-[#281402]/45 flex items-center justify-center p-4"
        >
          <div className="w-full max-w-[360px] max-h-[88vh] bg-white rounded-[20px] border border-[#F0DFCE] p-5 flex flex-col gap-3.5">
            <div className="shrink-0 flex items-center justify-between pb-2.5 border-b border-[#F0DFCE]">
              <h3 className="text-[17px] font-bold text-[#8A4505]">Detalhes do Animal</h3>
              <button
                type="button"
                onClick={() => setDetailsVisible(false)}
                className="text-2xl text-[#B8651B] leading-none"
              >
                ×
              </button>
            </div>

            <CustomScrollArea
              outerClassName="flex-1 min-h-0 flex flex-col"
              className="flex-1 min-h-0 flex flex-col gap-3.5"
            >

            <div className="flex flex-col items-center gap-2">
              <div className="w-full grid grid-cols-[40px_auto_40px] items-center justify-center gap-3">
                <span aria-hidden="true" className="w-10 h-10" />
                {selectedPet.foto ? (
                  <button
                    type="button"
                    onClick={() => openPhotoViewer(selectedPet.foto, selectedPet.nome)}
                    aria-label={`Ver foto de ${selectedPet.nome}`}
                    title="Ver foto em tela cheia"
                    className="w-24 h-24 rounded-full overflow-hidden border-[3px] border-[#D96B08] cursor-pointer transition-transform active:scale-95"
                  >
                    <img
                      src={selectedPet.foto}
                      alt={selectedPet.nome}
                      className="w-full h-full object-cover"
                    />
                  </button>
                ) : (
                  <div className="w-24 h-24 rounded-full bg-[#FFF3E6] border-[3px] border-[#D96B08] flex items-center justify-center text-[#D96B08] text-3xl font-bold">
                    {selectedPet.nome.charAt(0).toUpperCase()}
                  </div>
                )}
                <button
                  type="button"
                  data-testid="download-animal-pdf"
                  onClick={handleDownloadPetPdf}
                  disabled={downloadingPdf || saving}
                  aria-label="Baixar ficha em PDF"
                  title="Baixar ficha completa em PDF"
                  className="w-10 h-10 rounded-full bg-[#FFF3E6] border-[1.5px] border-[#D96B08] text-[#D96B08] hover:bg-[#D96B08] hover:text-white transition-colors flex items-center justify-center shadow-sm disabled:opacity-60"
                >
                  <svg
                    viewBox="0 0 24 24"
                    className="w-5 h-5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2.2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                </button>
              </div>
              <h4 className="text-[19px] font-bold text-[#6E3906]">{selectedPet.nome}</h4>
              {pdfFeedback && (
                <p
                  data-testid="pdf-feedback"
                  className="text-[12px] font-semibold text-[#8A4505] bg-[#FFF3E6] border border-[#F0DFCE] rounded-lg px-2.5 py-1 text-center"
                >
                  {pdfFeedback}
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3 text-left bg-[#FFFDFB] border border-[#F0DFCE] rounded-xl p-3.5">
              <div>
                <p className="text-[10.5px] font-bold text-[#B8651B]">ESPÉCIE</p>
                <p className="text-[13.5px] font-semibold text-[#6E3906]">{selectedPet.especie}</p>
              </div>
              <div>
                <p className="text-[10.5px] font-bold text-[#B8651B]">RAÇA</p>
                <p className="text-[13.5px] font-semibold text-[#6E3906]">
                  {selectedPet.raca || 'Não informada'}
                </p>
              </div>
              <div>
                <p className="text-[10.5px] font-bold text-[#B8651B]">GÊNERO</p>
                <p className="text-[13.5px] font-semibold text-[#6E3906]">
                  {selectedPet.genero || 'Não informado'}
                </p>
              </div>
              <div>
                <p className="text-[10.5px] font-bold text-[#B8651B]">NASCIMENTO</p>
                <p className="text-[13.5px] font-semibold text-[#6E3906]">
                  {formatDateBR(selectedPet.data_nascimento)}
                </p>
              </div>
              <div className="col-span-2">
                <p className="text-[10.5px] font-bold text-[#B8651B]">RAÇÃO</p>
                <p className="text-[13.5px] font-semibold text-[#6E3906]">
                  {selectedPet.racao || 'Não informada'}
                </p>
              </div>
              <div className="col-span-2">
                <p className="text-[10.5px] font-bold text-[#B8651B]">OBSERVAÇÃO</p>
                <p className="text-[13.5px] text-[#6E3906]">
                  {selectedPet.observacao || 'Nenhuma observação cadastrada.'}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                setDetailsVisible(false);
                navigateToVaccinesForAnimal(selectedPet.id_animal);
              }}
              className="w-full py-2.5 px-3 rounded-xl bg-[#FFF3E6] border border-[#F0DFCE] text-[#D96B08] text-[13px] font-bold hover:bg-[#FFE6CE] transition-colors"
            >
              Clique aqui para ver todas as vacinas desse animal →
            </button>

            </CustomScrollArea>

            <div className="shrink-0 grid grid-cols-3 gap-2 pt-2 border-t border-[#F0DFCE]">
              <button
                type="button"
                disabled={saving}
                onClick={handleDeletePet}
                className="h-10 rounded-full bg-[#E63946] text-white text-[12px] font-bold"
              >
                Deletar
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={handleRequestEditPet}
                className="h-10 rounded-full bg-[#D96B08] text-white text-[12px] font-bold"
              >
                Editar
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => setDetailsVisible(false)}
                className="h-10 rounded-full bg-white border border-[#EBD7C3] text-[#8A4505] text-[12px] font-bold"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal 2: Edição do Animal */}
      {editVisible && (
        <KeyboardAwareModal
          onBackdropClick={() => {
            if (!saving) setEditVisible(false);
          }}
        >
          <form
            noValidate
            onSubmit={handleSaveEdit}
            className="w-full max-w-[360px] max-h-full bg-white rounded-[20px] border border-[#F0DFCE] p-5 flex flex-col gap-3"
          >
            <div className="shrink-0 flex items-center justify-between pb-2 border-b border-[#F0DFCE]">
              <h3 className="text-[17px] font-bold text-[#8A4505]">Editar Animal</h3>
              <button
                type="button"
                onClick={() => setEditVisible(false)}
                className="text-2xl text-[#B8651B] leading-none"
              >
                ×
              </button>
            </div>

            {editError && (
              <div className="shrink-0 bg-[#FFF5F5] border border-[#F8CACA] rounded-xl px-3 py-2 text-[12.5px] font-semibold text-[#C92A2A] text-center">
                {editError}
              </div>
            )}

            <CustomScrollArea
              ref={editScrollRef}
              outerClassName="flex-1 min-h-0 flex flex-col"
              className="flex-1 min-h-0 flex flex-col gap-3"
            >

            <div className="flex flex-col gap-1">
              <label className="text-[12.5px] font-semibold text-[#8A4505]">Nome *</label>
              <input
                ref={editNomeRef}
                type="text"
                value={editNome}
                onChange={(e) => {
                  setEditNome(e.target.value);
                  if (editFieldErrors.nome) setEditFieldErrors((p) => ({ ...p, nome: false }));
                  setEditError(null);
                }}
                aria-invalid={Boolean(editFieldErrors.nome)}
                className={`h-10 bg-[#FFFDFB] rounded-lg px-3 text-[14px] text-[#6E3906] focus:outline-none ${
                  editFieldErrors.nome
                    ? 'border-[2.5px] border-[#E63946] focus:border-[#E63946]'
                    : 'border-[1.5px] border-[#EBD7C3] focus:border-[#D96B08]'
                }`}
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="flex flex-col gap-1">
                <label className="text-[12.5px] font-semibold text-[#8A4505]">Espécie *</label>
                <SpeciesDropdown
                  ref={editSpeciesRef}
                  value={editEspecie}
                  onChange={(val) => {
                    setEditEspecie(val);
                    if (editFieldErrors.especie) setEditFieldErrors((p) => ({ ...p, especie: false }));
                    setEditError(null);
                  }}
                  placeholder="Selecione..."
                  compact
                  disabled={saving}
                  hasError={Boolean(editFieldErrors.especie)}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[12.5px] font-semibold text-[#8A4505]">Gênero *</label>
                <select
                  ref={editGeneroRef}
                  value={editGenero}
                  onChange={(e) => {
                    setEditGenero(e.target.value);
                    if (editFieldErrors.genero) setEditFieldErrors((p) => ({ ...p, genero: false }));
                    setEditError(null);
                  }}
                  aria-invalid={Boolean(editFieldErrors.genero)}
                  className={`h-10 bg-[#FFFDFB] rounded-lg px-2.5 text-[13.5px] text-[#6E3906] focus:outline-none ${
                    editFieldErrors.genero
                      ? 'border-[2.5px] border-[#E63946] focus:border-[#E63946]'
                      : 'border-[1.5px] border-[#EBD7C3] focus:border-[#D96B08]'
                  }`}
                >
                  <option value="">Selecione...</option>
                  {GENDER_OPTIONS.map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="flex flex-col gap-1">
                <label className="text-[12.5px] font-semibold text-[#8A4505]">Raça</label>
                <input
                  type="text"
                  value={editRaca}
                  onChange={(e) => setEditRaca(e.target.value)}
                  className="h-10 bg-[#FFFDFB] border-[1.5px] border-[#EBD7C3] rounded-lg px-3 text-[13.5px] text-[#6E3906]"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[12.5px] font-semibold text-[#8A4505]">Nascimento</label>
                <input
                  ref={editNascimentoRef}
                  type="text"
                  inputMode="numeric"
                  maxLength={10}
                  placeholder="dd-mm-aaaa"
                  value={editNascimento}
                  onChange={(e) => {
                    setEditNascimento(formatDateInputDDMMYYYY(e.target.value));
                    if (editFieldErrors.nascimento) {
                      setEditFieldErrors((p) => ({ ...p, nascimento: false }));
                    }
                    setEditError(null);
                  }}
                  aria-invalid={Boolean(editFieldErrors.nascimento)}
                  className={`h-10 bg-[#FFFDFB] rounded-lg px-2.5 text-[13px] text-[#6E3906] focus:outline-none ${
                    editFieldErrors.nascimento
                      ? 'border-[2.5px] border-[#E63946] focus:border-[#E63946]'
                      : 'border-[1.5px] border-[#EBD7C3] focus:border-[#D96B08]'
                  }`}
                />
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-[12.5px] font-semibold text-[#8A4505]">Ração</label>
              <input
                type="text"
                value={editRacao}
                onChange={(e) => setEditRacao(e.target.value)}
                className="h-10 bg-[#FFFDFB] border-[1.5px] border-[#EBD7C3] rounded-lg px-3 text-[14px] text-[#6E3906]"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-[12.5px] font-semibold text-[#8A4505]">Observação</label>
              <textarea
                rows={3}
                value={editObservacao}
                onChange={(e) => setEditObservacao(e.target.value)}
                className="bg-[#FFFDFB] border-[1.5px] border-[#EBD7C3] rounded-lg p-3 text-[13.5px] text-[#6E3906]"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[12.5px] font-semibold text-[#8A4505]">Foto</label>
              <div className="flex items-center gap-2">
                {editFoto && (
                  <button
                    type="button"
                    onClick={() => openPhotoViewer(editFoto, editNome || 'Foto do animal')}
                    aria-label="Ver foto do animal em tela cheia"
                    title="Ver foto em tela cheia"
                    className="w-10 h-10 rounded-full overflow-hidden border-2 border-[#D96B08] shrink-0 cursor-pointer transition-transform active:scale-95"
                  >
                    <img
                      src={editFoto}
                      alt="Prévia da foto do animal"
                      className="w-full h-full object-cover"
                    />
                  </button>
                )}
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => setPhotoModalOpen(true)}
                  className="flex-1 h-10 bg-[#FFF8F1] hover:bg-[#FFF0E0] border border-dashed border-[#D96B08] rounded-lg px-3 flex items-center justify-center gap-2 text-[12.5px] font-bold text-[#8A4505] cursor-pointer"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#D96B08" strokeWidth="2">
                    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                    <circle cx="12" cy="13" r="4" />
                  </svg>
                  <span>Alterar foto (câmera ou galeria)</span>
                </button>
              </div>
            </div>

            </CustomScrollArea>

            <div className="shrink-0 grid grid-cols-2 gap-2.5 pt-2 border-t border-[#F0DFCE]">
              <button
                type="button"
                onClick={() => setEditVisible(false)}
                className="h-10 rounded-full bg-white border border-[#EBD7C3] text-[#8A4505] text-[13px] font-bold"
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

      {/* Modal 3: Confirmação */}
      {confirmDialog.visible && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setConfirmDialog((p) => ({ ...p, visible: false, onConfirm: null }));
            }
          }}
          className="fixed inset-0 z-[60] bg-[#281402]/55 flex items-center justify-center p-4"
        >
          <div className="w-full max-w-[330px] bg-white rounded-[20px] border border-[#F0DFCE] p-5 flex flex-col gap-3">
            <h4 className="text-[17px] font-bold text-[#8A4505]">{confirmDialog.title}</h4>
            <p className="text-[13.5px] text-[#6E3906] leading-relaxed">{confirmDialog.message}</p>
            <div className="grid grid-cols-2 gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => setConfirmDialog((p) => ({ ...p, visible: false, onConfirm: null }))}
                className="h-10 rounded-full bg-white border border-[#EBD7C3] text-[#8A4505] text-[13px] font-bold"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={async () => {
                  const cb = confirmDialog.onConfirm;
                  setConfirmDialog((p) => ({ ...p, visible: false, onConfirm: null }));
                  if (cb) await cb();
                }}
                className={`h-10 rounded-full text-white text-[13px] font-bold ${
                  confirmDialog.destructive ? 'bg-[#E63946]' : 'bg-[#D96B08]'
                }`}
              >
                {confirmDialog.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}

      <PhotoSourceModal
        open={photoModalOpen}
        title="Foto do Animal"
        theme="orange"
        preferredFacingMode="environment"
        onClose={() => setPhotoModalOpen(false)}
        onSelectPhoto={handleSelectEditPhoto}
        onError={(msg) => setEditError(msg)}
      />
    </div>
  );
};

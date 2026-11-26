import React, { useRef, useState } from 'react';
import { useApp } from '../context/AppContext';
import { ApiError } from '../services/api';
import type { GeneroAnimal } from '../types';
import { PhotoSourceModal } from '../components/PhotoSourceModal';
import { SpeciesDropdown, type SpeciesDropdownHandle } from '../components/SpeciesDropdown';
import { formatDateInputDDMMYYYY, validateDateInput } from '../utils/date';

export const AddAnimalScreen: React.FC = () => {
  const { addAnimal, setActiveTab, openPhotoViewer } = useApp();

  const [nome, setNome] = useState('');
  const [dataNascimento, setDataNascimento] = useState('');
  const [especie, setEspecie] = useState('');
  const [raca, setRaca] = useState('');
  const [genero, setGenero] = useState<GeneroAnimal>('');
  const [racao, setRacao] = useState('');
  const [observacao, setObservacao] = useState('');
  const [foto, setFoto] = useState('');
  const [fileName, setFileName] = useState('Adicionar foto (câmera ou galeria)');
  const [photoModalOpen, setPhotoModalOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{
    nome?: boolean;
    especie?: boolean;
    genero?: boolean;
    nascimento?: boolean;
  }>({});
  const [saving, setSaving] = useState(false);

  const nomeRef = useRef<HTMLInputElement | null>(null);
  const speciesRef = useRef<SpeciesDropdownHandle | null>(null);
  const generoRef = useRef<HTMLSelectElement | null>(null);
  const nascimentoRef = useRef<HTMLInputElement | null>(null);

  const handleSelectPhoto = (dataUrl: string, pickedFileName: string) => {
    setFoto(dataUrl);
    setFileName(pickedFileName);
    setErrorMessage(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const nextErrors = {
      nome: !nome.trim(),
      especie: !especie.trim(),
      genero: !genero,
    };

    if (nextErrors.nome || nextErrors.especie || nextErrors.genero) {
      setFieldErrors(nextErrors);
      setErrorMessage('Preencha Nome do animal, Espécie e Gênero.');
      if (nextErrors.nome) {
        nomeRef.current?.focus({ preventScroll: true });
      } else if (nextErrors.especie) {
        speciesRef.current?.openAndFocus({ preventScroll: true });
      } else if (nextErrors.genero) {
        generoRef.current?.focus({ preventScroll: true });
      }
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    const birthCheck = validateDateInput(dataNascimento, {
      required: false,
      allowFuture: false,
      fieldLabel: 'A data de nascimento do animal',
    });
    if (!birthCheck.valid) {
      setFieldErrors({ nascimento: true });
      setErrorMessage(
        birthCheck.error || 'Informe uma data de nascimento válida no formato dd-mm-aaaa.'
      );
      nascimentoRef.current?.focus({ preventScroll: true });
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    setFieldErrors({});

    setSaving(true);
    try {
      await addAnimal({
        nome: nome.trim(),
        data_nascimento: birthCheck.iso,
        especie: especie.trim(),
        raca: raca.trim(),
        genero,
        racao: racao.trim(),
        observacao: observacao.trim(),
        foto,
      });
      setActiveTab('Home');
    } catch (error) {
      setErrorMessage(
        error instanceof ApiError ? error.message : 'Não foi possível cadastrar o animal.'
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="w-full max-w-[390px] mx-auto px-5 py-6 flex flex-col gap-5">
      <div className="text-center">
        <h1 className="text-[22px] font-bold text-[#8A4505] mb-1">Adicionar Animal</h1>
        <p className="text-[13.5px] text-[#B8651B]">
          Cadastre um novo pet para gerenciar vacinas e eventos
        </p>
      </div>

      {errorMessage && (
        <div className="bg-[#FFF5F5] border border-[#F8CACA] rounded-xl px-3.5 py-2.5 text-[13px] font-semibold text-[#C92A2A] text-center">
          {errorMessage}
        </div>
      )}

      <form
        noValidate
        onSubmit={handleSubmit}
        className="bg-white border-[1.5px] border-[#EBD7C3] rounded-[18px] p-4 flex flex-col gap-3 shadow-[0_4px_14px_rgba(138,69,5,0.05)]"
      >
        <div className="flex flex-col gap-1">
          <label className="text-[13px] font-semibold text-[#8A4505]">Nome do Animal *</label>
          <input
            ref={nomeRef}
            type="text"
            value={nome}
            onChange={(e) => {
              setNome(e.target.value);
              if (fieldErrors.nome) setFieldErrors((p) => ({ ...p, nome: false }));
            }}
            placeholder="Ex: Thor"
            aria-invalid={fieldErrors.nome || undefined}
            className={`h-11 bg-[#FFFDFB] rounded-xl px-3.5 text-[14.5px] text-[#6E3906] outline-none ${
              fieldErrors.nome
                ? 'border-[2.5px] border-[#E63946] focus:border-[#E63946]'
                : 'border-[1.5px] border-[#EBD7C3] focus:border-[#D96B08]'
            }`}
          />
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          <div className="flex flex-col gap-1">
            <label className="text-[13px] font-semibold text-[#8A4505]">Espécie *</label>
            <SpeciesDropdown
              ref={speciesRef}
              value={especie}
              onChange={(val) => {
                setEspecie(val);
                if (fieldErrors.especie) setFieldErrors((p) => ({ ...p, especie: false }));
              }}
              placeholder="Selecione..."
              disabled={saving}
              hasError={Boolean(fieldErrors.especie)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[13px] font-semibold text-[#8A4505]">Gênero *</label>
            <select
              ref={generoRef}
              value={genero}
              onChange={(e) => {
                setGenero(e.target.value as GeneroAnimal);
                if (fieldErrors.genero) setFieldErrors((p) => ({ ...p, genero: false }));
              }}
              aria-invalid={fieldErrors.genero || undefined}
              className={`h-11 bg-[#FFFDFB] rounded-xl px-3 text-[14px] text-[#6E3906] outline-none ${
                fieldErrors.genero
                  ? 'border-[2.5px] border-[#E63946] focus:border-[#E63946]'
                  : 'border-[1.5px] border-[#EBD7C3] focus:border-[#D96B08]'
              }`}
            >
              <option value="">Selecione...</option>
              <option value="Macho">Macho</option>
              <option value="Fêmea">Fêmea</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          <div className="flex flex-col gap-1">
            <label className="text-[13px] font-semibold text-[#8A4505]">Raça</label>
            <input
              type="text"
              value={raca}
              onChange={(e) => setRaca(e.target.value)}
              placeholder="Ex: Labrador"
              className="h-11 bg-[#FFFDFB] border-[1.5px] border-[#EBD7C3] rounded-xl px-3 text-[14px] text-[#6E3906]"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[13px] font-semibold text-[#8A4505]">Nascimento</label>
            <input
              ref={nascimentoRef}
              type="text"
              inputMode="numeric"
              maxLength={10}
              placeholder="dd-mm-aaaa"
              value={dataNascimento}
              onChange={(e) => {
                setDataNascimento(formatDateInputDDMMYYYY(e.target.value));
                if (fieldErrors.nascimento) setFieldErrors((p) => ({ ...p, nascimento: false }));
              }}
              aria-invalid={fieldErrors.nascimento || undefined}
              className={`h-11 bg-[#FFFDFB] rounded-xl px-2.5 text-[13.5px] text-[#6E3906] outline-none ${
                fieldErrors.nascimento
                  ? 'border-[2.5px] border-[#E63946] focus:border-[#E63946]'
                  : 'border-[1.5px] border-[#EBD7C3] focus:border-[#D96B08]'
              }`}
            />
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-[13px] font-semibold text-[#8A4505]">Ração</label>
          <input
            type="text"
            value={racao}
            onChange={(e) => setRacao(e.target.value)}
            placeholder="Marca e tipo de ração"
            className="h-11 bg-[#FFFDFB] border-[1.5px] border-[#EBD7C3] rounded-xl px-3.5 text-[14px] text-[#6E3906]"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-[13px] font-semibold text-[#8A4505]">Observação</label>
          <textarea
            rows={3}
            value={observacao}
            onChange={(e) => setObservacao(e.target.value)}
            placeholder="Alergias, cuidados especiais..."
            className="bg-[#FFFDFB] border-[1.5px] border-[#EBD7C3] rounded-xl p-3 text-[14px] text-[#6E3906]"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-[13px] font-semibold text-[#8A4505]">Foto do Animal</label>
          <div className="flex items-center gap-2.5">
            {foto && (
              <button
                type="button"
                onClick={() => openPhotoViewer(foto, nome.trim() || 'Foto do animal')}
                aria-label="Ver foto do animal em tela cheia"
                title="Ver foto em tela cheia"
                className="w-11 h-11 rounded-full overflow-hidden border-2 border-[#D96B08] shrink-0 cursor-pointer transition-transform active:scale-95"
              >
                <img
                  src={foto}
                  alt="Prévia da foto do animal"
                  className="w-full h-full object-cover"
                />
              </button>
            )}
            <button
              type="button"
              disabled={saving}
              onClick={() => setPhotoModalOpen(true)}
              className="flex-1 min-h-[44px] bg-[#FFF8F1] border-[1.5px] border-dashed border-[#D96B08] rounded-xl px-3.5 py-2 flex items-center gap-2.5 cursor-pointer text-left hover:bg-[#FFF0E0]"
            >
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#D96B08" strokeWidth="2" className="shrink-0">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                <circle cx="12" cy="13" r="4" />
              </svg>
              <span className="text-[13px] font-bold text-[#8A4505] truncate">{fileName}</span>
            </button>
          </div>
        </div>

        <button
          type="submit"
          disabled={saving}
          className="mt-2 w-full h-12 rounded-full bg-[#D96B08] hover:bg-[#C25E06] disabled:opacity-60 text-white text-[15px] font-bold shadow-[0_6px_14px_rgba(217,107,8,0.26)] transition-colors"
        >
          {saving ? 'Cadastrando...' : 'Cadastrar Animal'}
        </button>
      </form>

      <PhotoSourceModal
        open={photoModalOpen}
        title="Foto do Animal"
        theme="orange"
        preferredFacingMode="environment"
        onClose={() => setPhotoModalOpen(false)}
        onSelectPhoto={handleSelectPhoto}
        onError={(msg) => setErrorMessage(msg)}
      />
    </div>
  );
};

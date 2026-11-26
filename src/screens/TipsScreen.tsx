import React, { useMemo, useRef, useState } from 'react';
import { useApp } from '../context/AppContext';
import { ApiError } from '../services/api';
import type { DicaCompleta, DicaResumo } from '../types';

type ArticleBlock =
  | { type: 'heading'; text: string }
  | { type: 'callout'; text: string }
  | { type: 'list'; items: string[] }
  | { type: 'paragraph'; text: string };

function estimateReadingMinutes(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 180));
}

function parseArticleBlocks(rawText: string): ArticleBlock[] {
  const normalized = rawText.replace(/\r\n/g, '\n').trim();
  if (!normalized) return [];

  const chunks = normalized.split(/\n{2,}/);
  const blocks: ArticleBlock[] = [];

  for (const chunk of chunks) {
    const trimmed = chunk.trim();
    if (!trimmed) continue;

    if (trimmed.startsWith('## ')) {
      blocks.push({ type: 'heading', text: trimmed.slice(3).trim() });
      continue;
    }

    if (trimmed.startsWith('> ')) {
      blocks.push({
        type: 'callout',
        text: trimmed
          .split('\n')
          .map((line) => line.replace(/^>\s?/, '').trim())
          .join(' '),
      });
      continue;
    }

    const lines = trimmed
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    const isBulletList =
      lines.length > 0 && lines.every((line) => line.startsWith('• ') || line.startsWith('- '));

    if (isBulletList) {
      blocks.push({
        type: 'list',
        items: lines.map((line) => line.replace(/^[•-]\s+/, '').trim()),
      });
      continue;
    }

    blocks.push({ type: 'paragraph', text: trimmed });
  }

  return blocks;
}

function renderListItemText(item: string) {
  const colonIdx = item.indexOf(':');
  if (colonIdx > 0 && colonIdx <= 48) {
    return (
      <>
        <strong className="font-bold text-[#8A4505]">{item.slice(0, colonIdx + 1)}</strong>
        {item.slice(colonIdx + 1)}
      </>
    );
  }
  return item;
}

export const TipsScreen: React.FC = () => {
  const { dicas, fetchTipDetails } = useApp();

  const [search, setSearch] = useState('');
  const [selectedEspecies, setSelectedEspecies] = useState<string[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

  const [especieModalVisible, setEspecieModalVisible] = useState(false);
  const [tagModalVisible, setTagModalVisible] = useState(false);

  const [readingTipSummary, setReadingTipSummary] = useState<DicaResumo | null>(null);
  const [loadingArticle, setLoadingArticle] = useState(false);
  const [articleError, setArticleError] = useState<string | null>(null);
  const [activeTip, setActiveTip] = useState<DicaCompleta | null>(null);
  const requestIdRef = useRef(0);

  const uniqueEspecies = useMemo(
    () => Array.from(new Set(dicas.map((d) => d.especie).filter(Boolean))),
    [dicas]
  );

  const uniqueTags = useMemo(
    () => Array.from(new Set(dicas.map((d) => d.tag).filter(Boolean))),
    [dicas]
  );

  const filteredTips = useMemo(() => {
    const query = search.trim().toLowerCase();
    return dicas.filter((item) => {
      const matchSearch =
        item.titulo.toLowerCase().includes(query) ||
        item.tag.toLowerCase().includes(query) ||
        item.especie.toLowerCase().includes(query);
      const matchEspecie =
        selectedEspecies.length === 0 || selectedEspecies.includes(item.especie);
      const matchTag = selectedTags.length === 0 || selectedTags.includes(item.tag);
      return matchSearch && matchEspecie && matchTag;
    });
  }, [dicas, search, selectedEspecies, selectedTags]);

  const relatedTips = useMemo(() => {
    if (!readingTipSummary) return [];
    const others = dicas.filter((d) => d.id_dicas !== readingTipSummary.id_dicas);
    const sameSpecies = others.filter((d) => d.especie === readingTipSummary.especie);
    const differentSpecies = others.filter((d) => d.especie !== readingTipSummary.especie);
    return [...sameSpecies, ...differentSpecies].slice(0, 2);
  }, [dicas, readingTipSummary]);

  const articleBlocks = useMemo(
    () => parseArticleBlocks(activeTip?.artigo || ''),
    [activeTip?.artigo]
  );

  const readingMinutes = useMemo(
    () => (activeTip?.artigo ? estimateReadingMinutes(activeTip.artigo) : null),
    [activeTip?.artigo]
  );

  const handleOpenTip = async (tipSummary: DicaResumo) => {
    const currentRequestId = ++requestIdRef.current;
    setReadingTipSummary(tipSummary);
    setLoadingArticle(true);
    setArticleError(null);
    setActiveTip({ ...tipSummary, artigo: '' });

    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    try {
      const fullTip = await fetchTipDetails(tipSummary.id_dicas);
      if (requestIdRef.current !== currentRequestId) return;
      setActiveTip(fullTip);
    } catch (error) {
      if (requestIdRef.current !== currentRequestId) return;
      setArticleError(
        error instanceof ApiError
          ? error.message
          : 'Não foi possível carregar o artigo completo.'
      );
    } finally {
      if (requestIdRef.current === currentRequestId) {
        setLoadingArticle(false);
      }
    }
  };

  const handleBackToTips = () => {
    requestIdRef.current += 1;
    setReadingTipSummary(null);
    setActiveTip(null);
    setArticleError(null);
    setLoadingArticle(false);
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  // Página dedicada de leitura do artigo (estilo blog, sem pop-up)
  if (readingTipSummary) {
    const displayTip = activeTip || readingTipSummary;

    return (
      <div className="w-full max-w-[460px] mx-auto px-5 py-6 flex flex-col gap-5">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={handleBackToTips}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-white border-[1.5px] border-[#EBD7C3] hover:border-[#D96B08] text-[13px] font-bold text-[#8A4505] shadow-[0_2px_8px_rgba(138,69,5,0.05)] transition-colors cursor-pointer"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="m15 18-6-6 6-6" />
            </svg>
            <span>Voltar para Dicas</span>
          </button>

          <span className="text-[11.5px] font-bold uppercase tracking-wider text-[#B8651B]">
            Blog PetMood
          </span>
        </div>

        <article className="w-full bg-white border-[1.5px] border-[#EBD7C3] rounded-[22px] p-5 sm:p-6 shadow-[0_6px_22px_rgba(138,69,5,0.06)] flex flex-col gap-4">
          <header className="flex flex-col gap-3 pb-4 border-b border-[#F0DFCE]">
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full bg-[#D96B08] text-white text-[11px] font-bold">
                {displayTip.especie}
              </span>
              <span className="px-2.5 py-0.5 rounded-full bg-[#FFF3E6] border border-[#F0DFCE] text-[#8A4505] text-[11px] font-bold">
                {displayTip.tag}
              </span>
              {readingMinutes && !loadingArticle && (
                <span className="text-[11.5px] font-semibold text-[#B8651B] ml-auto">
                  {readingMinutes} min de leitura
                </span>
              )}
            </div>

            <h1 className="text-[22px] font-extrabold text-[#8A4505] leading-[1.3]">
              {displayTip.titulo}
            </h1>
          </header>

          {loadingArticle ? (
            <div className="py-12 flex flex-col items-center justify-center gap-3 text-center">
              <div className="w-8 h-8 rounded-full border-[3px] border-[#F0DFCE] border-t-[#D96B08] animate-spin" />
              <p className="text-[13.5px] font-medium text-[#B8651B]">
                Carregando artigo completo...
              </p>
            </div>
          ) : articleError ? (
            <div className="py-8 flex flex-col items-center gap-3 text-center">
              <p className="text-[14px] font-semibold text-[#E63946]">{articleError}</p>
              <button
                type="button"
                onClick={() => handleOpenTip(readingTipSummary)}
                className="px-5 h-10 rounded-full bg-[#D96B08] text-white text-[13px] font-bold cursor-pointer"
              >
                Tentar novamente
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {articleBlocks.map((block, index) => {
                if (block.type === 'heading') {
                  return (
                    <h2
                      key={`heading-${index}`}
                      className="text-[17px] font-bold text-[#8A4505] leading-snug pt-2 flex items-center gap-2"
                    >
                      <span className="w-1.5 h-5 rounded-full bg-[#D96B08] shrink-0" />
                      <span>{block.text}</span>
                    </h2>
                  );
                }

                if (block.type === 'callout') {
                  return (
                    <div
                      key={`callout-${index}`}
                      className="bg-[#FFF6EC] border-l-4 border-[#D96B08] rounded-r-xl px-4 py-3.5 text-[14px] text-[#6E3906] leading-[1.7] font-medium"
                    >
                      {block.text}
                    </div>
                  );
                }

                if (block.type === 'list') {
                  return (
                    <ul key={`list-${index}`} className="flex flex-col gap-2.5 pl-1">
                      {block.items.map((item, itemIdx) => (
                        <li
                          key={`item-${index}-${itemIdx}`}
                          className="flex items-start gap-2.5 text-[14.5px] text-[#6E3906] leading-[1.7]"
                        >
                          <span className="w-2 h-2 rounded-full bg-[#D96B08] mt-2.5 shrink-0" />
                          <span>{renderListItemText(item)}</span>
                        </li>
                      ))}
                    </ul>
                  );
                }

                return (
                  <p
                    key={`p-${index}`}
                    className="text-[15px] text-[#6E3906] leading-[1.78] whitespace-pre-line"
                  >
                    {block.text}
                  </p>
                );
              })}

              <footer className="mt-2 pt-4 border-t border-[#F0DFCE]">
                <p className="text-[12px] text-[#9E8A78] leading-relaxed">
                  Conteúdo informativo do Blog PetMood. Em caso de dúvidas específicas ou sinais
                  clínicos no seu pet, consulte sempre um médico-veterinário.
                </p>
              </footer>
            </div>
          )}
        </article>

        {relatedTips.length > 0 && (
          <section className="flex flex-col gap-2.5">
            <h3 className="text-[14px] font-bold text-[#8A4505] px-1">
              Continue lendo no Blog
            </h3>
            <div className="flex flex-col gap-2.5">
              {relatedTips.map((item) => (
                <button
                  key={item.id_dicas}
                  type="button"
                  onClick={() => handleOpenTip(item)}
                  className="w-full bg-white border-[1.5px] border-[#EBD7C3] hover:border-[#D96B08] rounded-2xl p-3.5 flex flex-col items-start gap-1 text-left shadow-[0_2px_8px_rgba(138,69,5,0.04)] transition-colors cursor-pointer"
                >
                  <div className="flex flex-wrap gap-1.5">
                    <span className="px-2 py-0.5 rounded-full bg-[#D96B08] text-white text-[10.5px] font-bold">
                      {item.especie}
                    </span>
                    <span className="px-2 py-0.5 rounded-full bg-[#FFF3E6] border border-[#F0DFCE] text-[#8A4505] text-[10.5px] font-bold">
                      {item.tag}
                    </span>
                  </div>
                  <span className="text-[14px] font-bold text-[#6E3906] leading-snug">
                    {item.titulo}
                  </span>
                </button>
              ))}
            </div>
          </section>
        )}

        <button
          type="button"
          onClick={handleBackToTips}
          className="w-full h-11 rounded-full bg-[#D96B08] hover:bg-[#C15E06] text-white text-[14px] font-bold transition-colors cursor-pointer"
        >
          Voltar para todas as dicas
        </button>
      </div>
    );
  }

  return (
    <div className="w-full max-w-[390px] mx-auto px-5 py-6 flex flex-col gap-4">
      <div className="text-center">
        <h1 className="text-[22px] font-bold text-[#8A4505] mb-1">Dicas e Cuidados</h1>
        <p className="text-[13.5px] text-[#B8651B]">
          Artigos completos para a saúde e o bem-estar do seu pet
        </p>
      </div>

      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Pesquisar por título ou tema..."
        className="w-full h-11 bg-white border-[1.5px] border-[#EBD7C3] focus:border-[#D96B08] rounded-xl px-3.5 text-[14px] text-[#6E3906] placeholder-[#9E8A78] outline-none"
      />

      <div className="grid grid-cols-2 gap-2.5">
        <button
          type="button"
          onClick={() => setEspecieModalVisible(true)}
          className={`h-10 rounded-xl border-[1.5px] text-[13px] font-bold transition-colors cursor-pointer ${
            selectedEspecies.length > 0
              ? 'bg-[#FFF3E6] border-[#D96B08] text-[#D96B08]'
              : 'bg-white border-[#EBD7C3] text-[#8A4505]'
          }`}
        >
          Espécie{selectedEspecies.length > 0 ? ` (${selectedEspecies.length})` : ''}
        </button>

        <button
          type="button"
          onClick={() => setTagModalVisible(true)}
          className={`h-10 rounded-xl border-[1.5px] text-[13px] font-bold transition-colors cursor-pointer ${
            selectedTags.length > 0
              ? 'bg-[#FFF3E6] border-[#D96B08] text-[#D96B08]'
              : 'bg-white border-[#EBD7C3] text-[#8A4505]'
          }`}
        >
          Tópicos{selectedTags.length > 0 ? ` (${selectedTags.length})` : ''}
        </button>
      </div>

      {filteredTips.length === 0 ? (
        <div className="bg-white border-[1.5px] border-dashed border-[#EBD7C3] rounded-2xl p-7 text-center">
          <p className="text-[14px] font-medium text-[#B8651B]">
            Nenhuma dica encontrada para os filtros selecionados.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {filteredTips.map((item) => (
            <button
              key={item.id_dicas}
              type="button"
              onClick={() => handleOpenTip(item)}
              className="w-full bg-white border-[1.5px] border-[#EBD7C3] hover:border-[#D96B08] rounded-2xl p-4 flex flex-col items-start gap-2 text-left shadow-[0_3px_10px_rgba(138,69,5,0.04)] transition-colors cursor-pointer"
            >
              <div className="flex flex-wrap gap-1.5">
                <span className="px-2 py-0.5 rounded-full bg-[#D96B08] text-white text-[11px] font-bold">
                  {item.especie}
                </span>
                <span className="px-2 py-0.5 rounded-full bg-[#FFF3E6] border border-[#F0DFCE] text-[#8A4505] text-[11px] font-bold">
                  {item.tag}
                </span>
              </div>
              <h3 className="text-[15.5px] font-bold text-[#6E3906] leading-snug">
                {item.titulo}
              </h3>
              <span className="text-[12.5px] font-bold text-[#D96B08]">
                Ler artigo completo &gt;
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Modal Espécie */}
      {especieModalVisible && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) setEspecieModalVisible(false);
          }}
          className="fixed inset-0 z-50 bg-[#281402]/45 flex items-center justify-center p-4"
        >
          <div className="w-full max-w-[340px] bg-white rounded-[20px] border border-[#F0DFCE] p-5 flex flex-col gap-3.5">
            <div className="flex items-center justify-between pb-2 border-b border-[#F0DFCE]">
              <h3 className="text-[16px] font-bold text-[#8A4505]">Filtrar por Espécie</h3>
              <button
                type="button"
                onClick={() => setEspecieModalVisible(false)}
                className="text-2xl text-[#B8651B]"
              >
                ×
              </button>
            </div>
            <div className="flex flex-col gap-2">
              {uniqueEspecies.map((esp) => {
                const selected = selectedEspecies.includes(esp);
                return (
                  <button
                    key={esp}
                    type="button"
                    onClick={() =>
                      setSelectedEspecies((p) =>
                        p.includes(esp) ? p.filter((i) => i !== esp) : [...p, esp]
                      )
                    }
                    className={`px-3 py-2.5 rounded-xl border flex justify-between items-center text-[14px] font-semibold ${
                      selected
                        ? 'bg-[#FFF3E6] border-[#D96B08] text-[#D96B08]'
                        : 'border-[#EBD7C3] text-[#6E3906]'
                    }`}
                  >
                    <span>{esp}</span>
                    <span>{selected ? '✓' : ''}</span>
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              onClick={() => setEspecieModalVisible(false)}
              className="w-full h-10 rounded-full bg-[#D96B08] text-white text-[14px] font-bold"
            >
              Concluir
            </button>
          </div>
        </div>
      )}

      {/* Modal Tópicos */}
      {tagModalVisible && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) setTagModalVisible(false);
          }}
          className="fixed inset-0 z-50 bg-[#281402]/45 flex items-center justify-center p-4"
        >
          <div className="w-full max-w-[340px] bg-white rounded-[20px] border border-[#F0DFCE] p-5 flex flex-col gap-3.5">
            <div className="flex items-center justify-between pb-2 border-b border-[#F0DFCE]">
              <h3 className="text-[16px] font-bold text-[#8A4505]">Filtrar por Tópico</h3>
              <button
                type="button"
                onClick={() => setTagModalVisible(false)}
                className="text-2xl text-[#B8651B]"
              >
                ×
              </button>
            </div>
            <div className="flex flex-col gap-2">
              {uniqueTags.map((tag) => {
                const selected = selectedTags.includes(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() =>
                      setSelectedTags((p) =>
                        p.includes(tag) ? p.filter((i) => i !== tag) : [...p, tag]
                      )
                    }
                    className={`px-3 py-2.5 rounded-xl border flex justify-between items-center text-[14px] font-semibold ${
                      selected
                        ? 'bg-[#FFF3E6] border-[#D96B08] text-[#D96B08]'
                        : 'border-[#EBD7C3] text-[#6E3906]'
                    }`}
                  >
                    <span>{tag}</span>
                    <span>{selected ? '✓' : ''}</span>
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              onClick={() => setTagModalVisible(false)}
              className="w-full h-10 rounded-full bg-[#D96B08] text-white text-[14px] font-bold"
            >
              Concluir
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

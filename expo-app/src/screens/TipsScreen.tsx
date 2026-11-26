import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { CustomScrollView } from '../components/CustomScrollView';
import { useApp } from '../context/AppContext';
import { ApiError } from '../services/api';
import { DicaCompleta, DicaResumo } from '../types';

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
      lines.length > 0 &&
      lines.every((line) => line.startsWith('• ') || line.startsWith('- '));

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

export const TipsScreen: React.FC = () => {
  const { dicas, fetchTipDetails } = useApp();

  const [search, setSearch] = useState<string>('');
  const [selectedEspecies, setSelectedEspecies] = useState<string[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

  const [especieModalVisible, setEspecieModalVisible] =
    useState<boolean>(false);
  const [tagModalVisible, setTagModalVisible] = useState<boolean>(false);

  const [readingTipSummary, setReadingTipSummary] =
    useState<DicaResumo | null>(null);
  const [loadingArticle, setLoadingArticle] = useState<boolean>(false);
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
        selectedEspecies.length === 0 ||
        selectedEspecies.includes(item.especie);
      const matchTag =
        selectedTags.length === 0 || selectedTags.includes(item.tag);
      return matchSearch && matchEspecie && matchTag;
    });
  }, [dicas, search, selectedEspecies, selectedTags]);

  const relatedTips = useMemo(() => {
    if (!readingTipSummary) return [];
    const others = dicas.filter(
      (d) => d.id_dicas !== readingTipSummary.id_dicas
    );
    const sameSpecies = others.filter(
      (d) => d.especie === readingTipSummary.especie
    );
    const differentSpecies = others.filter(
      (d) => d.especie !== readingTipSummary.especie
    );
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

  const toggleEspecie = (especie: string) => {
    setSelectedEspecies((prev) =>
      prev.includes(especie)
        ? prev.filter((item) => item !== especie)
        : [...prev, especie]
    );
  };

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((item) => item !== tag) : [...prev, tag]
    );
  };

  const handleOpenTip = async (tipSummary: DicaResumo) => {
    const currentRequestId = ++requestIdRef.current;
    setReadingTipSummary(tipSummary);
    setLoadingArticle(true);
    setArticleError(null);
    setActiveTip({
      ...tipSummary,
      artigo: '',
    });

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
  };

  useEffect(() => {
    if (!readingTipSummary) return;

    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      () => {
        handleBackToTips();
        return true;
      }
    );

    return () => {
      subscription.remove();
    };
  }, [readingTipSummary]);

  const renderBulletText = (item: string) => {
    const colonIdx = item.indexOf(':');
    if (colonIdx > 0 && colonIdx <= 48) {
      return (
        <Text style={styles.bulletText}>
          <Text style={styles.bulletLead}>{item.slice(0, colonIdx + 1)}</Text>
          {item.slice(colonIdx + 1)}
        </Text>
      );
    }
    return <Text style={styles.bulletText}>{item}</Text>;
  };

  // Página dedicada de leitura do artigo (estilo blog, sem pop-up)
  if (readingTipSummary) {
    const displayTip = activeTip || readingTipSummary;

    return (
      <LinearGradient colors={['#FDF8F2', '#F7EDE4']} style={styles.gradient}>
        <CustomScrollView
          key={readingTipSummary.id_dicas}
          contentContainerStyle={styles.articlePageScroll}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.articlePageContainer}>
            <View style={styles.readerTopBar}>
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={handleBackToTips}
                style={styles.backButton}
                accessibilityRole="button"
                accessibilityLabel="Voltar para Dicas"
              >
                <Text style={styles.backButtonArrow}>‹</Text>
                <Text style={styles.backButtonText}>Voltar para Dicas</Text>
              </TouchableOpacity>

              <Text style={styles.blogLabel}>BLOG PETMOOD</Text>
            </View>

            <View style={styles.articleCard}>
              <View style={styles.articleHeader}>
                <View style={styles.articleMetaRow}>
                  <View style={styles.tipBadges}>
                    <View style={styles.badgeEspecie}>
                      <Text style={styles.badgeEspecieText}>
                        {displayTip.especie}
                      </Text>
                    </View>
                    <View style={styles.badgeTag}>
                      <Text style={styles.badgeTagText}>{displayTip.tag}</Text>
                    </View>
                  </View>

                  {readingMinutes && !loadingArticle ? (
                    <Text style={styles.readingTimeText}>
                      {readingMinutes} min de leitura
                    </Text>
                  ) : null}
                </View>

                <Text style={styles.articleTitle}>{displayTip.titulo}</Text>
              </View>

              {loadingArticle ? (
                <View style={styles.loadingArticleBox}>
                  <ActivityIndicator size="large" color="#D96B08" />
                  <Text style={styles.loadingArticleText}>
                    Carregando artigo completo...
                  </Text>
                </View>
              ) : articleError ? (
                <View style={styles.errorBox}>
                  <Text style={styles.articleErrorText}>{articleError}</Text>
                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={() => handleOpenTip(readingTipSummary)}
                    style={styles.retryBtn}
                  >
                    <Text style={styles.btnPrimaryText}>Tentar novamente</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.articleContent}>
                  {articleBlocks.map((block, index) => {
                    if (block.type === 'heading') {
                      return (
                        <View key={`heading-${index}`} style={styles.sectionHeadingRow}>
                          <View style={styles.sectionHeadingAccent} />
                          <Text style={styles.sectionHeadingText}>
                            {block.text}
                          </Text>
                        </View>
                      );
                    }

                    if (block.type === 'callout') {
                      return (
                        <View key={`callout-${index}`} style={styles.calloutBox}>
                          <Text style={styles.calloutText}>{block.text}</Text>
                        </View>
                      );
                    }

                    if (block.type === 'list') {
                      return (
                        <View key={`list-${index}`} style={styles.bulletList}>
                          {block.items.map((item, itemIdx) => (
                            <View
                              key={`item-${index}-${itemIdx}`}
                              style={styles.bulletItem}
                            >
                              <View style={styles.bulletDot} />
                              <View style={styles.bulletTextWrap}>
                                {renderBulletText(item)}
                              </View>
                            </View>
                          ))}
                        </View>
                      );
                    }

                    return (
                      <Text key={`p-${index}`} style={styles.articleParagraph}>
                        {block.text}
                      </Text>
                    );
                  })}

                  <View style={styles.articleFooter}>
                    <Text style={styles.articleDisclaimer}>
                      Conteúdo informativo do Blog PetMood. Em caso de dúvidas
                      específicas ou sinais clínicos no seu pet, consulte sempre
                      um médico-veterinário.
                    </Text>
                  </View>
                </View>
              )}
            </View>

            {relatedTips.length > 0 ? (
              <View style={styles.relatedSection}>
                <Text style={styles.relatedTitle}>Continue lendo no Blog</Text>
                <View style={styles.relatedList}>
                  {relatedTips.map((item) => (
                    <TouchableOpacity
                      key={item.id_dicas}
                      activeOpacity={0.85}
                      onPress={() => handleOpenTip(item)}
                      style={styles.relatedCard}
                      accessibilityRole="button"
                      accessibilityLabel={item.titulo}
                    >
                      <View style={styles.tipBadges}>
                        <View style={styles.badgeEspecie}>
                          <Text style={styles.badgeEspecieText}>
                            {item.especie}
                          </Text>
                        </View>
                        <View style={styles.badgeTag}>
                          <Text style={styles.badgeTagText}>{item.tag}</Text>
                        </View>
                      </View>
                      <Text style={styles.relatedCardTitle}>{item.titulo}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            ) : null}

            <TouchableOpacity
              activeOpacity={0.85}
              onPress={handleBackToTips}
              style={styles.btnPrimary}
              accessibilityRole="button"
              accessibilityLabel="Voltar para todas as dicas"
            >
              <Text style={styles.btnPrimaryText}>
                Voltar para todas as dicas
              </Text>
            </TouchableOpacity>
          </View>
        </CustomScrollView>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient colors={['#FDF8F2', '#F7EDE4']} style={styles.gradient}>
      <CustomScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.container}>
          <View style={styles.pageHeader}>
            <Text style={styles.pageTitle}>Dicas e Cuidados</Text>
            <Text style={styles.pageSubtitle}>
              Artigos completos para a saúde e o bem-estar do seu pet
            </Text>
          </View>

          {/* Campo de Busca */}
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Pesquisar por título ou tema..."
            placeholderTextColor="#9E8A78"
            style={styles.searchInput}
            accessibilityLabel="Pesquisar dicas por título"
          />

          {/* Filtros: Espécie e Tópicos */}
          <View style={styles.filterRow}>
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => setEspecieModalVisible(true)}
              style={[
                styles.filterBtn,
                selectedEspecies.length > 0 && styles.filterBtnActive,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Filtrar por espécie"
            >
              <Text
                style={[
                  styles.filterBtnText,
                  selectedEspecies.length > 0 && styles.filterBtnTextActive,
                ]}
              >
                Espécie
                {selectedEspecies.length > 0
                  ? ` (${selectedEspecies.length})`
                  : ''}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => setTagModalVisible(true)}
              style={[
                styles.filterBtn,
                selectedTags.length > 0 && styles.filterBtnActive,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Filtrar por tópicos"
            >
              <Text
                style={[
                  styles.filterBtnText,
                  selectedTags.length > 0 && styles.filterBtnTextActive,
                ]}
              >
                Tópicos
                {selectedTags.length > 0 ? ` (${selectedTags.length})` : ''}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Lista de Cards de Dicas */}
          {filteredTips.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateText}>
                Nenhuma dica encontrada para os filtros selecionados.
              </Text>
            </View>
          ) : (
            <View style={styles.tipsList}>
              {filteredTips.map((item) => (
                <TouchableOpacity
                  key={item.id_dicas}
                  activeOpacity={0.85}
                  onPress={() => handleOpenTip(item)}
                  style={styles.tipCard}
                  accessibilityRole="button"
                  accessibilityLabel={item.titulo}
                >
                  <View style={styles.tipBadges}>
                    <View style={styles.badgeEspecie}>
                      <Text style={styles.badgeEspecieText}>
                        {item.especie}
                      </Text>
                    </View>
                    <View style={styles.badgeTag}>
                      <Text style={styles.badgeTagText}>{item.tag}</Text>
                    </View>
                  </View>

                  <Text style={styles.tipTitle}>{item.titulo}</Text>
                  <Text style={styles.tipCta}>Ler artigo completo &gt;</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>
      </CustomScrollView>

      {/* Modal 1: Filtro Espécie */}
      <Modal
        visible={especieModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setEspecieModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setEspecieModalVisible(false)}
            accessibilityLabel="Fechar pop-up"
          />
          <View style={styles.modalBox}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Filtrar por Espécie</Text>
              <TouchableOpacity onPress={() => setEspecieModalVisible(false)}>
                <Text style={styles.modalClose}>×</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.optionList}>
              {uniqueEspecies.map((esp) => {
                const selected = selectedEspecies.includes(esp);
                return (
                  <TouchableOpacity
                    key={esp}
                    activeOpacity={0.8}
                    onPress={() => toggleEspecie(esp)}
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
                      {esp}
                    </Text>
                    <Text style={styles.optionCheck}>
                      {selected ? '✓' : ''}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => setEspecieModalVisible(false)}
              style={styles.btnPrimary}
            >
              <Text style={styles.btnPrimaryText}>Concluir</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Modal 2: Filtro Tópicos */}
      <Modal
        visible={tagModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setTagModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setTagModalVisible(false)}
            accessibilityLabel="Fechar pop-up"
          />
          <View style={styles.modalBox}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Filtrar por Tópico</Text>
              <TouchableOpacity onPress={() => setTagModalVisible(false)}>
                <Text style={styles.modalClose}>×</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.optionList}>
              {uniqueTags.map((tag) => {
                const selected = selectedTags.includes(tag);
                return (
                  <TouchableOpacity
                    key={tag}
                    activeOpacity={0.8}
                    onPress={() => toggleTag(tag)}
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
                      {tag}
                    </Text>
                    <Text style={styles.optionCheck}>
                      {selected ? '✓' : ''}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => setTagModalVisible(false)}
              style={styles.btnPrimary}
            >
              <Text style={styles.btnPrimaryText}>Concluir</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  gradient: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: 24,
    paddingBottom: 48,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  container: {
    width: '100%',
    maxWidth: 390,
    gap: 16,
  },
  articlePageScroll: {
    paddingTop: 20,
    paddingBottom: 56,
    paddingHorizontal: 18,
    alignItems: 'center',
  },
  articlePageContainer: {
    width: '100%',
    maxWidth: 460,
    gap: 18,
  },
  readerTopBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#EBD7C3',
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 14,
    shadowColor: '#8A4505',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 1,
  },
  backButtonArrow: {
    fontSize: 20,
    lineHeight: 20,
    color: '#D96B08',
    fontFamily: 'PlusJakartaSans_700Bold',
    marginTop: -2,
  },
  backButtonText: {
    fontSize: 13,
    fontFamily: 'PlusJakartaSans_700Bold',
    color: '#8A4505',
  },
  blogLabel: {
    fontSize: 11,
    fontFamily: 'PlusJakartaSans_700Bold',
    color: '#B8651B',
    letterSpacing: 0.8,
  },
  articleCard: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#EBD7C3',
    borderRadius: 22,
    padding: 20,
    gap: 16,
    shadowColor: '#8A4505',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
    elevation: 2,
  },
  articleHeader: {
    gap: 12,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F0DFCE',
  },
  articleMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 8,
  },
  readingTimeText: {
    fontSize: 11.5,
    fontFamily: 'PlusJakartaSans_600SemiBold',
    color: '#B8651B',
  },
  articleTitle: {
    fontSize: 21,
    fontFamily: 'PlusJakartaSans_700Bold',
    color: '#8A4505',
    lineHeight: 28,
  },
  articleContent: {
    gap: 14,
  },
  articleParagraph: {
    fontSize: 15,
    fontFamily: 'PlusJakartaSans_400Regular',
    color: '#6E3906',
    lineHeight: 25,
  },
  sectionHeadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
  },
  sectionHeadingAccent: {
    width: 5,
    height: 20,
    borderRadius: 999,
    backgroundColor: '#D96B08',
  },
  sectionHeadingText: {
    flex: 1,
    fontSize: 17,
    fontFamily: 'PlusJakartaSans_700Bold',
    color: '#8A4505',
    lineHeight: 23,
  },
  calloutBox: {
    backgroundColor: '#FFF6EC',
    borderLeftWidth: 4,
    borderLeftColor: '#D96B08',
    borderTopRightRadius: 12,
    borderBottomRightRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  calloutText: {
    fontSize: 14,
    fontFamily: 'PlusJakartaSans_500Medium',
    color: '#6E3906',
    lineHeight: 22,
  },
  bulletList: {
    gap: 10,
    paddingLeft: 2,
  },
  bulletItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  bulletDot: {
    width: 7,
    height: 7,
    borderRadius: 999,
    backgroundColor: '#D96B08',
    marginTop: 9,
  },
  bulletTextWrap: {
    flex: 1,
  },
  bulletText: {
    fontSize: 14.5,
    fontFamily: 'PlusJakartaSans_400Regular',
    color: '#6E3906',
    lineHeight: 23,
  },
  bulletLead: {
    fontFamily: 'PlusJakartaSans_700Bold',
    color: '#8A4505',
  },
  articleFooter: {
    marginTop: 6,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: '#F0DFCE',
  },
  articleDisclaimer: {
    fontSize: 12,
    fontFamily: 'PlusJakartaSans_400Regular',
    color: '#9E8A78',
    lineHeight: 18,
  },
  errorBox: {
    paddingVertical: 20,
    alignItems: 'center',
    gap: 12,
  },
  retryBtn: {
    paddingHorizontal: 22,
    height: 40,
    borderRadius: 999,
    backgroundColor: '#D96B08',
    justifyContent: 'center',
    alignItems: 'center',
  },
  relatedSection: {
    gap: 10,
  },
  relatedTitle: {
    fontSize: 14,
    fontFamily: 'PlusJakartaSans_700Bold',
    color: '#8A4505',
    paddingHorizontal: 4,
  },
  relatedList: {
    gap: 10,
  },
  relatedCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#EBD7C3',
    borderRadius: 16,
    padding: 14,
    gap: 6,
  },
  relatedCardTitle: {
    fontSize: 14,
    fontFamily: 'PlusJakartaSans_700Bold',
    color: '#6E3906',
    lineHeight: 20,
  },
  pageHeader: {
    alignItems: 'center',
  },
  pageTitle: {
    fontSize: 22,
    fontFamily: 'PlusJakartaSans_700Bold',
    color: '#8A4505',
    marginBottom: 4,
    textAlign: 'center',
  },
  pageSubtitle: {
    fontSize: 13.5,
    fontFamily: 'PlusJakartaSans_400Regular',
    color: '#B8651B',
    textAlign: 'center',
  },
  searchInput: {
    width: '100%',
    height: 44,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#EBD7C3',
    borderRadius: 12,
    paddingHorizontal: 14,
    fontFamily: 'PlusJakartaSans_400Regular',
    fontSize: 14,
    color: '#6E3906',
  },
  filterRow: {
    flexDirection: 'row',
    gap: 10,
  },
  filterBtn: {
    flex: 1,
    height: 40,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#EBD7C3',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  filterBtnActive: {
    backgroundColor: '#FFF3E6',
    borderColor: '#D96B08',
  },
  filterBtnText: {
    fontSize: 13,
    fontFamily: 'PlusJakartaSans_700Bold',
    color: '#8A4505',
  },
  filterBtnTextActive: {
    color: '#D96B08',
  },
  tipsList: {
    gap: 12,
  },
  tipCard: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#EBD7C3',
    borderRadius: 16,
    paddingVertical: 15,
    paddingHorizontal: 16,
    gap: 7,
    shadowColor: '#8A4505',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  tipBadges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  badgeEspecie: {
    backgroundColor: '#D96B08',
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 999,
  },
  badgeEspecieText: {
    fontSize: 11,
    fontFamily: 'PlusJakartaSans_700Bold',
    color: '#FFFFFF',
  },
  badgeTag: {
    backgroundColor: '#FFF3E6',
    borderWidth: 1,
    borderColor: '#F0DFCE',
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 999,
  },
  badgeTagText: {
    fontSize: 11,
    fontFamily: 'PlusJakartaSans_700Bold',
    color: '#8A4505',
  },
  tipTitle: {
    fontSize: 15.5,
    fontFamily: 'PlusJakartaSans_700Bold',
    color: '#6E3906',
    lineHeight: 21,
  },
  tipCta: {
    fontSize: 12.5,
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
    gap: 14,
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
  optionCheck: {
    fontSize: 14,
    fontFamily: 'PlusJakartaSans_700Bold',
    color: '#D96B08',
  },
  loadingArticleBox: {
    paddingVertical: 36,
    alignItems: 'center',
    gap: 10,
  },
  loadingArticleText: {
    fontSize: 13.5,
    fontFamily: 'PlusJakartaSans_500Medium',
    color: '#B8651B',
  },
  articleErrorText: {
    fontSize: 14,
    fontFamily: 'PlusJakartaSans_600SemiBold',
    color: '#E63946',
    textAlign: 'center',
  },
  btnPrimary: {
    width: '100%',
    height: 44,
    borderRadius: 999,
    backgroundColor: '#D96B08',
    justifyContent: 'center',
    alignItems: 'center',
  },
  btnPrimaryText: {
    fontSize: 14,
    fontFamily: 'PlusJakartaSans_700Bold',
    color: '#FFFFFF',
  },
});

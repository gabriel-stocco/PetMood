import { jsPDF } from 'jspdf';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { IS_NATIVE } from '../services/platform';
import type { Animal, Evento, Vacina } from '../types';
import { formatDateDisplay, getTodayDisplay } from './date';

function formatDateBR(isoDate?: string): string {
  return formatDateDisplay(isoDate, 'Não informada');
}

export function getAnimalEvents(pet: Animal, eventos: Evento[]): Evento[] {
  return [...eventos]
    .filter((ev) => Array.isArray(ev.animal) && ev.animal.some((a) => a.id_animal === pet.id_animal))
    .sort((a, b) => {
      const keyA = `${a.data || '9999-99-99'} ${a.horario || '99:99'}`;
      const keyB = `${b.data || '9999-99-99'} ${b.horario || '99:99'}`;
      return keyA.localeCompare(keyB);
    });
}

export function getAnimalVaccines(pet: Animal): Vacina[] {
  return [...(pet.vacinas || [])].sort((a, b) =>
    (b.data_aplicacao || '').localeCompare(a.data_aplicacao || '')
  );
}

export function buildAnimalPdfFilename(petName: string): string {
  const normalized = (petName || 'animal')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `ficha-${normalized || 'animal'}.pdf`;
}

async function resolveImageAsJpegDataUrl(src?: string): Promise<string | null> {
  if (!src || typeof document === 'undefined' || typeof Image === 'undefined') return null;

  if (src.startsWith('data:image/jpeg') || src.startsWith('data:image/jpg')) {
    return src;
  }

  return new Promise<string | null>((resolve) => {
    let settled = false;
    const finish = (value: string | null) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    const timer = setTimeout(() => finish(null), 1500);

    try {
      const img = new Image();
      if (!src.startsWith('data:')) {
        img.crossOrigin = 'anonymous';
      }
      img.onload = () => {
        clearTimeout(timer);
        try {
          const canvas = document.createElement('canvas');
          const size = 240;
          canvas.width = size;
          canvas.height = size;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            finish(src.startsWith('data:image/png') ? src : null);
            return;
          }
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, size, size);
          const scale = Math.max(size / img.width, size / img.height);
          const w = img.width * scale;
          const h = img.height * scale;
          ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
          finish(canvas.toDataURL('image/jpeg', 0.85));
        } catch {
          finish(src.startsWith('data:image/png') ? src : null);
        }
      };
      img.onerror = () => {
        clearTimeout(timer);
        finish(src.startsWith('data:image/png') ? src : null);
      };
      img.src = src;
    } catch {
      clearTimeout(timer);
      finish(null);
    }
  });
}

function getEventNotificationChannelsText(ev: Evento): string {
  const channels: string[] = [];
  if (ev.notificacao_app) channels.push('App');
  if (ev.notificacao_whatsapp) channels.push('WhatsApp');
  return channels.length > 0 ? channels.join(', ') : 'Nenhum';
}

export async function buildAnimalPdfDocument(
  pet: Animal,
  eventos: Evento[]
): Promise<jsPDF> {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 16;
  const contentWidth = pageWidth - marginX * 2;
  const bottomLimit = pageHeight - 18;
  let y = 16;

  const ensureSpace = (neededMm: number) => {
    if (y + neededMm > bottomLimit) {
      doc.addPage();
      y = 18;
    }
  };

  const drawSectionHeading = (title: string) => {
    ensureSpace(14);
    doc.setFillColor(255, 243, 230);
    doc.setDrawColor(240, 223, 206);
    doc.roundedRect(marginX, y, contentWidth, 9, 2, 2, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11.5);
    doc.setTextColor(138, 69, 5);
    doc.text(title, marginX + 4, y + 6.1);
    y += 13;
  };

  const drawKeyValueLine = (label: string, value: string, x = marginX, maxWidth = contentWidth) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(184, 101, 27);
    doc.text(label, x, y);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10.5);
    doc.setTextColor(60, 30, 5);
    const lines = doc.splitTextToSize(value || '-', maxWidth) as string[];
    const blockHeight = Math.max(1, lines.length) * 4.8 + 3;
    ensureSpace(blockHeight + 4);
    doc.text(lines, x, y + 4.8);
    y += blockHeight + 2.5;
  };

  // Header Banner
  doc.setFillColor(217, 107, 8);
  doc.roundedRect(marginX, y, contentWidth, 24, 3, 3, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(255, 255, 255);
  doc.text('PetMood - Ficha Completa do Animal', marginX + 6, y + 10);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.text(`Gerado em ${getTodayDisplay()}`, marginX + 6, y + 17.5);
  y += 30;

  // Hero: Optional Photo + Name Summary
  const photoDataUrl = await resolveImageAsJpegDataUrl(pet.foto);
  const heroStartY = y;
  const hasPhoto = Boolean(photoDataUrl);
  let textStartX = marginX;

  if (photoDataUrl) {
    try {
      const format = photoDataUrl.startsWith('data:image/png') ? 'PNG' : 'JPEG';
      doc.setDrawColor(217, 107, 8);
      doc.setLineWidth(0.7);
      doc.roundedRect(marginX, heroStartY, 28, 28, 3, 3, 'S');
      doc.addImage(photoDataUrl, format, marginX + 0.8, heroStartY + 0.8, 26.4, 26.4);
      textStartX = marginX + 34;
    } catch {
      textStartX = marginX;
    }
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(110, 57, 6);
  const nameLines = doc.splitTextToSize(pet.nome || 'Sem nome', contentWidth - (textStartX - marginX)) as string[];
  doc.text(nameLines, textStartX, heroStartY + 8);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(217, 107, 8);
  const subtitle = `${pet.especie || 'Espécie não informada'}${pet.raca ? ` - ${pet.raca}` : ''}`;
  doc.text(subtitle, textStartX, heroStartY + 8 + nameLines.length * 6.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(138, 69, 5);
  const animalEvents = getAnimalEvents(pet, eventos);
  const animalVaccines = getAnimalVaccines(pet);
  doc.text(
    `${animalVaccines.length} vacina(s) registrada(s)  |  ${animalEvents.length} evento(s) vinculado(s)`,
    textStartX,
    heroStartY + 14 + nameLines.length * 6.5
  );

  y = Math.max(heroStartY + (hasPhoto ? 32 : 24), heroStartY + 20 + nameLines.length * 6.5);

  // Section 1: Dados do Animal
  drawSectionHeading('Dados do Animal');

  const colWidth = (contentWidth - 6) / 2;
  const drawTwoColumnRow = (
    leftLabel: string,
    leftValue: string,
    rightLabel: string,
    rightValue: string
  ) => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10.5);
    const leftLines = doc.splitTextToSize(leftValue || '-', colWidth) as string[];
    const rightLines = doc.splitTextToSize(rightValue || '-', colWidth) as string[];
    const rowHeight = Math.max(leftLines.length, rightLines.length) * 4.8 + 8;
    ensureSpace(rowHeight);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(184, 101, 27);
    doc.text(leftLabel, marginX, y);
    doc.text(rightLabel, marginX + colWidth + 6, y);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10.5);
    doc.setTextColor(60, 30, 5);
    doc.text(leftLines, marginX, y + 4.8);
    doc.text(rightLines, marginX + colWidth + 6, y + 4.8);

    y += rowHeight;
  };

  drawTwoColumnRow('NOME', pet.nome || 'Não informado', 'ESPÉCIE', pet.especie || 'Não informada');
  drawTwoColumnRow('RAÇA', pet.raca || 'Não informada', 'GÊNERO', pet.genero || 'Não informado');
  drawTwoColumnRow(
    'DATA DE NASCIMENTO',
    formatDateBR(pet.data_nascimento),
    'RAÇÃO',
    pet.racao || 'Não informada'
  );
  drawKeyValueLine(
    'OBSERVAÇÃO',
    pet.observacao || 'Nenhuma observação cadastrada.'
  );

  y += 2;

  // Section 2: Vacinas
  drawSectionHeading(`Vacinas Registradas (${animalVaccines.length})`);

  if (animalVaccines.length === 0) {
    ensureSpace(10);
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(10);
    doc.setTextColor(138, 69, 5);
    doc.text('Nenhuma vacina registrada para este animal.', marginX, y);
    y += 9;
  } else {
    animalVaccines.forEach((vac, idx) => {
      const obsText = vac.observacao ? `Observação: ${vac.observacao}` : 'Observação: Nenhuma';
      const obsLines = doc.splitTextToSize(obsText, contentWidth - 8) as string[];
      const cardHeight = 15 + obsLines.length * 4.6;
      ensureSpace(cardHeight + 4);

      doc.setFillColor(255, 253, 251);
      doc.setDrawColor(235, 215, 195);
      doc.roundedRect(marginX, y, contentWidth, cardHeight, 2, 2, 'FD');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10.5);
      doc.setTextColor(110, 57, 6);
      doc.text(`${idx + 1}. ${vac.nome_vacina}`, marginX + 4, y + 5.8);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(217, 107, 8);
      doc.text(
        `Aplicação: ${formatDateBR(vac.data_aplicacao)}  |  Comprovante: ${
          vac.foto_carteira ? 'Anexado' : 'Não anexado'
        }`,
        marginX + 4,
        y + 11.2
      );

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9.5);
      doc.setTextColor(80, 48, 22);
      doc.text(obsLines, marginX + 4, y + 16.4);

      y += cardHeight + 3.5;
    });
  }

  y += 2;

  // Section 3: Eventos e Alarmes
  drawSectionHeading(`Eventos e Alarmes (${animalEvents.length})`);

  if (animalEvents.length === 0) {
    ensureSpace(10);
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(10);
    doc.setTextColor(138, 69, 5);
    doc.text('Nenhum evento ou alarme vinculado a este animal.', marginX, y);
    y += 9;
  } else {
    animalEvents.forEach((ev, idx) => {
      const detailLines: string[] = [];
      detailLines.push(
        `Tipo: ${ev.tipo_evento}  |  Data: ${formatDateBR(ev.data)}  |  Horário: ${
          ev.horario || 'Não informado'
        }`
      );
      if (ev.tipo_evento === 'Alarme') {
        detailLines.push(
          `Alarme: ${ev.alarme_ligado ? 'Ligado' : 'Desligado'}  |  Frequência: ${
            ev.frequencia || 'Uma vez'
          }`
        );
      }
      if (ev.local) {
        detailLines.push(`Local: ${ev.local}`);
      }
      if (ev.veterinario) {
        detailLines.push(`Veterinário: ${ev.veterinario}`);
      }
      detailLines.push(`Canais de notificação: ${getEventNotificationChannelsText(ev)}`);
      if (ev.anotacao) {
        detailLines.push(`Anotação: ${ev.anotacao}`);
      }

      const wrappedLines = detailLines.flatMap(
        (line) => doc.splitTextToSize(line, contentWidth - 8) as string[]
      );
      const cardHeight = 11 + wrappedLines.length * 4.6;
      ensureSpace(cardHeight + 4);

      doc.setFillColor(255, 253, 251);
      doc.setDrawColor(235, 215, 195);
      doc.roundedRect(marginX, y, contentWidth, cardHeight, 2, 2, 'FD');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10.5);
      doc.setTextColor(110, 57, 6);
      doc.text(`${idx + 1}. ${ev.titulo || ev.tipo_evento}`, marginX + 4, y + 6);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9.5);
      doc.setTextColor(80, 48, 22);
      doc.text(wrappedLines, marginX + 4, y + 11.4);

      y += cardHeight + 3.5;
    });
  }

  // Footer with page numbers
  const totalPages = doc.getNumberOfPages();
  for (let page = 1; page <= totalPages; page++) {
    doc.setPage(page);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(166, 114, 70);
    doc.text(
      `PetMood - Ficha de ${pet.nome}`,
      marginX,
      pageHeight - 8
    );
    doc.text(
      `Página ${page} de ${totalPages}`,
      pageWidth - marginX,
      pageHeight - 8,
      { align: 'right' }
    );
  }

  return doc;
}

export async function downloadAnimalPdf(pet: Animal, eventos: Evento[]): Promise<string> {
  const doc = await buildAnimalPdfDocument(pet, eventos);
  const filename = buildAnimalPdfFilename(pet.nome);
  if (IS_NATIVE) {
    // WebView downloads go nowhere: save to the app cache and open the Android share sheet.
    const base64 = doc.output('datauristring').split(',')[1] || '';
    const saved = await Filesystem.writeFile({ path: filename, data: base64, directory: Directory.Cache });
    await Share.share({ title: filename, files: [saved.uri], dialogTitle: 'Salvar ou enviar a ficha' }).catch(
      () => undefined // user closed the share sheet
    );
    return filename;
  }
  doc.save(filename);
  return filename;
}

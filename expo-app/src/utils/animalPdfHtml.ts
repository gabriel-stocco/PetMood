import { Animal, Evento, Vacina } from '../types';

import { formatDateDisplay, getTodayDisplay } from './date';

function escapeHtml(text?: string): string {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDateBR(isoDate?: string): string {
  return formatDateDisplay(isoDate, 'Não informada');
}

export function getAnimalEvents(pet: Animal, eventos: Evento[]): Evento[] {
  return [...eventos]
    .filter(
      (ev) =>
        Array.isArray(ev.animal) &&
        ev.animal.some((a) => a.id_animal === pet.id_animal)
    )
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

function getEventNotificationChannelsText(ev: Evento): string {
  const channels: string[] = [];
  if (ev.notificacao_app) channels.push('App');
  if (ev.notificacao_whatsapp) channels.push('WhatsApp');
  return channels.length > 0 ? channels.join(', ') : 'Nenhum';
}

export function buildAnimalPdfHtml(pet: Animal, eventos: Evento[]): string {
  const animalVaccines = getAnimalVaccines(pet);
  const animalEvents = getAnimalEvents(pet, eventos);
  const generatedDate = getTodayDisplay();
  const initial = escapeHtml((pet.nome || 'A').charAt(0).toUpperCase());

  const photoHtml = pet.foto
    ? `<img src="${escapeHtml(pet.foto)}" alt="${escapeHtml(pet.nome)}" class="avatar-img" />`
    : `<div class="avatar-fallback">${initial}</div>`;

  const vaccinesHtml =
    animalVaccines.length === 0
      ? '<p class="empty">Nenhuma vacina registrada para este animal.</p>'
      : animalVaccines
          .map(
            (vac, idx) => `
          <div class="card">
            <div class="card-title">${idx + 1}. ${escapeHtml(vac.nome_vacina)}</div>
            <div class="card-meta">
              Aplicação: ${escapeHtml(formatDateBR(vac.data_aplicacao))} &bull;
              Comprovante: ${vac.foto_carteira ? 'Anexado' : 'Não anexado'}
            </div>
            <div class="card-body">
              Observação: ${escapeHtml(vac.observacao || 'Nenhuma')}
            </div>
          </div>`
          )
          .join('');

  const eventsHtml =
    animalEvents.length === 0
      ? '<p class="empty">Nenhum evento ou alarme vinculado a este animal.</p>'
      : animalEvents
          .map((ev, idx) => {
            const extraRows = [
              `Tipo: ${escapeHtml(ev.tipo_evento)} &bull; Data: ${escapeHtml(
                formatDateBR(ev.data)
              )} &bull; Horário: ${escapeHtml(ev.horario || 'Não informado')}`,
            ];
            if (ev.tipo_evento === 'Alarme') {
              extraRows.push(
                `Alarme: ${ev.alarme_ligado ? 'Ligado' : 'Desligado'} &bull; Frequência: ${escapeHtml(
                  ev.frequencia || 'Uma vez'
                )}`
              );
            }
            if (ev.local) {
              extraRows.push(`Local: ${escapeHtml(ev.local)}`);
            }
            if (ev.veterinario) {
              extraRows.push(`Veterinário: ${escapeHtml(ev.veterinario)}`);
            }
            extraRows.push(
              `Canais de notificação: ${escapeHtml(getEventNotificationChannelsText(ev))}`
            );
            if (ev.anotacao) {
              extraRows.push(`Anotação: ${escapeHtml(ev.anotacao)}`);
            }
            return `
          <div class="card">
            <div class="card-title">${idx + 1}. ${escapeHtml(ev.titulo || ev.tipo_evento)}</div>
            ${extraRows.map((line) => `<div class="card-body">${line}</div>`).join('')}
          </div>`;
          })
          .join('');

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <style>
    body { font-family: Helvetica, Arial, sans-serif; color: #3C1E05; padding: 24px; margin: 0; }
    .banner { background: #D96B08; color: #FFFFFF; border-radius: 10px; padding: 16px 20px; margin-bottom: 20px; }
    .banner h1 { margin: 0 0 4px; font-size: 20px; }
    .banner p { margin: 0; font-size: 12px; opacity: 0.92; }
    .hero { display: flex; align-items: center; gap: 16px; margin-bottom: 20px; }
    .avatar-img { width: 76px; height: 76px; border-radius: 38px; object-fit: cover; border: 3px solid #D96B08; }
    .avatar-fallback { width: 76px; height: 76px; border-radius: 38px; background: #FFF3E6; border: 3px solid #D96B08; color: #D96B08; font-size: 28px; font-weight: bold; display: flex; align-items: center; justify-content: center; }
    .hero-name { font-size: 22px; font-weight: bold; color: #6E3906; margin: 0 0 4px; }
    .hero-sub { font-size: 13px; font-weight: bold; color: #D96B08; margin: 0 0 4px; }
    .hero-stats { font-size: 12px; color: #8A4505; margin: 0; }
    .section-title { background: #FFF3E6; border: 1px solid #F0DFCE; color: #8A4505; font-size: 14px; font-weight: bold; padding: 8px 12px; border-radius: 8px; margin: 18px 0 10px; }
    .grid { display: flex; flex-wrap: wrap; gap: 10px; background: #FFFDFB; border: 1px solid #F0DFCE; border-radius: 10px; padding: 12px; }
    .field { width: 47%; }
    .field-full { width: 100%; }
    .label { font-size: 10px; font-weight: bold; color: #B8651B; text-transform: uppercase; margin-bottom: 2px; }
    .value { font-size: 13px; color: #3C1E05; font-weight: 600; }
    .card { background: #FFFDFB; border: 1px solid #EBD7C3; border-radius: 10px; padding: 10px 12px; margin-bottom: 8px; page-break-inside: avoid; }
    .card-title { font-size: 13.5px; font-weight: bold; color: #6E3906; margin-bottom: 4px; }
    .card-meta { font-size: 11.5px; font-weight: bold; color: #D96B08; margin-bottom: 4px; }
    .card-body { font-size: 12px; color: #503016; line-height: 1.4; }
    .empty { font-size: 12.5px; color: #8A4505; font-style: italic; margin: 6px 0; }
  </style>
</head>
<body>
  <div class="banner">
    <h1>PetMood - Ficha Completa do Animal</h1>
    <p>Gerado em ${escapeHtml(generatedDate)}</p>
  </div>
  <div class="hero">
    ${photoHtml}
    <div>
      <p class="hero-name">${escapeHtml(pet.nome)}</p>
      <p class="hero-sub">${escapeHtml(pet.especie || 'Espécie não informada')}${pet.raca ? ` &bull; ${escapeHtml(pet.raca)}` : ''}</p>
      <p class="hero-stats">${animalVaccines.length} vacina(s) registrada(s) &bull; ${animalEvents.length} evento(s) vinculado(s)</p>
    </div>
  </div>
  <div class="section-title">Dados do Animal</div>
  <div class="grid">
    <div class="field"><div class="label">Nome</div><div class="value">${escapeHtml(pet.nome || 'Não informado')}</div></div>
    <div class="field"><div class="label">Espécie</div><div class="value">${escapeHtml(pet.especie || 'Não informada')}</div></div>
    <div class="field"><div class="label">Raça</div><div class="value">${escapeHtml(pet.raca || 'Não informada')}</div></div>
    <div class="field"><div class="label">Gênero</div><div class="value">${escapeHtml(pet.genero || 'Não informado')}</div></div>
    <div class="field"><div class="label">Data de Nascimento</div><div class="value">${escapeHtml(formatDateBR(pet.data_nascimento))}</div></div>
    <div class="field"><div class="label">Ração</div><div class="value">${escapeHtml(pet.racao || 'Não informada')}</div></div>
    <div class="field-full"><div class="label">Observação</div><div class="value">${escapeHtml(pet.observacao || 'Nenhuma observação cadastrada.')}</div></div>
  </div>
  <div class="section-title">Vacinas Registradas (${animalVaccines.length})</div>
  ${vaccinesHtml}
  <div class="section-title">Eventos e Alarmes (${animalEvents.length})</div>
  ${eventsHtml}
</body>
</html>`;
}

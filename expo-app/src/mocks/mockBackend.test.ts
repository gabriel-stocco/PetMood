import test from 'node:test';
import assert from 'node:assert/strict';
import { MockApiError, hydrateMockDb, mockApiRequest, setMockPersistHandler } from './mockBackend';
import {
  formatTimeHHMM,
  getAcceptedChannels,
  getAlarmRingKey,
  getAlarmSoundProfileLabel,
  getEffectiveEventDateTimeMs,
  getEventOccurrenceSuppressionKeys,
  getOrphanSnoozeEventIds,
  getReminderKey,
  parseEventDateTimeMs,
} from '../../../src/services/eventNotifications';
import { buildAnimalPdfHtml, getAnimalEvents } from '../utils/animalPdfHtml';
import { formatPhoneMask, hasPhoneHyphenInMiddle, isValidCellPhone } from '../utils/phone';

test('mockBackend: login succeeds with seeded account and returns JWT', async () => {
  const res = await mockApiRequest('/login', {
    email: 'gabriel.stocco@email.com',
    senha: '12345678',
  });
  assert.equal(res.status, 200);
  assert.equal(res.id_usuario, 'usr-01');
  assert.ok(typeof res.accessToken === 'string' && res.accessToken.startsWith('mock-jwt.'));
});

test('mockBackend: protected routes reject missing or invalid JWT with 401', async () => {
  await assert.rejects(
    () => mockApiRequest('/getAll', { id_usuario: 'usr-01' }, {}),
    (err: unknown) => err instanceof MockApiError && err.status === 401
  );
});

test('mockBackend: getAll returns 5-position payload without senha_hash or artigo', async () => {
  const auth = await mockApiRequest('/login', {
    email: 'gabriel.stocco@email.com',
    senha: '12345678',
  });
  const headers = { Authorization: `Bearer ${auth.accessToken}` };
  const all = await mockApiRequest('/getAll', { id_usuario: auth.id_usuario }, headers);

  assert.equal(Array.isArray(all), true);
  assert.equal(all.length, 5);
  assert.equal(all[0].email, 'gabriel.stocco@email.com');
  assert.equal('senha_hash' in all[0], false);
  assert.ok(Array.isArray(all[1].animais) && all[1].animais.length >= 2);
  assert.ok(Array.isArray(all[2].evento));
  assert.ok(Array.isArray(all[3].dicas));
  assert.equal('artigo' in all[3].dicas[0], false);
  assert.ok(Array.isArray(all[4].propaganda) && all[4].propaganda.length <= 5);
});

test('mockBackend: getTip loads full artigo on demand', async () => {
  const auth = await mockApiRequest('/login', {
    email: 'gabriel.stocco@email.com',
    senha: '12345678',
  });
  const headers = { Authorization: `Bearer ${auth.accessToken}` };
  const tip = await mockApiRequest('/getTip', { id_dicas: 'dic-01' }, headers);
  assert.equal(tip.id_dicas, 'dic-01');
  assert.ok(typeof tip.artigo === 'string' && tip.artigo.length > 20);
});

test('mockBackend: full CRUD lifecycle for Animal, Vaccine, Event, and Account', async () => {
  const signup = await mockApiRequest('/createAccount', {
    nome: 'Teste PetMood',
    email: 'teste.crud@email.com',
    senha: 'password123',
    celular: '(11) 99999-0000',
  });
  assert.equal(signup.status, 200);
  const headers = { Authorization: `Bearer ${signup.accessToken}` };

  // Duplicate email throws 409
  await assert.rejects(
    () =>
      mockApiRequest('/createAccount', {
        nome: 'Duplicado',
        email: 'teste.crud@email.com',
        senha: 'password123',
      }),
    (err: unknown) => err instanceof MockApiError && err.status === 409
  );

  // Create & Update Animal
  const pet = await mockApiRequest(
    '/createAnimal',
    {
      id_usuario: signup.id_usuario,
      nome: 'Bidu',
      data_nascimento: '2024-01-10',
      especie: 'Cachorro',
      raca: 'Schnauzer',
      genero: 'Macho',
      racao: 'Super Premium',
      observacao: 'Dócil',
      foto: '',
    },
    headers
  );
  assert.ok(pet.id_animal.startsWith('pet-'));

  const updatedPet = await mockApiRequest(
    '/updateAnimal',
    { id_animal: pet.id_animal, nome: 'Bidu Atualizado' },
    headers
  );
  assert.equal(updatedPet.nome, 'Bidu Atualizado');

  // Create, Update & Delete Vaccine
  const vac = await mockApiRequest(
    '/createVaccine',
    {
      id_animal: pet.id_animal,
      nome_vacina: 'V10',
      data_aplicacao: '2026-05-01',
      observacao: 'OK',
      foto_carteira: 'data:image/png;base64,abc',
    },
    headers
  );
  assert.ok(vac.id_vacina.startsWith('vac-'));

  const updatedVac = await mockApiRequest(
    '/updateVaccine',
    { id_vacina: vac.id_vacina, nome_vacina: 'V10 Reforço' },
    headers
  );
  assert.equal(updatedVac.nome_vacina, 'V10 Reforço');

  await mockApiRequest('/deleteVaccine', { id_vacina: vac.id_vacina }, headers);

  // Create, Update & Delete Event
  const ev = await mockApiRequest(
    '/createEvent',
    {
      tipo_evento: 'Alarme',
      animal: [{ tabela: 'animal', id_animal: pet.id_animal, nome: 'Bidu Atualizado' }],
      titulo: 'Remédio',
      data: '2026-12-01',
      horario: '09:00',
      alarme_ligado: true,
      frequencia: 'Diária',
      notificacao_app: true,
    },
    headers
  );
  assert.ok(ev.id_evento.startsWith('ev-'));
  const updatedEv = await mockApiRequest(
    '/updateEvent',
    { id_evento: ev.id_evento, alarme_ligado: false },
    headers
  );
  assert.equal(updatedEv.alarme_ligado, false);
  await mockApiRequest('/deleteEvent', { id_evento: ev.id_evento }, headers);

  // Update Account & Get Account
  const updatedAcc = await mockApiRequest(
    '/updateAccount',
    { nome: 'Teste Editado', notificacao_whatsapp: true },
    headers
  );
  assert.equal(updatedAcc.nome, 'Teste Editado');
  assert.equal(updatedAcc.notificacao_whatsapp, true);

  const acc = await mockApiRequest('/getAccount', {}, headers);
  assert.equal(acc.nome, 'Teste Editado');

  // Delete Animal & Account
  await mockApiRequest('/deleteAnimal', { id_animal: pet.id_animal }, headers);
  await mockApiRequest('/deleteAccount', {}, headers);
});

test('mockBackend: googleLogin creates or authenticates Google user', async () => {
  const res = await mockApiRequest('/googleLogin', { id_token: 'mock-google-id-token' });
  assert.equal(res.status, 200);
  assert.ok(res.accessToken.startsWith('mock-jwt.'));
});

test('mockBackend: dispatchEventNotifications filters channels by user preferences and phone', async () => {
  const signup = await mockApiRequest('/createAccount', {
    nome: 'Teste Notif',
    email: 'teste.notif@email.com',
    senha: 'password123',
    celular: '(11) 98888-7777',
  });
  const headers = { Authorization: `Bearer ${signup.accessToken}` };

  // Enable global notification channels
  await mockApiRequest(
    '/updateAccount',
    {
      notificacao_app: true,
      notificacao_whatsapp: true,
    },
    headers
  );

  const dispatchRes = await mockApiRequest(
    '/dispatchEventNotifications',
    {
      id_usuario: signup.id_usuario,
      id_evento: 'ev-teste-01',
      titulo: 'Vacina V10',
      animais: 'Thor',
      data: '2026-12-20',
      horario: '14:00',
      local: 'Vet Care',
      janela: '1h',
      janela_label: 'Falta 1 hora',
      canais: ['app', 'whatsapp'],
      mensagem: 'Vacina V10 (Thor) em 20/12/2026 às 14:00',
    },
    headers
  );

  assert.equal(dispatchRes.status, 200);
  assert.equal(dispatchRes.disparos.length, 2);
  assert.deepEqual(
    dispatchRes.disparos.map((d: { canal: string }) => d.canal),
    ['app', 'whatsapp']
  );

  // Disable WhatsApp globally and ensure WhatsApp is skipped even if requested
  await mockApiRequest(
    '/updateAccount',
    {
      notificacao_whatsapp: false,
    },
    headers
  );

  const filteredRes = await mockApiRequest(
    '/dispatchEventNotifications',
    {
      id_usuario: signup.id_usuario,
      id_evento: 'ev-teste-01',
      titulo: 'Vacina V10',
      animais: 'Thor',
      data: '2026-12-20',
      horario: '14:00',
      janela: '1d',
      janela_label: 'Falta 1 dia',
      canais: ['app', 'whatsapp'],
      mensagem: 'Vacina V10 (Thor) em 20/12/2026 às 14:00',
    },
    headers
  );

  assert.equal(filteredRes.disparos.length, 1);
  assert.deepEqual(
    filteredRes.disparos.map((d: { canal: string }) => d.canal),
    ['app']
  );

  await mockApiRequest('/deleteAccount', {}, headers);
});

test('eventNotifications: checks accepted channels by user preferences, phone, and alarm state', () => {
  const eventMs = parseEventDateTimeMs('2026-12-10', '15:30');
  assert.ok(eventMs !== null);

  const baseEvent = {
    id_evento: 'ev-test-1',
    id_usuario: 'usr-01',
    tipo_evento: 'Consulta' as const,
    animal: [{ tabela: 'animal' as const, id_animal: 'pet-1', nome: 'Rex' }],
    titulo: 'Consulta Vet',
    data: '2026-12-10',
    horario: '15:30',
    local: 'PetCare',
    anotacao: '',
    veterinario: '',
    alarme_ligado: false,
    frequencia: '' as const,
    notificacao_app: true,
    notificacao_whatsapp: true,
  };

  const userAll = {
    id_usuario: 'usr-01',
    nome: 'Gabriel',
    email: 'gabriel@email.com',
    celular: '(11) 99999-8888',
    data_nascimento: '',
    genero: '',
    foto: '',
    notificacao_app: true,
    notificacao_whatsapp: true,
  };
  assert.deepEqual(getAcceptedChannels(baseEvent, userAll), ['app', 'whatsapp']);

  // Without phone, only app is accepted
  assert.deepEqual(getAcceptedChannels(baseEvent, { ...userAll, celular: '' }), ['app']);

  // Disabled alarm accepts no channels
  assert.deepEqual(
    getAcceptedChannels({ ...baseEvent, tipo_evento: 'Alarme', alarme_ligado: false }, userAll),
    []
  );
});

test('eventNotifications: getEffectiveEventDateTimeMs advances recurring alarms while preserving HH:MM', () => {
  const dailyAlarm = {
    id_evento: 'ev-alarm-daily',
    id_usuario: 'usr-01',
    tipo_evento: 'Alarme' as const,
    animal: [{ tabela: 'animal' as const, id_animal: 'pet-1', nome: 'Rex' }],
    titulo: 'Remédio',
    data: '2026-12-01',
    horario: '08:00',
    local: '',
    anotacao: '',
    veterinario: '',
    alarme_ligado: true,
    frequencia: 'Diária' as const,
    notificacao_app: true,
    notificacao_whatsapp: false,
  };

  const day3MorningBefore = parseEventDateTimeMs('2026-12-03', '07:45')!;
  const day3AlarmExact = parseEventDateTimeMs('2026-12-03', '08:00')!;
  assert.equal(getEffectiveEventDateTimeMs(dailyAlarm, day3MorningBefore), day3AlarmExact);

  // Within recent grace window (30s after 08:00) still resolves to day 3 08:00 so it rings
  assert.equal(getEffectiveEventDateTimeMs(dailyAlarm, day3AlarmExact + 30_000), day3AlarmExact);

  // Past grace window (3m after 08:00) advances to next day 08:00
  const day4AlarmExact = parseEventDateTimeMs('2026-12-04', '08:00')!;
  assert.equal(getEffectiveEventDateTimeMs(dailyAlarm, day3AlarmExact + 180_000), day4AlarmExact);

  // Weekly alarm advances in 7-day steps
  const weeklyAlarm = { ...dailyAlarm, frequencia: 'Semanal' as const };
  const after10Days = parseEventDateTimeMs('2026-12-11', '09:00')!;
  assert.equal(
    getEffectiveEventDateTimeMs(weeklyAlarm, after10Days),
    parseEventDateTimeMs('2026-12-15', '08:00')
  );
});

test('mockBackend: dispatchEventNotifications supports 2d, 1d, 1h, and 0m and respects saved event channel flags', async () => {
  const signup = await mockApiRequest('/createAccount', {
    nome: 'Teste Janelas',
    email: 'teste.janelas@email.com',
    senha: 'password123',
    celular: '(11) 97777-6666',
  });
  const headers = { Authorization: `Bearer ${signup.accessToken}` };

  await mockApiRequest(
    '/updateAccount',
    { notificacao_app: true, notificacao_whatsapp: true },
    headers
  );

  // Create event with only app enabled in DB
  const ev = await mockApiRequest(
    '/createEvent',
    {
      tipo_evento: 'Consulta',
      animal: [{ tabela: 'animal', id_animal: 'pet-1', nome: 'Rex' }],
      titulo: 'Exame',
      data: '2026-12-25',
      horario: '10:00',
      notificacao_app: true,
      notificacao_whatsapp: false,
    },
    headers
  );

  for (const janela of ['2d', '1d', '1h', '0m'] as const) {
    const res = await mockApiRequest(
      '/dispatchEventNotifications',
      {
        id_usuario: signup.id_usuario,
        id_evento: ev.id_evento,
        titulo: ev.titulo,
        animais_nomes: 'Rex',
        data: ev.data,
        horario: ev.horario,
        janela,
        canais: ['app', 'whatsapp'],
      },
      headers
    );
    assert.equal(res.janela, janela);
    assert.deepEqual(
      res.disparos.map((d: { canal: string }) => d.canal),
      ['app']
    );
  }

  await mockApiRequest('/deleteAccount', {}, headers);
});

test('eventNotifications: getAlarmSoundProfileLabel returns expected labels', () => {
  assert.equal(getAlarmSoundProfileLabel('android'), 'Som padrão Android');
  assert.equal(getAlarmSoundProfileLabel('ios'), 'Som padrão iOS');
  assert.equal(getAlarmSoundProfileLabel('other'), 'Som padrão Android');
  assert.equal(getAlarmSoundProfileLabel(), 'Som padrão Android');
});

test('mockBackend: rejects future animal birth dates on create and update', async () => {
  const signup = await mockApiRequest('/createAccount', {
    nome: 'Teste Data Futura',
    email: 'teste.futuro@email.com',
    senha: 'password123',
  });
  const headers = { Authorization: `Bearer ${signup.accessToken}` };

  const future = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
  const futureISO = `${future.getFullYear()}-${String(future.getMonth() + 1).padStart(
    2,
    '0'
  )}-${String(future.getDate()).padStart(2, '0')}`;

  await assert.rejects(
    () =>
      mockApiRequest(
        '/createAnimal',
        {
          id_usuario: signup.id_usuario,
          nome: 'Viajante',
          data_nascimento: futureISO,
          especie: 'Gato',
          raca: 'SRD',
          genero: 'Macho',
          racao: 'Premium',
        },
        headers
      ),
    (err: unknown) => err instanceof MockApiError && err.status === 400
  );

  const validPet = await mockApiRequest(
    '/createAnimal',
    {
      id_usuario: signup.id_usuario,
      nome: 'Valido',
      data_nascimento: '2024-05-10',
      especie: 'Coelho',
      raca: 'Mini Lop',
      genero: 'Fêmea',
      racao: 'Feno',
    },
    headers
  );

  await assert.rejects(
    () =>
      mockApiRequest(
        '/updateAnimal',
        { id_animal: validPet.id_animal, data_nascimento: futureISO },
        headers
      ),
    (err: unknown) => err instanceof MockApiError && err.status === 400
  );

  await mockApiRequest('/deleteAccount', {}, headers);
});

test('mockBackend: defaults alarme_ligado to true when creating an Alarme and manages notification history persistence/clear', async () => {
  let persistedSnapshot = '';
  setMockPersistHandler((serialized) => {
    persistedSnapshot = serialized;
  });

  const signup = await mockApiRequest('/createAccount', {
    nome: 'Teste Persistencia',
    email: 'teste.persistencia@email.com',
    senha: 'password123',
    celular: '(11) 96666-5555',
  });
  const headers = { Authorization: `Bearer ${signup.accessToken}` };

  const alarm = await mockApiRequest(
    '/createEvent',
    {
      tipo_evento: 'Alarme',
      animal: [{ tabela: 'animal', id_animal: 'pet-1', nome: 'Rex' }],
      titulo: 'Alarme Padrão',
      data: '2026-12-20',
      horario: '08:30',
      frequencia: 'Diária',
      notificacao_app: true,
    },
    headers
  );
  assert.equal(alarm.alarme_ligado, true);

  const dispatchRes = await mockApiRequest(
    '/dispatchEventNotifications',
    {
      id_usuario: signup.id_usuario,
      id_evento: alarm.id_evento,
      titulo: alarm.titulo,
      animais_nomes: 'Rex',
      data: alarm.data,
      horario: alarm.horario,
      janela: '0m',
      canais: ['app'],
    },
    headers
  );
  assert.equal(dispatchRes.disparos.length, 1);

  assert.ok(persistedSnapshot.includes('Alarme Padrão'));
  // Re-hydrate from persisted snapshot and verify state remains intact
  hydrateMockDb(persistedSnapshot);
  const allAfterHydrate = await mockApiRequest(
    '/getAll',
    { id_usuario: signup.id_usuario },
    headers
  );
  assert.ok(
    allAfterHydrate[2].evento.some((e: { titulo: string }) => e.titulo === 'Alarme Padrão')
  );

  setMockPersistHandler(null);
  await mockApiRequest('/deleteAccount', {}, headers);
});

test('mockBackend: rejects saving an Alarme without horario even when alarme_ligado is false', async () => {
  const signup = await mockApiRequest('/createAccount', {
    nome: 'Teste Alarme Horario',
    email: 'teste.alarme.horario@email.com',
    senha: 'password123',
  });
  const headers = { Authorization: `Bearer ${signup.accessToken}` };

  await assert.rejects(
    () =>
      mockApiRequest(
        '/createEvent',
        {
          tipo_evento: 'Alarme',
          animal: [{ tabela: 'animal', id_animal: 'pet-1', nome: 'Rex' }],
          titulo: 'Sem horário',
          data: '2026-12-20',
          horario: '',
          alarme_ligado: false,
          frequencia: 'Diária',
        },
        headers
      ),
    (err: unknown) => err instanceof MockApiError && err.status === 400
  );

  const validAlarm = await mockApiRequest(
    '/createEvent',
    {
      tipo_evento: 'Alarme',
      animal: [{ tabela: 'animal', id_animal: 'pet-1', nome: 'Rex' }],
      titulo: 'Com horário',
      data: '2026-12-20',
      horario: '10:30',
      alarme_ligado: false,
      frequencia: 'Uma vez',
    },
    headers
  );

  await assert.rejects(
    () =>
      mockApiRequest(
        '/updateEvent',
        { id_evento: validAlarm.id_evento, horario: '   ' },
        headers
      ),
    (err: unknown) => err instanceof MockApiError && err.status === 400
  );

  await mockApiRequest('/deleteAccount', {}, headers);
});

test('animalPdfHtml: includes all animal info, vaccines, and only matching animal events', () => {
  const pet = {
    id_animal: 'pet-pdf-1',
    id_usuario: 'usr-01',
    nome: 'Thor',
    data_nascimento: '2023-04-15',
    especie: 'Cachorro',
    raca: 'Golden Retriever',
    genero: 'Macho',
    racao: 'Premier Golden',
    observacao: 'Muito dócil e agitado',
    foto: '',
    vacinas: [
      {
        id_vacina: 'vac-1',
        id_animal: 'pet-pdf-1',
        id_usuario: 'usr-01',
        nome_vacina: 'V10 Polivalente',
        data_aplicacao: '2025-02-10',
        observacao: 'Dose anual',
        foto_carteira: 'data:image/png;base64,abc',
      },
    ],
  };

  const eventos = [
    {
      id_evento: 'ev-1',
      id_usuario: 'usr-01',
      tipo_evento: 'Consulta' as const,
      animal: [{ tabela: 'animal' as const, id_animal: 'pet-pdf-1', nome: 'Thor' }],
      titulo: 'Check-up Anual',
      data: '2026-06-20',
      horario: '14:30',
      local: 'Clínica PetCare',
      anotacao: 'Levar exames anteriores',
      veterinario: 'Dra. Marina',
      alarme_ligado: false,
      frequencia: '' as const,
      notificacao_app: true,
      notificacao_whatsapp: true,
    },
    {
      id_evento: 'ev-other',
      id_usuario: 'usr-01',
      tipo_evento: 'Passeio' as const,
      animal: [{ tabela: 'animal' as const, id_animal: 'pet-other', nome: 'Luna' }],
      titulo: 'Evento de Outro Pet',
      data: '2026-06-22',
      horario: '09:00',
      local: 'Parque',
      anotacao: '',
      veterinario: '',
      alarme_ligado: false,
      frequencia: '' as const,
      notificacao_app: true,
      notificacao_whatsapp: false,
    },
  ];

  const matchedEvents = getAnimalEvents(pet, eventos);
  assert.equal(matchedEvents.length, 1);
  assert.equal(matchedEvents[0].id_evento, 'ev-1');

  const html = buildAnimalPdfHtml(pet, eventos);
  assert.ok(html.includes('Thor'));
  assert.ok(html.includes('Golden Retriever'));
  assert.ok(html.includes('15-04-2023'));
  assert.ok(html.includes('Premier Golden'));
  assert.ok(html.includes('V10 Polivalente'));
  assert.ok(html.includes('Check-up Anual'));
  assert.ok(html.includes('Dra. Marina'));
  assert.ok(html.includes('App, WhatsApp'));
  assert.equal(html.includes('Evento de Outro Pet'), false);
});

test('mockBackend: rejects future user birth dates and empty event types', async () => {
  const future = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
  const futureISO = `${future.getFullYear()}-${String(future.getMonth() + 1).padStart(
    2,
    '0'
  )}-${String(future.getDate()).padStart(2, '0')}`;

  await assert.rejects(
    () =>
      mockApiRequest('/createAccount', {
        nome: 'Usuário Futuro',
        email: 'usuario.futuro@email.com',
        senha: 'password123',
        data_nascimento: futureISO,
      }),
    (err: unknown) => err instanceof MockApiError && err.status === 400
  );

  const signup = await mockApiRequest('/createAccount', {
    nome: 'Usuário Válido',
    email: 'usuario.valido@email.com',
    senha: 'password123',
    data_nascimento: '1995-05-10',
  });
  const headers = { Authorization: `Bearer ${signup.accessToken}` };

  await assert.rejects(
    () =>
      mockApiRequest(
        '/updateAccount',
        { data_nascimento: futureISO },
        headers
      ),
    (err: unknown) => err instanceof MockApiError && err.status === 400
  );

  await assert.rejects(
    () =>
      mockApiRequest(
        '/createEvent',
        {
          tipo_evento: '',
          animal: [{ tabela: 'animal', id_animal: 'pet-1', nome: 'Rex' }],
          titulo: 'Sem Tipo',
          data: '2026-12-20',
          horario: '10:00',
        },
        headers
      ),
    (err: unknown) => err instanceof MockApiError && err.status === 400
  );

  await mockApiRequest('/deleteAccount', {}, headers);
});

test('phone & mockBackend: validates Brazilian cell phone format with middle hyphen and blocks WhatsApp without valid phone', async () => {
  assert.equal(formatPhoneMask('11987654321'), '(11) 98765-4321');
  assert.equal(hasPhoneHyphenInMiddle('(11) 98765-4321'), true);
  assert.equal(hasPhoneHyphenInMiddle('11987654321'), false);

  assert.equal(isValidCellPhone('(11) 98765-4321'), true);
  assert.equal(isValidCellPhone('(11) 88765-4321'), false);
  assert.equal(isValidCellPhone('11987654321'), false);
  assert.equal(isValidCellPhone('(01) 98765-4321'), false);
  assert.equal(isValidCellPhone('(11) 9876-5432'), true);
  assert.equal(isValidCellPhone('(11) 987-6543'), false);
  assert.equal(isValidCellPhone('(99) 99999-9999'), false);

  // createAccount rejects invalid phone numbers
  for (const badPhone of ['11987654321', '(11) 88765-4321', '(01) 98765-4321', '(11) 987-6543', '(99) 99999-9999']) {
    await assert.rejects(
      () =>
        mockApiRequest('/createAccount', {
          nome: 'Teste Celular Invalido',
          email: 'cel.invalido@email.com',
          senha: 'password123',
          celular: badPhone,
        }),
      (err: unknown) => err instanceof MockApiError && err.status === 400
    );
  }

  // createAccount rejects enabling WhatsApp without valid phone
  await assert.rejects(
    () =>
      mockApiRequest('/createAccount', {
        nome: 'Sem Celular WhatsApp',
        email: 'sem.cel.whats@email.com',
        senha: 'password123',
        celular: '',
        notificacao_whatsapp: true,
      }),
    (err: unknown) => err instanceof MockApiError && err.status === 400
  );

  // Account without phone cannot enable WhatsApp via updateAccount
  const signup = await mockApiRequest('/createAccount', {
    nome: 'Sem Celular Inicial',
    email: 'sem.cel.inicial@email.com',
    senha: 'password123',
    celular: '',
  });
  const headers = { Authorization: `Bearer ${signup.accessToken}` };

  await assert.rejects(
    () =>
      mockApiRequest(
        '/updateAccount',
        { celular: '(11) 88765-4321' },
        headers
      ),
    (err: unknown) => err instanceof MockApiError && err.status === 400
  );

  await assert.rejects(
    () =>
      mockApiRequest(
        '/updateAccount',
        { notificacao_whatsapp: true },
        headers
      ),
    (err: unknown) => err instanceof MockApiError && err.status === 400
  );

  // Registering valid phone allows enabling WhatsApp
  const updated = await mockApiRequest(
    '/updateAccount',
    {
      celular: '(11) 98765-4321',
      notificacao_whatsapp: true,
    },
    headers
  );
  assert.equal(updated.celular, '(11) 98765-4321');
  assert.equal(updated.notificacao_whatsapp, true);

  await mockApiRequest('/deleteAccount', {}, headers);
});

test('eventNotifications: snooze suppresses current occurrence keys without affecting tomorrow recurring alarm', () => {
  const dailyAlarm = {
    id_evento: 'ev-snooze-1',
    id_usuario: 'usr-01',
    tipo_evento: 'Alarme' as const,
    animal: [{ tabela: 'animal' as const, id_animal: 'pet-1', nome: 'Rex' }],
    titulo: 'Dar Remédio',
    data: '2026-12-01',
    horario: '14:00',
    local: '',
    anotacao: '',
    veterinario: '',
    alarme_ligado: true,
    frequencia: 'Diária' as const,
    notificacao_app: true,
    notificacao_whatsapp: false,
  };

  const todayAlarmMs = parseEventDateTimeMs('2026-12-03', '14:00')!;
  const tomorrowAlarmMs = parseEventDateTimeMs('2026-12-04', '14:00')!;
  const nowMs = todayAlarmMs + 15_000; // 14:00:15
  const snoozeUntilMs = nowMs + 5 * 60 * 1000; // 14:05:15

  assert.equal(formatTimeHHMM(snoozeUntilMs), '14:05');

  const keys = getEventOccurrenceSuppressionKeys(dailyAlarm, nowMs, 120_000, snoozeUntilMs);
  assert.ok(keys.includes(getAlarmRingKey('ev-snooze-1', todayAlarmMs)));
  assert.ok(keys.includes(getReminderKey('ev-snooze-1', '0m', todayAlarmMs)));
  assert.equal(keys.includes(getAlarmRingKey('ev-snooze-1', tomorrowAlarmMs)), false);

  // If the alarm is deleted or turned off while snoozed, its snooze is flagged as orphan and cancelled
  const disabledAlarm = { ...dailyAlarm, id_evento: 'ev-snooze-disabled', alarme_ligado: false };
  const remainingEvents = [dailyAlarm, disabledAlarm];
  assert.deepEqual(
    getOrphanSnoozeEventIds(remainingEvents, [
      'ev-snooze-1',
      'ev-snooze-deleted',
      'ev-snooze-disabled',
    ]),
    ['ev-snooze-deleted', 'ev-snooze-disabled']
  );
  assert.deepEqual(getOrphanSnoozeEventIds([], ['ev-snooze-1']), ['ev-snooze-1']);
});






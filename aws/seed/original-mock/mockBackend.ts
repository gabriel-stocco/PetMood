import initialDb from './mock_database.json';
import { INVALID_CELLPHONE_MESSAGE, isValidCellPhone } from '../utils/phone';

export const USE_MOCK_BACKEND = true;
const SIMULATED_DELAY_MS = 300;
const MAX_FOTO_CHARS = 300_000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const MOCK_DB_STORAGE_KEY = 'petmood_mock_db_v1';

function createFreshSeedDb() {
  return JSON.parse(JSON.stringify(initialDb));
}

function loadInitialDb() {
  const fallback = createFreshSeedDb();
  if (typeof globalThis.localStorage === 'undefined') {
    return fallback;
  }
  try {
    const raw = globalThis.localStorage.getItem(MOCK_DB_STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return fallback;
    return {
      usuarios: Array.isArray(parsed.usuarios) ? parsed.usuarios : fallback.usuarios,
      animais: Array.isArray(parsed.animais) ? parsed.animais : fallback.animais,
      vacinas: Array.isArray(parsed.vacinas) ? parsed.vacinas : fallback.vacinas,
      eventos: Array.isArray(parsed.eventos) ? parsed.eventos : fallback.eventos,
      dicas: fallback.dicas,
      propagandas: Array.isArray(parsed.propagandas) ? parsed.propagandas : fallback.propagandas,
    };
  } catch {
    return fallback;
  }
}

const db = loadInitialDb();

function persistDb(): void {
  if (typeof globalThis.localStorage === 'undefined') return;
  try {
    globalThis.localStorage.setItem(MOCK_DB_STORAGE_KEY, JSON.stringify(db));
  } catch {
    // Ignore storage quota errors
  }
}

const JANELA_LABELS: Record<string, string> = {
  '2d': 'Faltam 2 dias',
  '1d': 'Falta 1 dia',
  '1h': 'Falta 1 hora',
  '0m': 'Agora (na hora)',
};

function getTodayISO(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
    now.getDate()
  ).padStart(2, '0')}`;
}

function isFutureBirthDate(isoDate?: string): boolean {
  const trimmed = String(isoDate || '').trim();
  if (!trimmed) return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return false;
  return trimmed > getTodayISO();
}

function formatDateBR(isoDate?: string): string {
  if (!isoDate) return '';
  const parts = isoDate.split('-');
  if (parts.length !== 3) return isoDate;
  return `${parts[2]}-${parts[1]}-${parts[0]}`;
}

export class MockApiError extends Error {
  status: number;
  body: { status: number; id_usuario: string; message: string };

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.body = { status, id_usuario: '', message };
  }
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function generateId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).substring(2, 10)}`;
}

function encodeBase64(obj: any): string {
  return encodeURIComponent(JSON.stringify(obj));
}

function decodeBase64(str: string): any {
  return JSON.parse(decodeURIComponent(str));
}

function signMockToken(userId: string): string {
  const payload = {
    sub: userId,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60,
  };
  return `mock-jwt.${encodeBase64(payload)}.sig`;
}

function verifyMockToken(authHeader?: string): string {
  if (!authHeader || !authHeader.toLowerCase().startsWith('bearer ')) {
    throw new MockApiError(401, 'Não autorizado');
  }
  const token = authHeader.slice(7).trim();
  try {
    const parts = token.split('.');
    if (parts.length !== 3 || parts[0] !== 'mock-jwt') {
      throw new Error('Token inválido');
    }
    const payload = decodeBase64(parts[1]);
    if (!payload.sub || payload.exp < Math.floor(Date.now() / 1000)) {
      throw new Error('Token expirado');
    }
    return payload.sub;
  } catch {
    throw new MockApiError(401, 'Não autorizado');
  }
}

export async function mockApiRequest(
  route: string,
  params: Record<string, any> = {},
  headers: Record<string, string> = {}
): Promise<any> {
  await delay(SIMULATED_DELAY_MS);

  const cleanRoute = '/' + route.replace(/^\/+/, '').split('/').pop();
  const authHeader = headers['Authorization'] || headers['authorization'];

  // 1. ROTAS PÚBLICAS (/login, /createAccount, /googleLogin)
  if (cleanRoute === '/login') {
    const email = String(params.email || '').trim().toLowerCase();
    const senha = String(params.senha || '');
    if (!email || !senha) throw new MockApiError(400, 'Dados inválidos');

    const user = db.usuarios.find((u: any) => u.email.toLowerCase() === email);
    if (!user || user.senha_hash === 'GOOGLE_AUTH' || user.senha_hash !== senha) {
      throw new MockApiError(401, 'Credenciais inválidas');
    }
    return { status: 200, id_usuario: user.id_usuario, accessToken: signMockToken(user.id_usuario) };
  }

  if (cleanRoute === '/createAccount') {
    const nome = String(params.nome || '').trim();
    const email = String(params.email || '').trim().toLowerCase();
    const senha = String(params.senha || '');
    const foto = String(params.foto || '');
    const dataNascimento = String(params.data_nascimento || '').trim();
    const celular = String(params.celular || '').trim();
    const notifWhats = Boolean(params.notificacao_whatsapp ?? false);

    if (!nome || !EMAIL_RE.test(email) || senha.length < 8) {
      throw new MockApiError(400, 'Dados inválidos (nome, e-mail válido e senha com 8+ caracteres)');
    }
    if (celular && !isValidCellPhone(celular)) {
      throw new MockApiError(400, INVALID_CELLPHONE_MESSAGE);
    }
    if (notifWhats && !isValidCellPhone(celular)) {
      throw new MockApiError(
        400,
        'Cadastre um número de celular válido para ativar notificações via WhatsApp.'
      );
    }
    if (isFutureBirthDate(dataNascimento)) {
      throw new MockApiError(400, 'A data de nascimento não pode ser no futuro.');
    }
    if (foto.length > MAX_FOTO_CHARS) {
      throw new MockApiError(413, 'Imagem muito grande. Reduza o tamanho da foto.');
    }
    if (db.usuarios.some((u: any) => u.email.toLowerCase() === email)) {
      throw new MockApiError(409, 'E-mail já cadastrado');
    }

    const novoId = generateId('usr');
    const novoUsuario = {
      tabela: 'usuario',
      id_usuario: novoId,
      nome,
      email,
      senha_hash: senha,
      celular,
      data_nascimento: dataNascimento,
      genero: String(params.genero || ''),
      foto,
      notificacao_app: params.notificacao_app ?? true,
      notificacao_whatsapp: notifWhats,
    };
    db.usuarios.push(novoUsuario);
    persistDb();
    return { status: 200, id_usuario: novoId, accessToken: signMockToken(novoId) };
  }

  if (cleanRoute === '/googleLogin') {
    const idToken = String(params.id_token || '').trim();
    if (!idToken) throw new MockApiError(400, 'id_token obrigatório');

    const mockGoogleEmail = 'usuario.google@gmail.com';
    let user = db.usuarios.find((u: any) => u.email.toLowerCase() === mockGoogleEmail);
    if (!user) {
      user = {
        tabela: 'usuario',
        id_usuario: generateId('usr'),
        nome: 'Usuário Google',
        email: mockGoogleEmail,
        senha_hash: 'GOOGLE_AUTH',
        celular: '',
        data_nascimento: '',
        genero: '',
        foto: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=300&q=80',
        notificacao_app: true,
        notificacao_whatsapp: false,
      };
      db.usuarios.push(user);
      persistDb();
    }
    return { status: 200, id_usuario: user.id_usuario, accessToken: signMockToken(user.id_usuario) };
  }

  // 2. ROTAS PROTEGIDAS POR JWT
  const id_usuario = verifyMockToken(authHeader);

  if (cleanRoute === '/getAll') {
    const user = db.usuarios.find((u: any) => u.id_usuario === id_usuario);
    if (!user) throw new MockApiError(401, 'Usuário não encontrado');
    const { senha_hash, ...usuarioSemSenha } = user;

    const animaisDoUsuario = db.animais
      .filter((a: any) => a.id_usuario === id_usuario)
      .map((a: any) => ({
        ...a,
        vacinas: db.vacinas.filter((v: any) => v.id_animal === a.id_animal && v.id_usuario === id_usuario),
      }));

    const eventosDoUsuario = db.eventos.filter((e: any) => e.id_usuario === id_usuario);
    const dicasLeves = db.dicas.map(({ artigo, ...resto }: any) => resto);
    const propagandas = db.propagandas.slice(0, 5);

    return [
      usuarioSemSenha,
      { animais: animaisDoUsuario },
      { evento: eventosDoUsuario },
      { dicas: dicasLeves },
      { propaganda: propagandas },
    ];
  }

  if (cleanRoute === '/getTip') {
    const dica = db.dicas.find((d: any) => d.id_dicas === params.id_dicas);
    if (!dica) throw new MockApiError(404, 'Dica não encontrada');
    return {
      id_dicas: dica.id_dicas,
      artigo: dica.artigo,
      especie: dica.especie,
      tag: dica.tag,
      titulo: dica.titulo,
    };
  }

  if (cleanRoute === '/getAccount') {
    const user = db.usuarios.find((u: any) => u.id_usuario === id_usuario);
    if (!user) throw new MockApiError(404, 'Conta não encontrada');
    const { senha_hash, tabela, ...dadosConta } = user;
    return dadosConta;
  }

  if (cleanRoute === '/createAnimal') {
    const foto = String(params.foto || '');
    const dataNascimento = String(params.data_nascimento || '').trim();
    if (foto.length > MAX_FOTO_CHARS) throw new MockApiError(413, 'Imagem muito grande.');
    if (isFutureBirthDate(dataNascimento)) {
      throw new MockApiError(400, 'A data de nascimento do animal não pode ser no futuro.');
    }
    const novoAnimal = {
      tabela: 'animal',
      id_animal: generateId('pet'),
      id_usuario,
      nome: String(params.nome || ''),
      data_nascimento: dataNascimento,
      especie: String(params.especie || ''),
      raca: String(params.raca || ''),
      genero: String(params.genero || ''),
      racao: String(params.racao || ''),
      observacao: String(params.observacao || ''),
      foto,
    };
    db.animais.push(novoAnimal);
    persistDb();
    return { ...novoAnimal, vacinas: [] };
  }

  if (cleanRoute === '/createEvent') {
    const tipoEvento = String(params.tipo_evento || '').trim();
    const horario = String(params.horario || '').trim();
    if (!tipoEvento) {
      throw new MockApiError(400, 'Selecione o tipo de evento.');
    }
    if (tipoEvento === 'Alarme' && !horario) {
      throw new MockApiError(400, 'Informe o horário para salvar o alarme.');
    }
    const alarmeLigado =
      tipoEvento === 'Alarme'
        ? params.alarme_ligado !== undefined
          ? Boolean(params.alarme_ligado)
          : true
        : Boolean(params.alarme_ligado);
    const novoEvento = {
      tabela: 'evento',
      id_evento: generateId('ev'),
      tipo_evento: tipoEvento,
      id_usuario,
      animal: Array.isArray(params.animal) ? params.animal : [],
      titulo: String(params.titulo || ''),
      data: String(params.data || ''),
      horario: String(params.horario || ''),
      local: String(params.local || ''),
      anotacao: String(params.anotacao || ''),
      veterinario: String(params.veterinario || ''),
      alarme_ligado: alarmeLigado,
      frequencia: String(params.frequencia || ''),
      notificacao_app: Boolean(params.notificacao_app),
      notificacao_whatsapp: Boolean(params.notificacao_whatsapp),
    };
    db.eventos.push(novoEvento);
    persistDb();
    return novoEvento;
  }

  if (cleanRoute === '/createVaccine') {
    const foto_carteira = String(params.foto_carteira || '');
    if (foto_carteira.length > MAX_FOTO_CHARS) throw new MockApiError(413, 'Imagem muito grande.');
    const novaVacina = {
      tabela: 'vacina',
      id_vacina: generateId('vac'),
      id_animal: String(params.id_animal || ''),
      id_usuario,
      nome_vacina: String(params.nome_vacina || ''),
      data_aplicacao: String(params.data_aplicacao || ''),
      observacao: String(params.observacao || ''),
      foto_carteira,
    };
    db.vacinas.push(novaVacina);
    persistDb();
    return novaVacina;
  }

  if (cleanRoute === '/updateAccount') {
    const idx = db.usuarios.findIndex((u: any) => u.id_usuario === id_usuario);
    if (idx === -1) throw new MockApiError(404, 'Conta não encontrada');
    const atual = db.usuarios[idx];
    const nextBirthDate = String(params.data_nascimento ?? atual.data_nascimento).trim();
    const nextCelular = String(params.celular ?? atual.celular).trim();
    const nextNotifWhats = Boolean(params.notificacao_whatsapp ?? atual.notificacao_whatsapp);

    if (nextCelular && !isValidCellPhone(nextCelular)) {
      throw new MockApiError(400, INVALID_CELLPHONE_MESSAGE);
    }
    if (nextNotifWhats && !isValidCellPhone(nextCelular)) {
      throw new MockApiError(
        400,
        'Cadastre um número de celular válido para ativar notificações via WhatsApp.'
      );
    }
    if (isFutureBirthDate(nextBirthDate)) {
      throw new MockApiError(400, 'A data de nascimento não pode ser no futuro.');
    }
    const atualizado = {
      ...atual,
      nome: String(params.nome ?? atual.nome),
      email: String(params.email ?? atual.email).trim().toLowerCase(),
      celular: nextCelular,
      data_nascimento: nextBirthDate,
      genero: String(params.genero ?? atual.genero),
      foto: String(params.foto ?? atual.foto),
      notificacao_app: Boolean(params.notificacao_app ?? atual.notificacao_app),
      notificacao_whatsapp: nextNotifWhats,
    };
    db.usuarios[idx] = atualizado;
    persistDb();
    return atualizado;
  }

  if (cleanRoute === '/updateAnimal') {
    const idx = db.animais.findIndex((a: any) => a.id_animal === params.id_animal && a.id_usuario === id_usuario);
    if (idx === -1) throw new MockApiError(403, 'Acesso negado a este animal');
    const atual = db.animais[idx];
    const nextBirthDate = String(params.data_nascimento ?? atual.data_nascimento).trim();
    if (isFutureBirthDate(nextBirthDate)) {
      throw new MockApiError(400, 'A data de nascimento do animal não pode ser no futuro.');
    }
    const atualizado = {
      ...atual,
      nome: String(params.nome ?? atual.nome),
      data_nascimento: nextBirthDate,
      especie: String(params.especie ?? atual.especie),
      raca: String(params.raca ?? atual.raca),
      genero: String(params.genero ?? atual.genero),
      racao: String(params.racao ?? atual.racao),
      observacao: String(params.observacao ?? atual.observacao),
      foto: String(params.foto ?? atual.foto),
    };
    db.animais[idx] = atualizado;
    persistDb();
    return atualizado;
  }

  if (cleanRoute === '/updateEvent') {
    const idx = db.eventos.findIndex((e: any) => e.id_evento === params.id_evento && e.id_usuario === id_usuario);
    if (idx === -1) throw new MockApiError(403, 'Acesso negado a este evento');
    const atual = db.eventos[idx];
    const nextTipoEvento = String(params.tipo_evento ?? atual.tipo_evento).trim();
    const nextHorario = String(params.horario ?? atual.horario).trim();
    if (!nextTipoEvento) {
      throw new MockApiError(400, 'Selecione o tipo de evento.');
    }
    if (nextTipoEvento === 'Alarme' && !nextHorario) {
      throw new MockApiError(400, 'Informe o horário para salvar o alarme.');
    }
    const atualizado = {
      ...atual,
      tipo_evento: nextTipoEvento,
      animal: Array.isArray(params.animal) ? params.animal : atual.animal,
      titulo: String(params.titulo ?? atual.titulo),
      data: String(params.data ?? atual.data),
      horario: nextHorario,
      local: String(params.local ?? atual.local),
      anotacao: String(params.anotacao ?? atual.anotacao),
      veterinario: String(params.veterinario ?? atual.veterinario),
      alarme_ligado: Boolean(params.alarme_ligado ?? atual.alarme_ligado),
      frequencia: String(params.frequencia ?? atual.frequencia),
      notificacao_app: Boolean(params.notificacao_app ?? atual.notificacao_app),
      notificacao_whatsapp: Boolean(params.notificacao_whatsapp ?? atual.notificacao_whatsapp),
    };
    db.eventos[idx] = atualizado;
    persistDb();
    return atualizado;
  }

  if (cleanRoute === '/updateVaccine') {
    const idx = db.vacinas.findIndex((v: any) => v.id_vacina === params.id_vacina && v.id_usuario === id_usuario);
    if (idx === -1) throw new MockApiError(403, 'Acesso negado a esta vacina');
    const atual = db.vacinas[idx];
    const atualizada = {
      ...atual,
      id_animal: String(params.id_animal ?? atual.id_animal),
      nome_vacina: String(params.nome_vacina ?? atual.nome_vacina),
      data_aplicacao: String(params.data_aplicacao ?? atual.data_aplicacao),
      observacao: String(params.observacao ?? atual.observacao),
      foto_carteira: String(params.foto_carteira ?? atual.foto_carteira),
    };
    db.vacinas[idx] = atualizada;
    persistDb();
    return atualizada;
  }

  if (cleanRoute === '/deleteAccount') {
    const user = db.usuarios.find((u: any) => u.id_usuario === id_usuario);
    db.usuarios = db.usuarios.filter((u: any) => u.id_usuario !== id_usuario);
    db.animais = db.animais.filter((a: any) => a.id_usuario !== id_usuario);
    db.vacinas = db.vacinas.filter((v: any) => v.id_usuario !== id_usuario);
    db.eventos = db.eventos.filter((e: any) => e.id_usuario !== id_usuario);
    persistDb();
    return user || params;
  }

  if (cleanRoute === '/deleteAnimal') {
    const animal = db.animais.find((a: any) => a.id_animal === params.id_animal && a.id_usuario === id_usuario);
    if (!animal) throw new MockApiError(403, 'Acesso negado a este animal');
    db.animais = db.animais.filter((a: any) => a.id_animal !== params.id_animal);
    db.vacinas = db.vacinas.filter((v: any) => v.id_animal !== params.id_animal);
    persistDb();
    return animal;
  }

  if (cleanRoute === '/deleteEvent') {
    const evento = db.eventos.find((e: any) => e.id_evento === params.id_evento && e.id_usuario === id_usuario);
    if (!evento) throw new MockApiError(403, 'Acesso negado a este evento');
    db.eventos = db.eventos.filter((e: any) => e.id_evento !== params.id_evento);
    persistDb();
    return evento;
  }

  if (cleanRoute === '/deleteVaccine') {
    const vacina = db.vacinas.find((v: any) => v.id_vacina === params.id_vacina && v.id_usuario === id_usuario);
    if (!vacina) throw new MockApiError(403, 'Acesso negado a esta vacina');
    db.vacinas = db.vacinas.filter((v: any) => v.id_vacina !== params.id_vacina);
    persistDb();
    return vacina;
  }

  if (cleanRoute === '/dispatchEventNotifications') {
    const user = db.usuarios.find((u: any) => u.id_usuario === id_usuario);
    if (!user) throw new MockApiError(401, 'Usuário não encontrado');

    const janela = String(params.janela || '1h');
    const janelaLabel = JANELA_LABELS[janela] || janela;
    const requestedCanais: string[] = Array.isArray(params.canais) ? params.canais : [];
    const eventoDb = db.eventos.find((e: any) => e.id_evento === params.id_evento && e.id_usuario === id_usuario);

    const alarmDisabledInDb =
      Boolean(eventoDb && eventoDb.tipo_evento === 'Alarme' && !eventoDb.alarme_ligado);

    const acceptedCanais = alarmDisabledInDb
      ? []
      : requestedCanais.filter((canal) => {
          const eventAllows = (key: 'notificacao_app' | 'notificacao_whatsapp') =>
            !eventoDb ? true : Boolean(eventoDb[key]);

          if (canal === 'app') {
            return Boolean(user.notificacao_app && eventAllows('notificacao_app'));
          }
          if (canal === 'whatsapp') {
            return Boolean(
              user.notificacao_whatsapp &&
                isValidCellPhone(user.celular) &&
                eventAllows('notificacao_whatsapp')
            );
          }
          return false;
        });

    const titulo = String(params.titulo || eventoDb?.titulo || 'Evento');
    const dataBR = formatDateBR(String(params.data || eventoDb?.data || ''));
    const horario = String(params.horario || eventoDb?.horario || '');
    const animaisNomes = String(params.animais_nomes || params.animais || 'seu pet');
    const local = String(params.local || eventoDb?.local || '');

    const mensagem = `[PetMood] ${janelaLabel}: ${titulo} (${animaisNomes}) em ${dataBR}${
      horario ? ` às ${horario}` : ''
    }${local ? ` • ${local}` : ''}.`;

    const disparadoEm = new Date().toISOString();
    const disparos = acceptedCanais.map((canal) => {
      const record = {
        id_notificacao: generateId('notif'),
        id_evento: String(params.id_evento || ''),
        id_usuario,
        titulo_evento: titulo,
        janela,
        janela_label: janelaLabel,
        canal,
        destino: canal === 'app' ? 'Barra de Notificações' : String(user.celular || ''),
        mensagem,
        disparado_em: disparadoEm,
        status: canal === 'app' ? 'disparado' : 'disparado_mock',
      };
      return record;
    });

    return {
      status: 200,
      id_evento: String(params.id_evento || ''),
      janela,
      disparos,
    };
  }

  throw new MockApiError(404, `Rota ${cleanRoute} não encontrada`);
}

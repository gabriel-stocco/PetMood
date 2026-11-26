export type GeneroUsuario =
  | 'feminino'
  | 'masculino'
  | 'outro'
  | 'prefiro_nao_dizer'
  | '';

export type GeneroAnimal = 'Macho' | 'Fêmea' | '';

export type TipoEvento =
  | 'Consulta'
  | 'Vacinação'
  | 'Tosa e/ou Banho'
  | 'Passeio'
  | 'Alarme'
  | 'Outro';

export type FrequenciaAlarme = 'Uma vez' | 'Diária' | 'Semanal' | 'Mensal' | '';

export type AuthenticatedTab =
  | 'Home'
  | 'Dicas'
  | 'AdicionarAnimal'
  | 'Eventos'
  | 'Vacinas'
  | 'Configuracoes';

export interface Usuario {
  tabela?: 'usuario';
  id_usuario: string;
  nome: string;
  email: string;
  celular: string;
  data_nascimento: string;
  genero: GeneroUsuario | string;
  foto: string;
  notificacao_app: boolean;
  notificacao_whatsapp: boolean;
  /** Set by the backend: the account is linked to a Google login. */
  login_google?: boolean;
  /** Set by the backend: the account also has an e-mail/password login. */
  possui_senha?: boolean;
}

export interface Vacina {
  tabela?: 'vacina';
  id_vacina: string;
  id_animal: string;
  id_usuario: string;
  nome_vacina: string;
  data_aplicacao: string;
  observacao: string;
  foto_carteira: string;
}

export interface Animal {
  tabela?: 'animal';
  id_animal: string;
  id_usuario: string;
  nome: string;
  data_nascimento: string;
  especie: string;
  raca: string;
  genero: GeneroAnimal | string;
  racao: string;
  observacao: string;
  foto: string;
  vacinas: Vacina[];
}

export interface EventoAnimalRef {
  tabela: 'animal';
  id_animal: string;
  nome: string;
}

export interface Evento {
  tabela?: 'evento';
  id_evento: string;
  tipo_evento: TipoEvento;
  id_usuario: string;
  animal: EventoAnimalRef[];
  titulo: string;
  data: string;
  horario: string;
  local: string;
  anotacao: string;
  veterinario: string;
  alarme_ligado: boolean;
  frequencia: FrequenciaAlarme | string;
  notificacao_app: boolean;
  notificacao_whatsapp: boolean;
}

export interface DicaResumo {
  tabela?: 'dicas';
  id_dicas: string;
  especie: string;
  tag: string;
  titulo: string;
}

export interface DicaCompleta extends DicaResumo {
  artigo: string;
}

export interface Propaganda {
  tabela?: 'propaganda';
  id_propaganda: string;
  foto: string;
  link: string;
  nome: string;
}

export interface AuthResponse {
  status: number;
  id_usuario: string;
  accessToken: string;
}

export type GetAllResponse = [
  Usuario,
  { animais: Animal[] },
  { evento: Evento[] },
  { dicas: DicaResumo[] },
  { propaganda: Propaganda[] }
];

export interface LoginPayload {
  email: string;
  senha: string;
}

export interface CreateAccountPayload {
  nome: string;
  email: string;
  celular?: string;
  data_nascimento?: string;
  genero?: string;
  senha: string;
  foto?: string;
  notificacao_app?: boolean;
  notificacao_whatsapp?: boolean;
}

export interface GoogleLoginPayload {
  /** One-time authorization code from the Google popup; the backend exchanges it. */
  code: string;
  /** 'android' when the code came from the native account picker (APK). Default 'web'. */
  platform?: 'web' | 'android';
}

export interface GetAccountPayload {
  id_usuario: string;
  email: string;
}

export interface CreateAnimalPayload {
  id_usuario: string;
  nome: string;
  data_nascimento: string;
  especie: string;
  raca: string;
  genero: string;
  racao: string;
  observacao: string;
  foto: string;
}

export interface UpdateAnimalPayload extends CreateAnimalPayload {
  id_animal: string;
}

export interface DeleteAnimalPayload {
  id_animal: string;
  id_usuario: string;
  nome: string;
}

export interface CreateEventPayload {
  tipo_evento: TipoEvento;
  id_usuario: string;
  animal: EventoAnimalRef[];
  titulo: string;
  data: string;
  horario: string;
  local: string;
  anotacao: string;
  veterinario: string;
  alarme_ligado: boolean;
  frequencia: FrequenciaAlarme | string;
  notificacao_app: boolean;
  notificacao_whatsapp: boolean;
}

export interface UpdateEventPayload extends CreateEventPayload {
  id_evento: string;
}

export interface DeleteEventPayload {
  id_evento: string;
  id_usuario: string;
  titulo: string;
}

export interface CreateVaccinePayload {
  id_animal: string;
  id_usuario: string;
  nome_vacina: string;
  data_aplicacao: string;
  observacao: string;
  foto_carteira: string;
}

export interface UpdateVaccinePayload extends CreateVaccinePayload {
  id_vacina: string;
}

export interface DeleteVaccinePayload {
  id_vacina: string;
  id_animal: string;
  id_usuario: string;
  nome_vacina: string;
}

export interface UpdateAccountPayload {
  id_usuario: string;
  nome: string;
  email: string;
  celular: string;
  data_nascimento: string;
  genero: string;
  foto: string;
  notificacao_app: boolean;
  notificacao_whatsapp: boolean;
}

export interface DeleteAccountPayload {
  id_usuario: string;
  nome: string;
  email: string;
}

export type ReminderWindowKey = '2d' | '1d' | '1h' | '0m';
export type NotificationChannel = 'app' | 'whatsapp';

export interface DispatchedNotificationRecord {
  id_notificacao: string;
  id_evento: string;
  id_usuario: string;
  titulo_evento: string;
  janela: ReminderWindowKey;
  janela_label: string;
  canal: NotificationChannel;
  destino: string;
  mensagem: string;
  disparado_em: string;
  status: 'disparado' | 'disparado_mock';
}

export interface DispatchEventNotificationsPayload {
  id_usuario: string;
  id_evento: string;
  janela: ReminderWindowKey;
  canais: NotificationChannel[];
  titulo: string;
  data: string;
  horario: string;
  animais_nomes: string;
  local?: string;
}

export interface DispatchEventNotificationsResponse {
  status: number;
  id_evento: string;
  janela: ReminderWindowKey;
  disparos: DispatchedNotificationRecord[];
}

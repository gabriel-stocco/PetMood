export interface DateValidationOptions {
  required?: boolean;
  allowFuture?: boolean;
  fieldLabel?: string;
  minYear?: number;
  maxYear?: number;
}

export interface DateValidationResult {
  valid: boolean;
  iso: string;
  error?: string;
}

export function getTodayISO(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function getTodayDisplay(): string {
  return toDisplayDate(getTodayISO());
}

export function formatDateInputDDMMYYYY(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}-${digits.slice(2)}`;
  return `${digits.slice(0, 2)}-${digits.slice(2, 4)}-${digits.slice(4)}`;
}

export function isValidCalendarDate(
  day: number,
  month: number,
  year: number,
  minYear = 1900,
  maxYear = 2100
): boolean {
  if (!Number.isInteger(day) || !Number.isInteger(month) || !Number.isInteger(year)) {
    return false;
  }
  if (year < minYear || year > maxYear) return false;
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;
  const dt = new Date(year, month - 1, day);
  return (
    dt.getFullYear() === year &&
    dt.getMonth() === month - 1 &&
    dt.getDate() === day
  );
}

export function toDisplayDate(storedDate?: string): string {
  if (!storedDate) return '';
  const trimmed = storedDate.trim();
  if (!trimmed) return '';

  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (isoMatch) {
    return `${isoMatch[3]}-${isoMatch[2]}-${isoMatch[1]}`;
  }

  const brDashMatch = /^(\d{2})-(\d{2})-(\d{4})$/.exec(trimmed);
  if (brDashMatch) {
    return trimmed;
  }

  const brSlashMatch = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(trimmed);
  if (brSlashMatch) {
    return `${brSlashMatch[1]}-${brSlashMatch[2]}-${brSlashMatch[3]}`;
  }

  return trimmed;
}

export function formatDateDisplay(storedDate?: string, fallback = ''): string {
  const formatted = toDisplayDate(storedDate);
  return formatted || fallback;
}

export function toISODate(input?: string): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (!trimmed) return null;

  const brMatch = /^(\d{2})[-/](\d{2})[-/](\d{4})$/.exec(trimmed);
  if (brMatch) {
    const day = Number(brMatch[1]);
    const month = Number(brMatch[2]);
    const year = Number(brMatch[3]);
    if (!isValidCalendarDate(day, month, year)) return null;
    return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (isoMatch) {
    const year = Number(isoMatch[1]);
    const month = Number(isoMatch[2]);
    const day = Number(isoMatch[3]);
    if (!isValidCalendarDate(day, month, year)) return null;
    return trimmed;
  }

  return null;
}

export function validateDateInput(
  raw: string,
  options: DateValidationOptions = {}
): DateValidationResult {
  const {
    required = false,
    allowFuture = true,
    fieldLabel = 'A data',
    minYear = 1900,
    maxYear = 2100,
  } = options;

  const trimmed = raw.trim();
  if (!trimmed) {
    if (required) {
      return {
        valid: false,
        iso: '',
        error: `${fieldLabel} é obrigatória (formato dd-mm-aaaa).`,
      };
    }
    return { valid: true, iso: '' };
  }

  const match = /^(\d{2})-(\d{2})-(\d{4})$/.exec(trimmed);
  if (!match) {
    return {
      valid: false,
      iso: '',
      error: `${fieldLabel} deve estar no formato dd-mm-aaaa.`,
    };
  }

  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);

  if (year < minYear || year > maxYear) {
    return {
      valid: false,
      iso: '',
      error: `Ano inválido em ${fieldLabel.toLowerCase()}. Use um ano entre ${minYear} e ${maxYear}.`,
    };
  }

  if (month < 1 || month > 12) {
    return {
      valid: false,
      iso: '',
      error: `Mês inválido em ${fieldLabel.toLowerCase()}. Informe um mês entre 01 e 12.`,
    };
  }

  if (!isValidCalendarDate(day, month, year, minYear, maxYear)) {
    return {
      valid: false,
      iso: '',
      error: `${fieldLabel} é inválida. Verifique se o dia existe no mês informado.`,
    };
  }

  const iso = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  if (!allowFuture && iso > getTodayISO()) {
    return {
      valid: false,
      iso: '',
      error: `${fieldLabel} não pode ser no futuro.`,
    };
  }

  return { valid: true, iso };
}

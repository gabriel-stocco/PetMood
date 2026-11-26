export const CELLPHONE_RE = /^\([1-9]{2}\)\s(?:9\d{4}|\d{4})-\d{4}$/;

export const INVALID_CELLPHONE_MESSAGE =
  'Informe um número de telefone válido com 8 ou 9 dígitos após o DDD no formato (DD) XXXX-XXXX ou (DD) 9XXXX-XXXX, com o hífen (-) no meio do número.';

export function formatPhoneMask(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 2) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

export function hasPhoneHyphenInMiddle(value: string): boolean {
  const trimmed = String(value || '').trim();
  const parts = trimmed.split('-');
  if (parts.length !== 2) return false;
  const leftDigits = parts[0].replace(/\D/g, '');
  const rightDigits = parts[1].replace(/\D/g, '');
  return (leftDigits.length === 6 || leftDigits.length === 7) && rightDigits.length === 4;
}

export function isValidCellPhone(value?: string | null): boolean {
  const trimmed = String(value || '').trim();
  if (!trimmed) return false;
  if (!hasPhoneHyphenInMiddle(trimmed)) return false;
  if (!CELLPHONE_RE.test(trimmed)) return false;
  const digits = trimmed.replace(/\D/g, '');
  if (/^(\d)\1+$/.test(digits)) return false;
  return true;
}

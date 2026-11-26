import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { CustomScrollArea } from './CustomScrollbar';

export const ANIMAL_SPECIES = [
  'Cachorro',
  'Gato',
  'Roedor',
  'Ave',
  'Réptil',
  'Anfíbio',
  'Peixe',
] as const;

export interface SpeciesDropdownHandle {
  focus: (options?: { preventScroll?: boolean }) => void;
  openAndFocus: (options?: { preventScroll?: boolean }) => void;
}

interface SpeciesDropdownProps {
  value: string;
  onChange: (species: string) => void;
  placeholder?: string;
  compact?: boolean;
  disabled?: boolean;
  hasError?: boolean;
  id?: string;
}

export const SpeciesDropdown = forwardRef<SpeciesDropdownHandle, SpeciesDropdownProps>(
  (
    {
      value,
      onChange,
      placeholder = 'Selecione...',
      compact = false,
      disabled = false,
      hasError = false,
      id,
    },
    ref
  ) => {
    const [open, setOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement | null>(null);
    const triggerRef = useRef<HTMLButtonElement | null>(null);

    useImperativeHandle(
      ref,
      () => ({
        focus: (options) => {
          const preventScroll = options?.preventScroll ?? false;
          if (!preventScroll) {
            triggerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
          triggerRef.current?.focus({ preventScroll });
        },
        openAndFocus: (options) => {
          const preventScroll = options?.preventScroll ?? false;
          if (!preventScroll) {
            triggerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
          triggerRef.current?.focus({ preventScroll });
          if (!disabled) {
            setOpen(true);
          }
        },
      }),
      [disabled]
    );

    useEffect(() => {
      if (!open) return;

      const handlePointerDown = (event: MouseEvent | TouchEvent) => {
        if (
          containerRef.current &&
          !containerRef.current.contains(event.target as Node)
        ) {
          setOpen(false);
        }
      };

      const handleKeyDown = (event: KeyboardEvent) => {
        if (event.key === 'Escape') {
          setOpen(false);
        }
      };

      document.addEventListener('mousedown', handlePointerDown);
      document.addEventListener('touchstart', handlePointerDown);
      document.addEventListener('keydown', handleKeyDown);
      return () => {
        document.removeEventListener('mousedown', handlePointerDown);
        document.removeEventListener('touchstart', handlePointerDown);
        document.removeEventListener('keydown', handleKeyDown);
      };
    }, [open]);

    return (
      <div ref={containerRef} className="relative w-full">
        <button
          ref={triggerRef}
          id={id}
          type="button"
          disabled={disabled}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-invalid={hasError || undefined}
          aria-label="Espécie"
          data-testid="species-dropdown-trigger"
          onClick={() => setOpen((prev) => !prev)}
          className={`w-full bg-[#FFFDFB] flex items-center justify-between text-left transition-colors disabled:opacity-60 outline-none ${
            compact ? 'h-10 rounded-lg px-2.5 text-[13.5px]' : 'h-11 rounded-xl px-3 text-[14px]'
          } ${
            hasError
              ? 'border-[2.5px] border-[#E63946] focus:border-[#E63946]'
              : open
              ? 'border-[1.5px] border-[#D96B08]'
              : 'border-[1.5px] border-[#EBD7C3] hover:border-[#D96B08]'
          } ${value ? 'text-[#6E3906] font-medium' : 'text-[#9E8A78]'}`}
        >
          <span className="truncate">{value || placeholder}</span>
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke={hasError ? '#E63946' : '#B8651B'}
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            className={`shrink-0 ml-1.5 transition-transform duration-150 ${
              open ? 'rotate-180' : ''
            }`}
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>

        {open && (
          <div
            role="listbox"
            aria-label="Espécies de animais"
            data-testid="species-dropdown-menu"
            className="absolute left-0 right-0 top-full mt-1.5 z-40 bg-[#FFFDFB] border-[1.5px] border-[#EBD7C3] rounded-xl shadow-[0_10px_24px_rgba(138,69,5,0.16)] overflow-hidden p-1"
          >
            <CustomScrollArea className="max-h-[220px] flex flex-col gap-0.5 pr-2">
              {ANIMAL_SPECIES.map((species) => {
                const selected = value === species;
                return (
                  <button
                    key={species}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    onClick={() => {
                      onChange(species);
                      setOpen(false);
                    }}
                    className={`w-full px-2.5 py-2 rounded-lg text-[13.5px] font-semibold flex items-center justify-between text-left transition-colors ${
                      selected
                        ? 'bg-[#FFF3E6] text-[#D96B08]'
                        : 'text-[#6E3906] hover:bg-[#FFF8F1]'
                    }`}
                  >
                    <span>{species}</span>
                    {selected && (
                      <span className="text-[#D96B08] font-bold" aria-hidden="true">
                        ✓
                      </span>
                    )}
                  </button>
                );
              })}
            </CustomScrollArea>
          </div>
        )}
      </div>
    );
  }
);

SpeciesDropdown.displayName = 'SpeciesDropdown';

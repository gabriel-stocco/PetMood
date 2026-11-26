import React, { useEffect, useRef, useState } from 'react';
import type { ActiveNotificationBanner } from '../context/AppContext';

const CHANNEL_LABELS: Record<'app' | 'whatsapp', string> = {
  app: 'Barra',
  whatsapp: 'WhatsApp',
};

const SWIPE_DISTANCE_THRESHOLD = 85;
const SWIPE_VELOCITY_THRESHOLD = 0.45;
const SWIPE_VELOCITY_MIN_DISTANCE = 35;

interface SwipeableNotificationBannerProps {
  banner: ActiveNotificationBanner;
  onDismiss: () => void;
}

export const SwipeableNotificationBanner: React.FC<SwipeableNotificationBannerProps> = ({
  banner,
  onDismiss,
}) => {
  const [offsetX, setOffsetX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [dismissDirection, setDismissDirection] = useState<'left' | 'right' | null>(null);

  const cardRef = useRef<HTMLDivElement | null>(null);
  const pointerIdRef = useRef<number | null>(null);
  const startXRef = useRef(0);
  const startYRef = useRef(0);
  const startTimeRef = useRef(0);
  const gestureLockRef = useRef<'none' | 'horizontal' | 'vertical'>('none');
  const offsetXRef = useRef(0);
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (dismissTimerRef.current) {
        clearTimeout(dismissTimerRef.current);
      }
    };
  }, []);

  const triggerAnimatedDismiss = (direction: 'left' | 'right') => {
    if (dismissDirection) return;
    setIsDragging(false);
    setDismissDirection(direction);
    const targetX = direction === 'right' ? 440 : -440;
    offsetXRef.current = targetX;
    setOffsetX(targetX);
    dismissTimerRef.current = setTimeout(() => {
      onDismiss();
    }, 210);
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dismissDirection) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if ((e.target as HTMLElement).closest('button')) return;

    pointerIdRef.current = e.pointerId;
    startXRef.current = e.clientX;
    startYRef.current = e.clientY;
    startTimeRef.current = Date.now();
    gestureLockRef.current = e.pointerType === 'mouse' ? 'horizontal' : 'none';
    offsetXRef.current = 0;

    if (e.pointerType === 'mouse') {
      setIsDragging(true);
      try {
        cardRef.current?.setPointerCapture(e.pointerId);
      } catch {
        // Ignore if capture is unsupported
      }
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (pointerIdRef.current !== e.pointerId || dismissDirection) return;

    const dx = e.clientX - startXRef.current;
    const dy = e.clientY - startYRef.current;

    if (gestureLockRef.current === 'none') {
      if (Math.abs(dx) > 6 && Math.abs(dx) >= Math.abs(dy)) {
        gestureLockRef.current = 'horizontal';
        setIsDragging(true);
        try {
          cardRef.current?.setPointerCapture(e.pointerId);
        } catch {
          // Ignore if capture is unsupported
        }
      } else if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) {
        gestureLockRef.current = 'vertical';
        pointerIdRef.current = null;
        return;
      } else {
        return;
      }
    }

    if (gestureLockRef.current === 'horizontal') {
      offsetXRef.current = dx;
      setOffsetX(dx);
    }
  };

  const finishDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    if (pointerIdRef.current !== e.pointerId || dismissDirection) return;

    try {
      if (cardRef.current?.hasPointerCapture(e.pointerId)) {
        cardRef.current.releasePointerCapture(e.pointerId);
      }
    } catch {
      // Ignore release errors
    }

    const finalDx = offsetXRef.current;
    const elapsedMs = Math.max(1, Date.now() - startTimeRef.current);
    const velocityX = finalDx / elapsedMs;

    pointerIdRef.current = null;
    gestureLockRef.current = 'none';

    const passedDistance = Math.abs(finalDx) >= SWIPE_DISTANCE_THRESHOLD;
    const passedVelocity =
      Math.abs(velocityX) >= SWIPE_VELOCITY_THRESHOLD &&
      Math.abs(finalDx) >= SWIPE_VELOCITY_MIN_DISTANCE;

    if (passedDistance || passedVelocity) {
      triggerAnimatedDismiss(finalDx >= 0 ? 'right' : 'left');
    } else {
      setIsDragging(false);
      offsetXRef.current = 0;
      setOffsetX(0);
    }
  };

  const opacity = dismissDirection
    ? 0
    : Math.max(0.15, 1 - Math.abs(offsetX) / 220);
  const rotation = Math.max(-5, Math.min(5, offsetX * 0.018));

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="event-notification-banner"
      className="fixed top-[76px] inset-x-0 z-[70] px-4 pointer-events-none overflow-x-clip"
    >
      <div
        ref={cardRef}
        data-testid="event-notification-banner-card"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishDrag}
        onPointerCancel={finishDrag}
        title="Arraste para o lado para dispensar"
        style={{
          transform: `translate3d(${offsetX}px, 0, 0) rotate(${rotation}deg)`,
          opacity,
          transition: isDragging
            ? 'none'
            : dismissDirection
            ? 'transform 200ms ease-out, opacity 200ms ease-out'
            : 'transform 220ms cubic-bezier(0.22, 1, 0.36, 1), opacity 220ms ease-out',
        }}
        className={`max-w-[390px] mx-auto bg-[#FFFDFB] border-2 border-[#D96B08] rounded-2xl p-3.5 shadow-[0_10px_28px_rgba(138,69,5,0.22)] pointer-events-auto flex items-start gap-3 touch-pan-y select-none ${
          isDragging ? 'cursor-grabbing' : 'cursor-grab'
        }`}
      >
        <div className="w-9 h-9 rounded-full bg-[#FFF3E6] border border-[#F0DFCE] text-[#D96B08] flex items-center justify-center shrink-0 mt-0.5">
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
          >
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[13.5px] font-bold text-[#8A4505] leading-tight">
            {banner.title}
          </p>
          <p className="text-[12.5px] text-[#6E3906] mt-0.5 leading-snug">
            {banner.message}
          </p>
          <div className="flex flex-wrap items-center gap-1.5 mt-2">
            {banner.channels.map((ch) => (
              <span
                key={ch}
                className="px-2 py-0.5 rounded-md bg-[#FFF3E6] border border-[#F0DFCE] text-[#D96B08] text-[10.5px] font-bold"
              >
                {CHANNEL_LABELS[ch]}
              </span>
            ))}
            <span className="text-[10.5px] font-medium text-[#B8651B]/80 ml-auto">
              Arraste para dispensar
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Fechar notificação"
          className="text-[#B8651B] hover:text-[#8A4505] text-lg font-bold leading-none px-1 cursor-pointer"
        >
          ×
        </button>
      </div>
    </div>
  );
};

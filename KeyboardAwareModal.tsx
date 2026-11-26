import React, { useEffect, useState } from 'react';

interface KeyboardAwareModalProps {
  children: React.ReactNode;
  onBackdropClick?: () => void;
  zIndexClassName?: string;
  backdropClassName?: string;
}

interface ViewportBox {
  top: number;
  height: number;
}

function readVisualViewport(): ViewportBox | null {
  if (typeof window === 'undefined' || !window.visualViewport) return null;
  return {
    top: Math.max(0, Math.round(window.visualViewport.offsetTop)),
    height: Math.max(220, Math.round(window.visualViewport.height)),
  };
}

/**
 * Fixed modal backdrop that tracks `window.visualViewport` on mobile browsers
 * so forms stay fully visible above the on-screen keyboard instead of getting
 * clipped by `100vh` / `90vh`.
 */
export const KeyboardAwareModal: React.FC<KeyboardAwareModalProps> = ({
  children,
  onBackdropClick,
  zIndexClassName = 'z-50',
  backdropClassName = 'bg-[#281402]/45',
}) => {
  const [viewport, setViewport] = useState<ViewportBox | null>(() => readVisualViewport());

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const updateViewport = () => {
      setViewport(readVisualViewport());
    };

    updateViewport();
    const vv = window.visualViewport;
    vv?.addEventListener('resize', updateViewport);
    vv?.addEventListener('scroll', updateViewport);
    window.addEventListener('resize', updateViewport);

    return () => {
      document.body.style.overflow = previousOverflow;
      vv?.removeEventListener('resize', updateViewport);
      vv?.removeEventListener('scroll', updateViewport);
      window.removeEventListener('resize', updateViewport);
    };
  }, []);

  const handleFocusCapture = (e: React.FocusEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement | null;
    if (!target) return;
    if (
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.tagName === 'SELECT'
    ) {
      window.setTimeout(() => {
        try {
          target.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        } catch {
          // Ignore environments without smooth scrollIntoView
        }
      }, 120);
    }
  };

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget && onBackdropClick) {
          onBackdropClick();
        }
      }}
      onFocusCapture={handleFocusCapture}
      style={
        viewport
          ? {
              top: `${viewport.top}px`,
              height: `${viewport.height}px`,
            }
          : undefined
      }
      className={`fixed inset-x-0 ${
        viewport ? '' : 'inset-y-0'
      } ${zIndexClassName} ${backdropClassName} flex items-center justify-center p-3 sm:p-4 overscroll-contain`}
    >
      {children}
    </div>
  );
};

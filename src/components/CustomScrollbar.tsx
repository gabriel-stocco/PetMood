import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';

interface ScrollMetrics {
  visible: boolean;
  thumbHeight: number;
  thumbTop: number;
  maxScroll: number;
  trackHeight: number;
}

const MIN_THUMB_HEIGHT = 36;

interface PageCustomScrollbarProps {
  topOffset?: number;
  bottomOffset?: number;
}

export const PageCustomScrollbar: React.FC<PageCustomScrollbarProps> = ({
  topOffset = 12,
  bottomOffset = 12,
}) => {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const draggingRef = useRef<{
    startY: number;
    startScrollTop: number;
    maxScroll: number;
    usableTrack: number;
  } | null>(null);

  const [metrics, setMetrics] = useState<ScrollMetrics>({
    visible: false,
    thumbHeight: MIN_THUMB_HEIGHT,
    thumbTop: 0,
    maxScroll: 0,
    trackHeight: 0,
  });

  const updateMetrics = useCallback(() => {
    const doc = document.documentElement;
    const scrollHeight = Math.max(doc.scrollHeight, document.body?.scrollHeight || 0);
    const clientHeight = window.innerHeight || doc.clientHeight;
    const maxScroll = Math.max(0, scrollHeight - clientHeight);

    if (maxScroll <= 2 || clientHeight <= topOffset + bottomOffset + 24) {
      setMetrics((prev) =>
        prev.visible ? { ...prev, visible: false, maxScroll: 0 } : prev
      );
      return;
    }

    const trackHeight =
      trackRef.current?.clientHeight ||
      Math.max(60, clientHeight - topOffset - bottomOffset);
    const ratio = clientHeight / scrollHeight;
    const thumbHeight = Math.max(
      MIN_THUMB_HEIGHT,
      Math.min(trackHeight, Math.round(trackHeight * ratio))
    );
    const usableTrack = Math.max(1, trackHeight - thumbHeight);
    const scrollTop = Math.min(maxScroll, Math.max(0, window.scrollY || doc.scrollTop));
    const thumbTop = Math.round((scrollTop / maxScroll) * usableTrack);

    setMetrics({
      visible: true,
      thumbHeight,
      thumbTop,
      maxScroll,
      trackHeight,
    });
  }, [bottomOffset, topOffset]);

  useEffect(() => {
    updateMetrics();

    const handleScroll = () => updateMetrics();
    const handleResize = () => updateMetrics();

    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', handleResize);

    const resizeObserver =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(() => updateMetrics())
        : null;
    if (resizeObserver && document.body) {
      resizeObserver.observe(document.body);
      resizeObserver.observe(document.documentElement);
    }

    const mutationObserver =
      typeof MutationObserver !== 'undefined'
        ? new MutationObserver(() => updateMetrics())
        : null;
    if (mutationObserver && document.body) {
      mutationObserver.observe(document.body, {
        childList: true,
        subtree: true,
      });
    }

    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleResize);
      resizeObserver?.disconnect();
      mutationObserver?.disconnect();
    };
  }, [updateMetrics]);

  const handleThumbMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const usableTrack = Math.max(1, metrics.trackHeight - metrics.thumbHeight);
    draggingRef.current = {
      startY: e.clientY,
      startScrollTop: window.scrollY || document.documentElement.scrollTop,
      maxScroll: metrics.maxScroll,
      usableTrack,
    };

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const drag = draggingRef.current;
      if (!drag) return;
      const deltaY = moveEvent.clientY - drag.startY;
      const scrollDelta = (deltaY / drag.usableTrack) * drag.maxScroll;
      window.scrollTo({
        top: Math.max(0, Math.min(drag.maxScroll, drag.startScrollTop + scrollDelta)),
        behavior: 'auto',
      });
    };

    const handleMouseUp = () => {
      draggingRef.current = null;
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const handleTrackClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!trackRef.current || metrics.maxScroll <= 0) return;
    const rect = trackRef.current.getBoundingClientRect();
    const clickY = e.clientY - rect.top - metrics.thumbHeight / 2;
    const usableTrack = Math.max(1, rect.height - metrics.thumbHeight);
    const ratio = Math.max(0, Math.min(1, clickY / usableTrack));
    window.scrollTo({
      top: Math.round(ratio * metrics.maxScroll),
      behavior: 'smooth',
    });
  };

  if (!metrics.visible) return null;

  return (
    <div
      ref={trackRef}
      data-testid="custom-page-scrollbar"
      aria-hidden="true"
      onClick={handleTrackClick}
      style={{
        top: `${topOffset}px`,
        bottom: `${bottomOffset}px`,
      }}
      className="fixed right-1.5 z-40 w-[8px] rounded-full bg-[#F0DFCE]/75 border border-[#EBD7C3]/75 cursor-pointer select-none"
    >
      <div
        data-testid="custom-page-scrollbar-thumb"
        onMouseDown={handleThumbMouseDown}
        style={{
          height: `${metrics.thumbHeight}px`,
          transform: `translateY(${metrics.thumbTop}px)`,
        }}
        className="w-full rounded-full bg-[#D96B08] hover:bg-[#B85605] shadow-[0_1px_4px_rgba(138,69,5,0.28)] cursor-grab active:cursor-grabbing transition-colors"
      />
    </div>
  );
};

export interface CustomScrollAreaHandle {
  scrollToTop: () => void;
}

interface CustomScrollAreaProps {
  children: React.ReactNode;
  className?: string;
  outerClassName?: string;
}

export const CustomScrollArea = forwardRef<CustomScrollAreaHandle, CustomScrollAreaProps>(
  ({ children, className = '', outerClassName = '' }, ref) => {
    const scrollRef = useRef<HTMLDivElement | null>(null);
    const trackRef = useRef<HTMLDivElement | null>(null);
    const draggingRef = useRef<{
      startY: number;
      startScrollTop: number;
      maxScroll: number;
      usableTrack: number;
    } | null>(null);

    useImperativeHandle(
      ref,
      () => ({
        scrollToTop: () => {
          scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
        },
      }),
      []
    );

  const [metrics, setMetrics] = useState<ScrollMetrics>({
    visible: false,
    thumbHeight: 28,
    thumbTop: 0,
    maxScroll: 0,
    trackHeight: 0,
  });

  const updateMetrics = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;

    const maxScroll = Math.max(0, el.scrollHeight - el.clientHeight);
    if (maxScroll <= 2 || el.clientHeight <= 20) {
      setMetrics((prev) =>
        prev.visible ? { ...prev, visible: false, maxScroll: 0 } : prev
      );
      return;
    }

    const trackHeight =
      trackRef.current?.clientHeight || Math.max(32, el.clientHeight - 8);
    const ratio = el.clientHeight / el.scrollHeight;
    const thumbHeight = Math.max(
      28,
      Math.min(trackHeight, Math.round(trackHeight * ratio))
    );
    const usableTrack = Math.max(1, trackHeight - thumbHeight);
    const thumbTop = Math.round((el.scrollTop / maxScroll) * usableTrack);

    setMetrics({
      visible: true,
      thumbHeight,
      thumbTop,
      maxScroll,
      trackHeight,
    });
  }, []);

  useEffect(() => {
    updateMetrics();
    const el = scrollRef.current;
    if (!el) return;

    const resizeObserver =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(() => updateMetrics())
        : null;
    if (resizeObserver) {
      resizeObserver.observe(el);
      Array.from(el.children).forEach((child) => resizeObserver.observe(child));
    }

    const mutationObserver =
      typeof MutationObserver !== 'undefined'
        ? new MutationObserver(() => updateMetrics())
        : null;
    mutationObserver?.observe(el, {
      childList: true,
      subtree: true,
    });

    return () => {
      resizeObserver?.disconnect();
      mutationObserver?.disconnect();
    };
  }, [updateMetrics, children]);

  const handleThumbMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const el = scrollRef.current;
    if (!el) return;

    const usableTrack = Math.max(1, metrics.trackHeight - metrics.thumbHeight);
    draggingRef.current = {
      startY: e.clientY,
      startScrollTop: el.scrollTop,
      maxScroll: metrics.maxScroll,
      usableTrack,
    };

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const drag = draggingRef.current;
      const target = scrollRef.current;
      if (!drag || !target) return;
      const deltaY = moveEvent.clientY - drag.startY;
      const scrollDelta = (deltaY / drag.usableTrack) * drag.maxScroll;
      target.scrollTop = Math.max(
        0,
        Math.min(drag.maxScroll, drag.startScrollTop + scrollDelta)
      );
    };

    const handleMouseUp = () => {
      draggingRef.current = null;
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const handleTrackClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = scrollRef.current;
    if (!el || !trackRef.current || metrics.maxScroll <= 0) return;
    const rect = trackRef.current.getBoundingClientRect();
    const clickY = e.clientY - rect.top - metrics.thumbHeight / 2;
    const usableTrack = Math.max(1, rect.height - metrics.thumbHeight);
    const ratio = Math.max(0, Math.min(1, clickY / usableTrack));
    el.scrollTo({
      top: Math.round(ratio * metrics.maxScroll),
      behavior: 'smooth',
    });
  };

  return (
    <div className={`relative ${outerClassName}`}>
      <div
        ref={scrollRef}
        onScroll={updateMetrics}
        className={`overflow-y-auto ${metrics.visible ? 'pr-3' : ''} ${className}`}
      >
        {children}
      </div>

      {metrics.visible && (
        <div
          ref={trackRef}
          data-testid="custom-container-scrollbar"
          aria-hidden="true"
          onClick={handleTrackClick}
          className="absolute right-0.5 top-1 bottom-1 w-[6px] rounded-full bg-[#F0DFCE]/75 cursor-pointer select-none"
        >
          <div
            onMouseDown={handleThumbMouseDown}
            style={{
              height: `${metrics.thumbHeight}px`,
              transform: `translateY(${metrics.thumbTop}px)`,
            }}
            className="w-full rounded-full bg-[#D96B08] hover:bg-[#B85605] cursor-grab active:cursor-grabbing transition-colors"
          />
        </div>
      )}
      </div>
    );
  }
);

CustomScrollArea.displayName = 'CustomScrollArea';

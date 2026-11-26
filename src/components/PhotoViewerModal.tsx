import React, { useEffect } from 'react';

export interface ActivePhotoViewer {
  src: string;
  title?: string;
}

interface PhotoViewerModalProps {
  photo: ActivePhotoViewer | null;
  onClose: () => void;
}

export const PhotoViewerModal: React.FC<PhotoViewerModalProps> = ({ photo, onClose }) => {
  useEffect(() => {
    if (!photo) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [photo, onClose]);

  if (!photo) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={photo.title ? `Visualização da foto: ${photo.title}` : 'Visualização da foto'}
      data-testid="photo-viewer-modal"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-[100] bg-black/92 backdrop-blur-[2px] flex flex-col items-center justify-between p-4 sm:p-6"
    >
      {/* Barra superior */}
      <div
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
        className="w-full max-w-[900px] flex items-center justify-between gap-3 shrink-0"
      >
        <p className="text-white text-[15px] font-bold truncate">
          {photo.title || 'Visualizar foto'}
        </p>
        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar foto"
          className="w-10 h-10 rounded-full bg-white/15 hover:bg-white/25 text-white text-2xl leading-none flex items-center justify-center shrink-0 transition-colors cursor-pointer"
        >
          ×
        </button>
      </div>

      {/* Imagem inteira sem cortes */}
      <div
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
        className="flex-1 w-full min-h-0 flex items-center justify-center py-3"
      >
        <img
          src={photo.src}
          alt={photo.title || 'Foto em tela cheia'}
          className="max-w-full max-h-full w-auto h-auto object-contain rounded-xl shadow-[0_12px_40px_rgba(0,0,0,0.6)] select-none"
        />
      </div>

      {/* Botão inferior */}
      <div
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
        className="w-full flex justify-center shrink-0"
      >
        <button
          type="button"
          onClick={onClose}
          className="px-6 py-2.5 rounded-full bg-[#D96B08] hover:bg-[#C25E06] text-white text-[14px] font-bold shadow-[0_6px_18px_rgba(0,0,0,0.35)] transition-colors cursor-pointer"
        >
          Fechar imagem
        </button>
      </div>
    </div>
  );
};

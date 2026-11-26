import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useApp } from '../context/AppContext';
import { captureVideoFrameAsDataUrl, readImageAsDataUrl } from '../utils/imageFile';

interface PhotoSourceModalProps {
  open: boolean;
  title?: string;
  theme?: 'orange' | 'teal';
  preferredFacingMode?: 'user' | 'environment';
  onClose: () => void;
  onSelectPhoto: (dataUrl: string, fileName: string) => void;
  onError?: (message: string) => void;
}

type ModalStep = 'choose' | 'camera' | 'preview';

export const PhotoSourceModal: React.FC<PhotoSourceModalProps> = ({
  open,
  title = 'Adicionar Foto',
  theme = 'orange',
  preferredFacingMode = 'environment',
  onClose,
  onSelectPhoto,
  onError,
}) => {
  const { openPhotoViewer } = useApp();
  const [step, setStep] = useState<ModalStep>('choose');
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>(preferredFacingMode);
  const [cameraStarting, setCameraStarting] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [capturedDataUrl, setCapturedDataUrl] = useState<string>('');
  const [processingFile, setProcessingFile] = useState(false);

  const galleryInputRef = useRef<HTMLInputElement | null>(null);
  const nativeCameraInputRef = useRef<HTMLInputElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const isTeal = theme === 'teal';

  const stopCameraStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  const handleClose = useCallback(() => {
    stopCameraStream();
    setStep('choose');
    setCameraError(null);
    setCapturedDataUrl('');
    setCameraStarting(false);
    onClose();
  }, [onClose, stopCameraStream]);

  useEffect(() => {
    if (!open) {
      stopCameraStream();
      setStep('choose');
      setCameraError(null);
      setCapturedDataUrl('');
      setCameraStarting(false);
    } else {
      setFacingMode(preferredFacingMode);
    }
  }, [open, preferredFacingMode, stopCameraStream]);

  useEffect(() => {
    return () => {
      stopCameraStream();
    };
  }, [stopCameraStream]);

  const startLiveCamera = useCallback(
    async (targetFacing: 'user' | 'environment') => {
      stopCameraStream();
      setStep('camera');
      setCameraError(null);
      setCameraStarting(true);

      if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
        setCameraStarting(false);
        setCameraError(
          'A câmera ao vivo não está disponível neste navegador. Use a opção abaixo para abrir a câmera do aparelho ou escolha uma foto da galeria.'
        );
        return;
      }

      try {
        let stream: MediaStream;
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: { ideal: targetFacing } },
            audio: false,
          });
        } catch {
          stream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: false,
          });
        }

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => undefined);
        }
      } catch (err: any) {
        const name = err?.name || '';
        if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
          setCameraError(
            'Permissão da câmera negada. Autorize o acesso à câmera ou escolha uma foto da galeria.'
          );
        } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
          setCameraError(
            'Nenhuma câmera foi encontrada neste dispositivo. Você pode usar a câmera nativa do aparelho ou escolher uma imagem da galeria.'
          );
        } else {
          setCameraError(
            'Não foi possível iniciar a câmera agora. Tente abrir a câmera do aparelho ou selecionar da galeria.'
          );
        }
      } finally {
        setCameraStarting(false);
      }
    },
    [stopCameraStream]
  );

  const handleToggleFacing = () => {
    const next = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(next);
    void startLiveCamera(next);
  };

  const handleCaptureFrame = () => {
    const video = videoRef.current;
    if (!video || !streamRef.current) return;
    try {
      const dataUrl = captureVideoFrameAsDataUrl(video);
      stopCameraStream();
      setCapturedDataUrl(dataUrl);
      setStep('preview');
    } catch (err: any) {
      const msg = err?.message || 'Não foi possível capturar a foto.';
      setCameraError(msg);
    }
  };

  const handleConfirmCapturedPhoto = () => {
    if (!capturedDataUrl) return;
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    onSelectPhoto(capturedDataUrl, `foto-camera-${stamp}.jpg`);
    handleClose();
  };

  const handleFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setProcessingFile(true);
    try {
      const dataUrl = await readImageAsDataUrl(file);
      onSelectPhoto(dataUrl, file.name || 'foto-selecionada.jpg');
      handleClose();
    } catch (err: any) {
      const msg = err?.message || 'Erro ao carregar imagem.';
      setCameraError(msg);
      onError?.(msg);
    } finally {
      setProcessingFile(false);
    }
  };

  if (!open) return null;

  const palette = isTeal
    ? {
        overlay: 'bg-[#09453A]/45',
        border: 'border-[#C6E5DF]',
        divider: 'border-[#E3F3EF]',
        title: 'text-[#055C4D]',
        close: 'text-[#0E7C6B]',
        optionBg: 'bg-[#F0F9F7] hover:bg-[#E3F3EF]',
        optionBorder: 'border-[#A6DCD2]',
        optionIconBg: 'bg-[#089C83]',
        optionTitle: 'text-[#055C4D]',
        optionSub: 'text-[#168572]',
        primaryBtn: 'bg-[#089C83] hover:bg-[#078570]',
        secondaryBtn: 'border-[#C6E5DF] text-[#055C4D] hover:bg-[#F5FCFA]',
      }
    : {
        overlay: 'bg-[#281402]/45',
        border: 'border-[#F0DFCE]',
        divider: 'border-[#F0DFCE]',
        title: 'text-[#8A4505]',
        close: 'text-[#B8651B]',
        optionBg: 'bg-[#FFF8F1] hover:bg-[#FFF0E0]',
        optionBorder: 'border-[#EBD7C3]',
        optionIconBg: 'bg-[#D96B08]',
        optionTitle: 'text-[#8A4505]',
        optionSub: 'text-[#B8651B]',
        primaryBtn: 'bg-[#D96B08] hover:bg-[#C25E06]',
        secondaryBtn: 'border-[#EBD7C3] text-[#8A4505] hover:bg-[#FFF8F1]',
      };

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget && !processingFile) handleClose();
      }}
      className={`fixed inset-0 z-[70] ${palette.overlay} flex items-center justify-center p-4`}
    >
      <div
        className={`w-full max-w-[350px] bg-white rounded-[20px] border ${palette.border} p-5 flex flex-col gap-3.5 shadow-[0_12px_32px_rgba(0,0,0,0.2)]`}
      >
        {/* Header */}
        <div className={`flex items-center justify-between pb-2.5 border-b ${palette.divider}`}>
          <h3 className={`text-[16.5px] font-bold ${palette.title}`}>
            {step === 'camera'
              ? 'Tirar Foto Agora'
              : step === 'preview'
              ? 'Prévia da Foto'
              : title}
          </h3>
          <button
            type="button"
            disabled={processingFile}
            onClick={handleClose}
            aria-label="Fechar"
            className={`text-2xl ${palette.close} leading-none px-1`}
          >
            ×
          </button>
        </div>

        {/* Inputs ocultos (galeria e câmera nativa fallback) */}
        <input
          ref={galleryInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileInputChange}
          className="hidden"
          aria-label="Selecionar foto da galeria"
        />
        <input
          ref={nativeCameraInputRef}
          type="file"
          accept="image/*"
          capture={facingMode}
          onChange={handleFileInputChange}
          className="hidden"
          aria-label="Tirar foto com câmera do aparelho"
        />

        {cameraError && step === 'choose' && (
          <div className="bg-[#FFF5F5] border border-[#F8CACA] rounded-xl px-3 py-2 text-[12.5px] font-semibold text-[#C92A2A] text-center">
            {cameraError}
          </div>
        )}

        {/* Etapa 1: Escolher origem */}
        {step === 'choose' && (
          <div className="flex flex-col gap-2.5">
            <p className={`text-[13px] ${palette.optionSub}`}>
              Como você deseja adicionar a foto?
            </p>

            <button
              type="button"
              disabled={processingFile}
              onClick={() => void startLiveCamera(facingMode)}
              className={`w-full p-3.5 rounded-2xl border-[1.5px] ${palette.optionBorder} ${palette.optionBg} flex items-center gap-3 text-left transition-colors`}
            >
              <span
                className={`w-11 h-11 rounded-xl ${palette.optionIconBg} text-white flex items-center justify-center shrink-0`}
              >
                <svg
                  width="22"
                  height="22"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.1"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                  <circle cx="12" cy="13" r="4" />
                </svg>
              </span>
              <span className="flex flex-col">
                <span className={`text-[14px] font-bold ${palette.optionTitle}`}>
                  Tirar foto agora
                </span>
                <span className={`text-[12px] ${palette.optionSub}`}>
                  Usar a câmera do dispositivo
                </span>
              </span>
            </button>

            <button
              type="button"
              disabled={processingFile}
              onClick={() => galleryInputRef.current?.click()}
              className={`w-full p-3.5 rounded-2xl border-[1.5px] ${palette.optionBorder} ${palette.optionBg} flex items-center gap-3 text-left transition-colors`}
            >
              <span
                className={`w-11 h-11 rounded-xl ${palette.optionIconBg} text-white flex items-center justify-center shrink-0`}
              >
                <svg
                  width="22"
                  height="22"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.1"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <polyline points="21 15 16 10 5 21" />
                </svg>
              </span>
              <span className="flex flex-col">
                <span className={`text-[14px] font-bold ${palette.optionTitle}`}>
                  Escolher da galeria
                </span>
                <span className={`text-[12px] ${palette.optionSub}`}>
                  Selecionar uma imagem já salva
                </span>
              </span>
            </button>

            <button
              type="button"
              disabled={processingFile}
              onClick={handleClose}
              className={`mt-1 w-full h-10 rounded-full bg-white border ${palette.secondaryBtn} text-[13px] font-bold transition-colors`}
            >
              Cancelar
            </button>
          </div>
        )}

        {/* Etapa 2: Câmera ao vivo */}
        {step === 'camera' && (
          <div className="flex flex-col gap-3">
            {cameraError ? (
              <div className="flex flex-col gap-2.5">
                <div className="bg-[#FFF5F5] border border-[#F8CACA] rounded-xl p-3 text-[12.5px] font-medium text-[#C92A2A] leading-relaxed">
                  {cameraError}
                </div>
                <button
                  type="button"
                  onClick={() => nativeCameraInputRef.current?.click()}
                  className={`w-full h-11 rounded-full ${palette.primaryBtn} text-white text-[13.5px] font-bold transition-colors`}
                >
                  Abrir câmera do aparelho
                </button>
                <button
                  type="button"
                  onClick={() => galleryInputRef.current?.click()}
                  className={`w-full h-10 rounded-full bg-white border ${palette.secondaryBtn} text-[13px] font-bold transition-colors`}
                >
                  Escolher da galeria
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCameraError(null);
                    setStep('choose');
                  }}
                  className={`w-full h-9 text-[12.5px] font-semibold ${palette.optionSub}`}
                >
                  Voltar
                </button>
              </div>
            ) : (
              <>
                <div className="relative w-full aspect-[4/3] bg-[#1E140B] rounded-2xl overflow-hidden flex items-center justify-center">
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className={`w-full h-full object-cover ${
                      facingMode === 'user' ? '-scale-x-100' : ''
                    }`}
                  />
                  {cameraStarting && (
                    <div className="absolute inset-0 bg-black/55 flex items-center justify-center text-white text-[13px] font-semibold">
                      Abrindo câmera...
                    </div>
                  )}
                  <button
                    type="button"
                    disabled={cameraStarting}
                    onClick={handleToggleFacing}
                    aria-label="Alternar câmera frontal e traseira"
                    className="absolute top-2.5 right-2.5 px-2.5 py-1.5 rounded-full bg-black/55 hover:bg-black/70 text-white text-[11.5px] font-bold flex items-center gap-1"
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <polyline points="23 4 23 10 17 10" />
                      <polyline points="1 20 1 14 7 14" />
                      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                    </svg>
                    Virar
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => {
                      stopCameraStream();
                      setStep('choose');
                    }}
                    className={`h-10 rounded-full bg-white border ${palette.secondaryBtn} text-[13px] font-bold transition-colors`}
                  >
                    Voltar
                  </button>
                  <button
                    type="button"
                    disabled={cameraStarting}
                    onClick={handleCaptureFrame}
                    className={`h-10 rounded-full ${palette.primaryBtn} disabled:opacity-60 text-white text-[13px] font-bold transition-colors`}
                  >
                    Capturar foto
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* Etapa 3: Prévia da foto capturada */}
        {step === 'preview' && capturedDataUrl && (
          <div className="flex flex-col gap-3">
            <button
              type="button"
              onClick={() => openPhotoViewer(capturedDataUrl, title)}
              aria-label="Ver foto capturada em tela cheia"
              title="Ver foto em tela cheia"
              className="w-full cursor-pointer"
            >
              <img
                src={capturedDataUrl}
                alt="Prévia da foto capturada"
                className="w-full max-h-[260px] object-cover rounded-2xl border border-[#EBD7C3]"
              />
            </button>
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => void startLiveCamera(facingMode)}
                className={`h-10 rounded-full bg-white border ${palette.secondaryBtn} text-[13px] font-bold transition-colors`}
              >
                Tirar outra
              </button>
              <button
                type="button"
                onClick={handleConfirmCapturedPhoto}
                className={`h-10 rounded-full ${palette.primaryBtn} text-white text-[13px] font-bold transition-colors`}
              >
                Usar esta foto
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

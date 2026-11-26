/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import React, { useEffect, useState } from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { PageCustomScrollbar } from './components/CustomScrollbar';
import { PhotoViewerModal } from './components/PhotoViewerModal';
import { SwipeableNotificationBanner } from './components/SwipeableNotificationBanner';
import {
  getAlarmSoundProfileLabel,
  unlockWebAlarmAudio,
} from './services/eventNotifications';
import { LoginScreen } from './screens/LoginScreen';
import { RegisterScreen } from './screens/RegisterScreen';
import { HomeScreen } from './screens/HomeScreen';
import { AddAnimalScreen } from './screens/AddAnimalScreen';
import { TipsScreen } from './screens/TipsScreen';
import { EventsScreen } from './screens/EventsScreen';
import { VaccinesScreen } from './screens/VaccinesScreen';
import { SettingsScreen } from './screens/SettingsScreen';

const AuthFlow: React.FC = () => {
  const [screen, setScreen] = useState<'Login' | 'Register'>('Login');
  return (
    <>
      <PageCustomScrollbar topOffset={12} bottomOffset={12} />
      {screen === 'Register' ? (
        <RegisterScreen onNavigateToLogin={() => setScreen('Login')} />
      ) : (
        <LoginScreen onNavigateToRegister={() => setScreen('Register')} />
      )}
    </>
  );
};

const MainLayout: React.FC = () => {
  const {
    usuario,
    activeTab,
    setActiveTab,
    activeBanner,
    dismissBanner,
    activeRingingAlarm,
    dismissRingingAlarm,
    snoozeRingingAlarm,
  } = useApp();
  const isHomeActive = activeTab === 'Home';
  const isProfileActive = activeTab === 'Configuracoes';

  const renderScreen = () => {
    switch (activeTab) {
      case 'Home':
        return <HomeScreen />;
      case 'Dicas':
        return <TipsScreen />;
      case 'AdicionarAnimal':
        return <AddAnimalScreen />;
      case 'Eventos':
        return <EventsScreen />;
      case 'Vacinas':
        return <VaccinesScreen />;
      case 'Configuracoes':
        return <SettingsScreen />;
      default:
        return <HomeScreen />;
    }
  };

  return (
    <div
      className="min-h-screen flex flex-col justify-between text-[#6E3906]"
      style={{
        fontFamily: "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif",
        background: 'linear-gradient(180deg, #FDF8F2 0%, #F7EDE4 100%)',
      }}
    >
      {/* Barra de rolagem customizada */}
      <PageCustomScrollbar topOffset={74} bottomOffset={74} />

      {/* TopNavbar */}
      <header className="sticky top-0 z-40 w-full bg-white border-b border-[#F0DFCE] shadow-[0_4px_16px_rgba(138,69,5,0.06)]">
        <div className="max-w-[480px] h-[68px] mx-auto px-5 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('Configuracoes')}
            aria-label="Configurações do usuário"
            className={`flex items-center gap-3 p-1 rounded-full text-left transition-colors min-w-0 flex-1 cursor-pointer ${
              isProfileActive ? 'bg-[#FFF8F1]' : 'hover:bg-[#FFF8F1]'
            }`}
          >
            <div
              className={`w-[42px] h-[42px] shrink-0 rounded-full bg-[#FFF3E6] border-2 border-[#D96B08] flex items-center justify-center text-[#D96B08] overflow-hidden ${
                isProfileActive ? 'ring-4 ring-[#D96B08]/25' : ''
              }`}
            >
              {usuario?.foto ? (
                <img
                  src={usuario.foto}
                  alt={usuario.nome}
                  className="w-full h-full object-cover"
                />
              ) : (
                <svg
                  width="22"
                  height="22"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
              )}
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-xs font-medium text-[#B8651B] leading-tight">Olá,</span>
              <span className="text-base font-bold text-[#8A4505] leading-tight truncate">
                {usuario?.nome || 'Usuário'}
              </span>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('Home')}
            aria-label="Home Screen"
            title="Ir para Início"
            className={`shrink-0 h-[40px] px-3 rounded-xl border-2 flex items-center justify-center gap-1.5 cursor-pointer transition-all active:translate-y-[1px] ${
              isHomeActive
                ? 'bg-[#D96B08] border-[#B45304] text-white shadow-[0_3px_0_#9A4402,0_6px_14px_rgba(217,107,8,0.28)] active:shadow-[0_1px_0_#9A4402]'
                : 'bg-[#FFF3E6] border-[#D96B08] text-[#8A4505] shadow-[0_3px_0_#D96B08,0_4px_10px_rgba(217,107,8,0.14)] hover:bg-[#FFE6CC] active:shadow-[0_1px_0_#D96B08]'
            }`}
          >
            <svg width="20" height="20" viewBox="0 0 64 64" fill="none" aria-hidden="true">
              <path
                d="M32 33C24.5 33 19 38.8 19 45.2C19 49.4 22.4 52 26.5 52C28.8 52 30.5 51.1 32 51.1C33.5 51.1 35.2 52 37.5 52C41.6 52 45 49.4 45 45.2C45 38.8 39.5 33 32 33Z"
                stroke="currentColor"
                strokeWidth="4.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <ellipse cx="15.5" cy="29.5" rx="4.5" ry="6" transform="rotate(-22 15.5 29.5)" stroke="currentColor" strokeWidth="4" />
              <ellipse cx="25.5" cy="21" rx="4.5" ry="6.2" transform="rotate(-8 25.5 21)" stroke="currentColor" strokeWidth="4" />
              <ellipse cx="38.5" cy="21" rx="4.5" ry="6.2" transform="rotate(8 38.5 21)" stroke="currentColor" strokeWidth="4" />
              <ellipse cx="48.5" cy="29.5" rx="4.5" ry="6" transform="rotate(22 48.5 29.5)" stroke="currentColor" strokeWidth="4" />
            </svg>
            <span className="text-[13px] font-bold leading-none">Início</span>
          </button>
        </div>
      </header>

      {/* Banner de Notificação de Evento (arrastável para o lado) */}
      {activeBanner && (
        <SwipeableNotificationBanner
          key={activeBanner.id}
          banner={activeBanner}
          onDismiss={dismissBanner}
        />
      )}

      {/* Modal de Alarme Tocando (na hora configurada) */}
      {activeRingingAlarm && (
        <div
          role="alertdialog"
          aria-modal="true"
          data-testid="active-alarm-modal"
          onClick={(e) => {
            if (e.target === e.currentTarget) dismissRingingAlarm();
          }}
          className="fixed inset-0 z-[80] bg-[#281402]/60 flex items-center justify-center p-4"
        >
          <div className="w-full max-w-[340px] bg-[#FFFDFB] border-2 border-[#D96B08] rounded-[24px] p-6 shadow-[0_14px_36px_rgba(138,69,5,0.3)] flex flex-col items-center text-center gap-3">
            <div className="w-14 h-14 rounded-full bg-[#FFF3E6] border-2 border-[#D96B08] text-[#D96B08] flex items-center justify-center animate-bounce">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <circle cx="12" cy="13" r="8" />
                <path d="M12 9v4l2.5 2.5" />
                <path d="M5 3 2 6" />
                <path d="m22 6-3-3" />
              </svg>
            </div>
            <div>
              <p className="text-[12px] font-bold uppercase tracking-wide text-[#D96B08]">
                Alarme Tocando • {activeRingingAlarm.horario}
              </p>
              <h3 className="text-[19px] font-bold text-[#8A4505] mt-0.5">
                {activeRingingAlarm.ev.titulo}
              </h3>
              <p className="text-[13px] font-medium text-[#6E3906] mt-1">
                Pet(s): {activeRingingAlarm.animaisNomes}
                {activeRingingAlarm.ev.frequencia
                  ? ` • ${activeRingingAlarm.ev.frequencia}`
                  : ''}{' '}
                • {getAlarmSoundProfileLabel()}
              </p>
            </div>
            <div className="w-full grid grid-cols-2 gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => snoozeRingingAlarm(5)}
                className="h-11 rounded-full border-[1.5px] border-[#EBD7C3] bg-white text-[#8A4505] text-[13px] font-bold"
              >
                Soneca (+5 min)
              </button>
              <button
                type="button"
                onClick={dismissRingingAlarm}
                className="h-11 rounded-full bg-[#D96B08] text-white text-[13px] font-bold"
              >
                Desligar Alarme
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Viewport */}
      <main className="flex-1 w-full">{renderScreen()}</main>

      {/* BottomNavbar */}
      <nav
        aria-label="Navegação principal"
        className="sticky bottom-0 z-40 w-full bg-white border-t border-[#F0DFCE] shadow-[0_-4px_16px_rgba(138,69,5,0.08)]"
      >
        <div className="max-w-[480px] h-[68px] mx-auto grid grid-cols-4">
          {([
            {
              key: 'Dicas',
              label: 'Dicas',
              icon: (
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5" />
                  <path d="M9 18h6" />
                  <path d="M10 22h4" />
                </svg>
              ),
            },
            {
              key: 'AdicionarAnimal',
              label: 'Adicionar Animal',
              icon: (
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              ),
            },
            {
              key: 'Eventos',
              label: 'Eventos',
              icon: (
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                  <line x1="16" y1="2" x2="16" y2="6" />
                  <line x1="8" y1="2" x2="8" y2="6" />
                  <line x1="3" y1="10" x2="21" y2="10" />
                </svg>
              ),
            },
            {
              key: 'Vacinas',
              label: 'Vacinas',
              icon: (
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="m18 2 4 4" />
                  <path d="m17 7 3-3" />
                  <path d="M19 9 8.7 19.3c-1 1-2.5 1-3.4 0l-.6-.6c-1-1-1-2.5 0-3.4L15 5" />
                  <path d="m9 11 4 4" />
                  <path d="m5 19-3 3" />
                  <path d="m14 4 6 6" />
                </svg>
              ),
            },
          ] as const).map((tab, idx, arr) => {
            const isActive = activeTab === tab.key;
            const isNextActive = idx < arr.length - 1 && activeTab === arr[idx + 1].key;
            const showDivider = idx < arr.length - 1 && !isActive && !isNextActive;

            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                aria-label={tab.label}
                aria-current={isActive ? 'page' : undefined}
                className={`relative flex items-center justify-center transition-colors ${
                  isActive
                    ? 'bg-[#D96B08] text-white'
                    : 'text-[#B8651B] hover:bg-[#FFF8F1] hover:text-[#D96B08]'
                }`}
              >
                {tab.icon}
                {showDivider && (
                  <span className="absolute right-0 top-4 bottom-4 w-px bg-[#EBD7C3]" />
                )}
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
};

const RootRouter: React.FC = () => {
  const { isInitializing, isAuthenticated, activePhotoViewer, closePhotoViewer } = useApp();

  if (isInitializing) {
    return (
      <div
        className="min-h-screen flex flex-col items-center justify-center gap-3 text-[#8A4505] font-semibold"
        style={{ background: 'linear-gradient(180deg, #FDF8F2 0%, #F7EDE4 100%)' }}
      >
        Carregando PetMood...
      </div>
    );
  }

  return (
    <>
      {isAuthenticated ? <MainLayout /> : <AuthFlow />}
      <PhotoViewerModal photo={activePhotoViewer} onClose={closePhotoViewer} />
    </>
  );
};

export default function App() {
  useEffect(() => {
    unlockWebAlarmAudio();
  }, []);

  return (
    <AppProvider>
      <RootRouter />
    </AppProvider>
  );
}

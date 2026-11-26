import React, { useMemo, useRef } from 'react';
import {
  ActivityIndicator,
  Animated,
  Modal,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { PlusJakartaSans_400Regular } from '@expo-google-fonts/plus-jakarta-sans/400Regular';
import { PlusJakartaSans_500Medium } from '@expo-google-fonts/plus-jakarta-sans/500Medium';
import { PlusJakartaSans_600SemiBold } from '@expo-google-fonts/plus-jakarta-sans/600SemiBold';
import { PlusJakartaSans_700Bold } from '@expo-google-fonts/plus-jakarta-sans/700Bold';
import {
  ActiveNotificationBanner,
  AppProvider,
  useApp,
} from './src/context/AppContext';
import { getNativeAlarmSoundLabel } from './src/services/eventNotifications';
import { TopNavbar } from './src/components/TopNavbar';
import { BottomNavbar } from './src/components/BottomNavbar';
import { PhotoViewerModal } from './src/components/PhotoViewerModal';
import { LoginScreen } from './src/screens/LoginScreen';
import { RegisterScreen } from './src/screens/RegisterScreen';
import { HomeScreen } from './src/screens/HomeScreen';
import { AddAnimalScreen } from './src/screens/AddAnimalScreen';
import { TipsScreen } from './src/screens/TipsScreen';
import { EventsScreen } from './src/screens/EventsScreen';
import { VaccinesScreen } from './src/screens/VaccinesScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';

const CHANNEL_LABELS: Record<'app' | 'whatsapp', string> = {
  app: 'Barra',
  whatsapp: 'WhatsApp',
};

const SwipeableNotificationBanner: React.FC<{
  banner: ActiveNotificationBanner;
  onDismiss: () => void;
}> = ({ banner, onDismiss }) => {
  const translateX = useRef(new Animated.Value(0)).current;
  const dismissingRef = useRef(false);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gestureState) =>
          !dismissingRef.current &&
          Math.abs(gestureState.dx) > 8 &&
          Math.abs(gestureState.dx) > Math.abs(gestureState.dy),
        onPanResponderMove: (_, gestureState) => {
          if (dismissingRef.current) return;
          translateX.setValue(gestureState.dx);
        },
        onPanResponderRelease: (_, gestureState) => {
          if (dismissingRef.current) return;
          const shouldDismiss =
            Math.abs(gestureState.dx) >= 85 ||
            (Math.abs(gestureState.vx) >= 0.5 && Math.abs(gestureState.dx) >= 30);

          if (shouldDismiss) {
            dismissingRef.current = true;
            Animated.timing(translateX, {
              toValue: gestureState.dx >= 0 ? 440 : -440,
              duration: 200,
              useNativeDriver: true,
            }).start(() => {
              onDismiss();
            });
          } else {
            Animated.spring(translateX, {
              toValue: 0,
              useNativeDriver: true,
              friction: 8,
              tension: 90,
            }).start();
          }
        },
        onPanResponderTerminate: () => {
          if (dismissingRef.current) return;
          Animated.spring(translateX, {
            toValue: 0,
            useNativeDriver: true,
            friction: 8,
            tension: 90,
          }).start();
        },
      }),
    [onDismiss, translateX]
  );

  const opacity = translateX.interpolate({
    inputRange: [-220, 0, 220],
    outputRange: [0.15, 1, 0.15],
    extrapolate: 'clamp',
  });

  const rotate = translateX.interpolate({
    inputRange: [-220, 0, 220],
    outputRange: ['-4deg', '0deg', '4deg'],
    extrapolate: 'clamp',
  });

  return (
    <View style={styles.bannerWrapper} pointerEvents="box-none">
      <Animated.View
        {...panResponder.panHandlers}
        style={[
          styles.bannerCard,
          {
            opacity,
            transform: [{ translateX }, { rotate }],
          },
        ]}
      >
        <View style={styles.bannerIconBox}>
          <Svg
            width={18}
            height={18}
            viewBox="0 0 24 24"
            fill="none"
            stroke="#D96B08"
            strokeWidth={2.2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <Path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
            <Path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </Svg>
        </View>
        <View style={styles.bannerContent}>
          <Text style={styles.bannerTitle}>{banner.title}</Text>
          <Text style={styles.bannerMessage}>{banner.message}</Text>
          <View style={styles.bannerChannelsRow}>
            {banner.channels.map((ch) => (
              <View key={ch} style={styles.bannerChannelTag}>
                <Text style={styles.bannerChannelText}>
                  {CHANNEL_LABELS[ch]}
                </Text>
              </View>
            ))}
            <Text style={styles.bannerSwipeHint}>Arraste para dispensar</Text>
          </View>
        </View>
        <TouchableOpacity
          onPress={onDismiss}
          accessibilityLabel="Fechar notificação"
          style={styles.bannerCloseBtn}
        >
          <Text style={styles.bannerCloseText}>×</Text>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
};

type AuthStackParamList = {
  Login: undefined;
  Register: undefined;
};

const AuthStack = createNativeStackNavigator<AuthStackParamList>();

const AuthNavigator: React.FC = () => {
  return (
    <AuthStack.Navigator
      initialRouteName="Login"
      screenOptions={{ headerShown: false, animation: 'fade' }}
    >
      <AuthStack.Screen name="Login">
        {({ navigation }) => (
          <LoginScreen
            onNavigateToRegister={() => navigation.navigate('Register')}
          />
        )}
      </AuthStack.Screen>
      <AuthStack.Screen name="Register">
        {({ navigation }) => (
          <RegisterScreen
            onNavigateToLogin={() => navigation.navigate('Login')}
          />
        )}
      </AuthStack.Screen>
    </AuthStack.Navigator>
  );
};

const MainLayout: React.FC = () => {
  const {
    usuario,
    activeTab,
    setActiveTab,
    activeBanner,
    dismissBanner,
  } = useApp();

  const renderActiveScreen = () => {
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
    <View style={styles.authenticatedRoot}>
      <TopNavbar
        userName={usuario?.nome || 'Usuário'}
        userPhoto={usuario?.foto}
        activeTab={activeTab}
        onPressProfile={() => setActiveTab('Configuracoes')}
        onPressHome={() => setActiveTab('Home')}
      />
      {activeBanner ? (
        <SwipeableNotificationBanner
          key={activeBanner.id}
          banner={activeBanner}
          onDismiss={dismissBanner}
        />
      ) : null}
      <View style={styles.screenViewport}>{renderActiveScreen()}</View>
      <BottomNavbar activeTab={activeTab} onSelectTab={setActiveTab} />
    </View>
  );
};

const AppContent: React.FC = () => {
  const {
    isInitializing,
    isAuthenticated,
    activePhotoViewer,
    closePhotoViewer,
    activeRingingAlarm,
    dismissRingingAlarm,
    snoozeRingingAlarm,
  } = useApp();
  const [fontsLoaded, fontError] = useFonts({
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
  });

  if ((!fontsLoaded && !fontError) || isInitializing) {
    return (
      <View style={styles.splashContainer}>
        <ActivityIndicator size="large" color="#D96B08" />
        <Text style={styles.splashText}>Carregando PetMood...</Text>
      </View>
    );
  }

  return (
    <>
      <NavigationContainer>
        {isAuthenticated ? <MainLayout /> : <AuthNavigator />}
      </NavigationContainer>
      <PhotoViewerModal photo={activePhotoViewer} onClose={closePhotoViewer} />

      <Modal
        visible={Boolean(activeRingingAlarm)}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={dismissRingingAlarm}
      >
        <View style={styles.alarmOverlay}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={dismissRingingAlarm}
            accessibilityLabel="Fechar pop-up"
          />
          <View style={styles.alarmModalCard}>
            <View style={styles.alarmIconCircle}>
              <Svg
                width={28}
                height={28}
                viewBox="0 0 24 24"
                fill="none"
                stroke="#D96B08"
                strokeWidth={2.2}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <Circle cx="12" cy="13" r="8" />
                <Path d="M12 9v4l2.5 2.5" />
                <Path d="M5 3 2 6" />
                <Path d="m22 6-3-3" />
              </Svg>
            </View>
            <Text style={styles.alarmEyebrow}>
              Alarme Tocando • {activeRingingAlarm?.horario}
            </Text>
            <Text style={styles.alarmModalTitle}>
              {activeRingingAlarm?.ev.titulo}
            </Text>
            <Text style={styles.alarmModalMeta}>
              Pet(s): {activeRingingAlarm?.animaisNomes}
              {activeRingingAlarm?.ev.frequencia
                ? ` • ${activeRingingAlarm.ev.frequencia}`
                : ''}{' '}
              • {getNativeAlarmSoundLabel()}
            </Text>
            <View style={styles.alarmButtonsRow}>
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => snoozeRingingAlarm(5)}
                style={styles.alarmSnoozeBtn}
              >
                <Text style={styles.alarmSnoozeText}>Soneca (+5 min)</Text>
              </TouchableOpacity>
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={dismissRingingAlarm}
                style={styles.alarmDismissBtn}
              >
                <Text style={styles.alarmDismissText}>Desligar Alarme</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
};

export default function App() {
  return (
    <SafeAreaProvider>
      <AppProvider>
        <StatusBar style="dark" />
        <AppContent />
      </AppProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  splashContainer: {
    flex: 1,
    backgroundColor: '#FDF8F2',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  splashText: {
    fontSize: 15,
    color: '#8A4505',
    fontWeight: '600',
  },
  authenticatedRoot: {
    flex: 1,
    backgroundColor: '#FDF8F2',
  },
  screenViewport: {
    flex: 1,
  },
  bannerWrapper: {
    position: 'absolute',
    top: 76,
    left: 16,
    right: 16,
    zIndex: 80,
    alignItems: 'center',
  },
  bannerCard: {
    width: '100%',
    maxWidth: 390,
    backgroundColor: '#FFFDFB',
    borderWidth: 2,
    borderColor: '#D96B08',
    borderRadius: 16,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    shadowColor: '#8A4505',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 14,
    elevation: 8,
  },
  bannerIconBox: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FFF3E6',
    borderWidth: 1,
    borderColor: '#F0DFCE',
    justifyContent: 'center',
    alignItems: 'center',
  },
  bannerContent: {
    flex: 1,
    gap: 3,
  },
  bannerTitle: {
    fontSize: 13.5,
    fontFamily: 'PlusJakartaSans_700Bold',
    color: '#8A4505',
  },
  bannerMessage: {
    fontSize: 12.5,
    fontFamily: 'PlusJakartaSans_400Regular',
    color: '#6E3906',
    lineHeight: 17,
  },
  bannerChannelsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  bannerChannelTag: {
    backgroundColor: '#FFF3E6',
    borderWidth: 1,
    borderColor: '#F0DFCE',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  bannerChannelText: {
    fontSize: 10.5,
    fontFamily: 'PlusJakartaSans_700Bold',
    color: '#D96B08',
  },
  bannerSwipeHint: {
    fontSize: 10.5,
    fontFamily: 'PlusJakartaSans_500Medium',
    color: '#B8651B',
    opacity: 0.8,
    marginLeft: 'auto',
  },
  bannerCloseBtn: {
    paddingHorizontal: 4,
  },
  bannerCloseText: {
    fontSize: 20,
    color: '#B8651B',
    lineHeight: 22,
  },
  alarmOverlay: {
    flex: 1,
    backgroundColor: 'rgba(40, 20, 2, 0.58)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  alarmModalCard: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: '#FFFDFB',
    borderWidth: 2,
    borderColor: '#D96B08',
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    gap: 10,
  },
  alarmIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#FFF3E6',
    borderWidth: 2,
    borderColor: '#D96B08',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  alarmEyebrow: {
    fontSize: 12,
    fontFamily: 'PlusJakartaSans_700Bold',
    color: '#D96B08',
    textTransform: 'uppercase',
  },
  alarmModalTitle: {
    fontSize: 19,
    fontFamily: 'PlusJakartaSans_700Bold',
    color: '#8A4505',
    textAlign: 'center',
  },
  alarmModalMeta: {
    fontSize: 13,
    fontFamily: 'PlusJakartaSans_500Medium',
    color: '#6E3906',
    textAlign: 'center',
  },
  alarmButtonsRow: {
    flexDirection: 'row',
    width: '100%',
    gap: 10,
    marginTop: 8,
  },
  alarmSnoozeBtn: {
    flex: 1,
    height: 44,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: '#EBD7C3',
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  alarmSnoozeText: {
    fontSize: 13,
    fontFamily: 'PlusJakartaSans_700Bold',
    color: '#8A4505',
  },
  alarmDismissBtn: {
    flex: 1,
    height: 44,
    borderRadius: 999,
    backgroundColor: '#D96B08',
    justifyContent: 'center',
    alignItems: 'center',
  },
  alarmDismissText: {
    fontSize: 13,
    fontFamily: 'PlusJakartaSans_700Bold',
    color: '#FFFFFF',
  },
});

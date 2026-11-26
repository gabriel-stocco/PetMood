import React from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Ellipse, Path } from 'react-native-svg';
import { AuthenticatedTab } from '../types';

interface TopNavbarProps {
  userName: string;
  userPhoto?: string;
  activeTab: AuthenticatedTab;
  onPressProfile: () => void;
  onPressHome: () => void;
}

export const TopNavbar: React.FC<TopNavbarProps> = ({
  userName,
  userPhoto,
  activeTab,
  onPressProfile,
  onPressHome,
}) => {
  const insets = useSafeAreaInsets();
  const isProfileActive = activeTab === 'Configuracoes';
  const isHomeActive = activeTab === 'Home';

  return (
    <View style={[styles.headerWrapper, { paddingTop: insets.top }]}>
      <View style={styles.innerContainer}>
        {/* Botão de Perfil / Configurações no topo esquerdo */}
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={onPressProfile}
          style={[
            styles.userProfileBtn,
            isProfileActive && styles.userProfileBtnActive,
          ]}
          accessibilityRole="button"
          accessibilityLabel="Configurações do usuário"
          accessibilityState={{ selected: isProfileActive }}
        >
          <View
            style={[
              styles.avatarCircle,
              isProfileActive && styles.avatarCircleActive,
            ]}
          >
            {userPhoto ? (
              <Image
                source={{ uri: userPhoto }}
                style={styles.avatarImage}
                resizeMode="cover"
              />
            ) : (
              <Svg
                width={22}
                height={22}
                viewBox="0 0 24 24"
                fill="none"
                stroke="#D96B08"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <Path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
                <Circle cx="12" cy="7" r="4" />
              </Svg>
            )}
          </View>

          <View style={styles.userInfo}>
            <Text style={styles.userGreeting}>Olá,</Text>
            <Text style={styles.userName} numberOfLines={1}>
              {userName || 'Usuário'}
            </Text>
          </View>
        </TouchableOpacity>

        {/* Botão Home com Ícone de Pata de Cachorro SVG e rótulo no topo direito */}
        <TouchableOpacity
          activeOpacity={0.75}
          onPress={onPressHome}
          style={[styles.homeButton, isHomeActive && styles.homeButtonActive]}
          accessibilityRole="button"
          accessibilityLabel="Home Screen"
          accessibilityState={{ selected: isHomeActive }}
        >
          <Svg
            width={20}
            height={20}
            viewBox="0 0 64 64"
            fill="none"
          >
            {/* Almofada principal */}
            <Path
              d="M32 33C24.5 33 19 38.8 19 45.2C19 49.4 22.4 52 26.5 52C28.8 52 30.5 51.1 32 51.1C33.5 51.1 35.2 52 37.5 52C41.6 52 45 49.4 45 45.2C45 38.8 39.5 33 32 33Z"
              stroke={isHomeActive ? '#FFFFFF' : '#8A4505'}
              strokeWidth={4.2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {/* Dedo esquerdo externo */}
            <Ellipse
              cx="15.5"
              cy="29.5"
              rx="4.5"
              ry="6"
              transform="rotate(-22 15.5 29.5)"
              stroke={isHomeActive ? '#FFFFFF' : '#8A4505'}
              strokeWidth={4}
            />
            {/* Dedo esquerdo interno */}
            <Ellipse
              cx="25.5"
              cy="21"
              rx="4.5"
              ry="6.2"
              transform="rotate(-8 25.5 21)"
              stroke={isHomeActive ? '#FFFFFF' : '#8A4505'}
              strokeWidth={4}
            />
            {/* Dedo direito interno */}
            <Ellipse
              cx="38.5"
              cy="21"
              rx="4.5"
              ry="6.2"
              transform="rotate(8 38.5 21)"
              stroke={isHomeActive ? '#FFFFFF' : '#8A4505'}
              strokeWidth={4}
            />
            {/* Dedo direito externo */}
            <Ellipse
              cx="48.5"
              cy="29.5"
              rx="4.5"
              ry="6"
              transform="rotate(22 48.5 29.5)"
              stroke={isHomeActive ? '#FFFFFF' : '#8A4505'}
              strokeWidth={4}
            />
          </Svg>
          <Text style={[styles.homeButtonText, isHomeActive && styles.homeButtonTextActive]}>
            Início
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  headerWrapper: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F0DFCE',
    shadowColor: '#8A4505',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 4,
    zIndex: 100,
  },
  innerContainer: {
    width: '100%',
    maxWidth: 480,
    height: 68,
    alignSelf: 'center',
    paddingHorizontal: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  userProfileBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 4,
    borderRadius: 999,
    flex: 1,
    marginRight: 12,
  },
  userProfileBtnActive: {
    backgroundColor: '#FFF8F1',
  },
  avatarCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#FFF3E6',
    borderWidth: 2,
    borderColor: '#D96B08',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  avatarCircleActive: {
    shadowColor: '#D96B08',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
    elevation: 5,
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  userInfo: {
    flexDirection: 'column',
    flex: 1,
  },
  userGreeting: {
    fontSize: 12,
    fontFamily: 'PlusJakartaSans_500Medium',
    color: '#B8651B',
    lineHeight: 15,
  },
  userName: {
    fontSize: 16,
    fontFamily: 'PlusJakartaSans_700Bold',
    color: '#8A4505',
    lineHeight: 20,
  },
  homeButton: {
    height: 40,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: '#FFF3E6',
    borderWidth: 2,
    borderBottomWidth: 4,
    borderColor: '#D96B08',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    shadowColor: '#D96B08',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.16,
    shadowRadius: 5,
    elevation: 3,
  },
  homeButtonActive: {
    backgroundColor: '#D96B08',
    borderColor: '#B45304',
    shadowColor: '#D96B08',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.28,
    shadowRadius: 8,
    elevation: 5,
  },
  homeButtonText: {
    fontSize: 13,
    fontFamily: 'PlusJakartaSans_700Bold',
    color: '#8A4505',
  },
  homeButtonTextActive: {
    color: '#FFFFFF',
  },
});

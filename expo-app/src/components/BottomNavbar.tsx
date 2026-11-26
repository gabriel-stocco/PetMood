import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Line, Path, Rect } from 'react-native-svg';
import { AuthenticatedTab } from '../types';

interface BottomNavbarProps {
  activeTab: AuthenticatedTab;
  onSelectTab: (tab: AuthenticatedTab) => void;
}

interface NavTabConfig {
  key: Exclude<AuthenticatedTab, 'Home' | 'Configuracoes'>;
  label: string;
}

const NAV_TABS: NavTabConfig[] = [
  { key: 'Dicas', label: 'Dicas' },
  { key: 'AdicionarAnimal', label: 'Adicionar Animal' },
  { key: 'Eventos', label: 'Eventos' },
  { key: 'Vacinas', label: 'Vacinas' },
];

export const BottomNavbar: React.FC<BottomNavbarProps> = ({
  activeTab,
  onSelectTab,
}) => {
  const insets = useSafeAreaInsets();

  const renderIcon = (
    tabKey: NavTabConfig['key'],
    isActive: boolean
  ): React.ReactNode => {
    const strokeColor = isActive ? '#FFFFFF' : '#B8651B';

    switch (tabKey) {
      case 'Dicas':
        return (
          <Svg
            width={24}
            height={24}
            viewBox="0 0 24 24"
            fill="none"
            stroke={strokeColor}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <Path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5" />
            <Path d="M9 18h6" />
            <Path d="M10 22h4" />
          </Svg>
        );
      case 'AdicionarAnimal':
        return (
          <Svg
            width={24}
            height={24}
            viewBox="0 0 24 24"
            fill="none"
            stroke={strokeColor}
            strokeWidth={2.2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <Line x1="12" y1="5" x2="12" y2="19" />
            <Line x1="5" y1="12" x2="19" y2="12" />
          </Svg>
        );
      case 'Eventos':
        return (
          <Svg
            width={24}
            height={24}
            viewBox="0 0 24 24"
            fill="none"
            stroke={strokeColor}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <Rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
            <Line x1="16" y1="2" x2="16" y2="6" />
            <Line x1="8" y1="2" x2="8" y2="6" />
            <Line x1="3" y1="10" x2="21" y2="10" />
          </Svg>
        );
      case 'Vacinas':
        return (
          <Svg
            width={24}
            height={24}
            viewBox="0 0 24 24"
            fill="none"
            stroke={strokeColor}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <Path d="m18 2 4 4" />
            <Path d="m17 7 3-3" />
            <Path d="M19 9 8.7 19.3c-1 1-2.5 1-3.4 0l-.6-.6c-1-1-1-2.5 0-3.4L15 5" />
            <Path d="m9 11 4 4" />
            <Path d="m5 19-3 3" />
            <Path d="m14 4 6 6" />
          </Svg>
        );
    }
  };

  return (
    <View style={[styles.bottomWrapper, { paddingBottom: insets.bottom }]}>
      <View style={styles.navbarGrid}>
        {NAV_TABS.map((tab, index) => {
          const isActive = activeTab === tab.key;
          const nextTab = NAV_TABS[index + 1];
          const isNextActive = nextTab ? activeTab === nextTab.key : false;
          const showDivider =
            index < NAV_TABS.length - 1 && !isActive && !isNextActive;

          return (
            <TouchableOpacity
              key={tab.key}
              activeOpacity={0.85}
              onPress={() => onSelectTab(tab.key)}
              style={[styles.navItem, isActive && styles.navItemActive]}
              accessibilityRole="tab"
              accessibilityLabel={tab.label}
              accessibilityState={{ selected: isActive }}
            >
              {renderIcon(tab.key, isActive)}
              {showDivider && <View style={styles.divider} />}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  bottomWrapper: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#F0DFCE',
    shadowColor: '#8A4505',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 10,
    zIndex: 100,
  },
  navbarGrid: {
    flexDirection: 'row',
    width: '100%',
    maxWidth: 480,
    height: 68,
    alignSelf: 'center',
  },
  navItem: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  navItemActive: {
    backgroundColor: '#D96B08',
  },
  divider: {
    position: 'absolute',
    right: 0,
    top: 16,
    bottom: 16,
    width: 1,
    backgroundColor: '#EBD7C3',
  },
});

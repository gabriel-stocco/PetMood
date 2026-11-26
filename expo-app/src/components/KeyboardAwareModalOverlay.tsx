import React, { useCallback, useRef, useState } from 'react';
import {
  Keyboard,
  LayoutChangeEvent,
  Pressable,
  StyleProp,
  StyleSheet,
  useWindowDimensions,
  View,
  ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useKeyboardHeight } from '../hooks/useKeyboardHeight';

interface KeyboardAwareModalOverlayProps {
  children: React.ReactNode;
  cardStyle?: StyleProp<ViewStyle>;
  onBackdropPress?: () => void;
  backdropAccessibilityLabel?: string;
  overlayStyle?: StyleProp<ViewStyle>;
  maxHeightRatio?: number;
}

/**
 * Modal overlay that adapts cleanly to the on-screen keyboard on both iOS and
 * Android without double-shrinking when Android's Dialog window already
 * resizes itself (softwareKeyboardLayoutMode="resize").
 *
 * Applies an explicit numeric `maxHeight` directly to the modal card so Yoga
 * never resolves a percentage maxHeight against an auto-height parent.
 */
export const KeyboardAwareModalOverlay: React.FC<KeyboardAwareModalOverlayProps> = ({
  children,
  cardStyle,
  onBackdropPress,
  backdropAccessibilityLabel = 'Fechar pop-up',
  overlayStyle,
  maxHeightRatio = 0.9,
}) => {
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const keyboardHeight = useKeyboardHeight();
  const [containerHeight, setContainerHeight] = useState<number>(0);
  const fullHeightRef = useRef<number>(0);

  const handleLayout = useCallback(
    (event: LayoutChangeEvent) => {
      const nextHeight = Math.round(event.nativeEvent.layout.height);
      if (nextHeight <= 0) return;

      if (keyboardHeight === 0) {
        fullHeightRef.current = nextHeight;
      } else if (nextHeight > fullHeightRef.current) {
        fullHeightRef.current = nextHeight;
      }

      setContainerHeight((prev) => (prev === nextHeight ? prev : nextHeight));
    },
    [keyboardHeight]
  );

  const isKeyboardOpen = keyboardHeight > 0;
  const topPadding = Math.max(16, insets.top + 8);
  const baseBottomPadding = Math.max(16, insets.bottom + 8);

  const effectiveContainerHeight =
    containerHeight > 0 ? containerHeight : windowHeight;
  const baselineHeight =
    fullHeightRef.current > 0
      ? fullHeightRef.current
      : Math.max(effectiveContainerHeight, windowHeight);

  const alreadyShrunkBy = isKeyboardOpen
    ? Math.max(0, baselineHeight - effectiveContainerHeight)
    : 0;
  const remainingKeyboardInset = isKeyboardOpen
    ? Math.max(0, keyboardHeight - alreadyShrunkBy)
    : 0;

  const bottomPadding = isKeyboardOpen
    ? remainingKeyboardInset > 0
      ? remainingKeyboardInset + 12
      : 12
    : baseBottomPadding;

  const availableHeight = Math.max(
    180,
    effectiveContainerHeight - topPadding - bottomPadding
  );
  const cardMaxHeight = isKeyboardOpen
    ? availableHeight
    : Math.max(220, Math.floor(availableHeight * maxHeightRatio));

  return (
    <View
      onLayout={handleLayout}
      style={[
        styles.overlay,
        overlayStyle,
        {
          paddingTop: topPadding,
          paddingBottom: bottomPadding,
          paddingHorizontal: 16,
        },
      ]}
    >
      {onBackdropPress ? (
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={() => {
            Keyboard.dismiss();
            onBackdropPress();
          }}
          accessibilityLabel={backdropAccessibilityLabel}
        />
      ) : null}
      <View
        style={[
          cardStyle,
          {
            maxHeight: cardMaxHeight,
            flexShrink: 1,
          },
        ]}
      >
        {children}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(40, 20, 2, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
  },
});

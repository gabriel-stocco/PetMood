import React, { ComponentRef, forwardRef, useMemo, useState } from 'react';
import {
  LayoutChangeEvent,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  ScrollView,
  ScrollViewProps,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';
import { useKeyboardHeight } from '../hooks/useKeyboardHeight';

interface CustomScrollViewProps extends ScrollViewProps {
  containerStyle?: StyleProp<ViewStyle>;
  shrink?: boolean;
  trackTopOffset?: number;
  trackBottomOffset?: number;
  adjustForKeyboard?: boolean;
  children?: React.ReactNode;
}

const MIN_THUMB_HEIGHT = 32;

export type CustomScrollViewRef = ComponentRef<typeof ScrollView>;

export const CustomScrollView = forwardRef<CustomScrollViewRef, CustomScrollViewProps>(
  (
    {
      children,
      containerStyle,
      shrink = false,
      trackTopOffset = 6,
      trackBottomOffset = 6,
      adjustForKeyboard,
      style,
      contentContainerStyle,
      keyboardShouldPersistTaps = 'handled',
      nestedScrollEnabled = true,
      onLayout,
      onContentSizeChange,
      onScroll,
      scrollEventThrottle = 16,
      ...rest
    },
    ref
  ) => {
    const [viewportHeight, setViewportHeight] = useState(0);
    const [contentHeight, setContentHeight] = useState(0);
    const [scrollY, setScrollY] = useState(0);
    const keyboardHeight = useKeyboardHeight();

    const shouldPadKeyboard = adjustForKeyboard ?? !shrink;

    const mergedContentContainerStyle = useMemo(() => {
      if (!shouldPadKeyboard || keyboardHeight <= 0) {
        return contentContainerStyle;
      }
      const flat = StyleSheet.flatten(contentContainerStyle) || {};
      const baseBottom =
        typeof flat.paddingBottom === 'number'
          ? flat.paddingBottom
          : typeof flat.paddingVertical === 'number'
          ? flat.paddingVertical
          : typeof flat.padding === 'number'
          ? flat.padding
          : 0;
      const extraBottom = Platform.OS === 'android' ? keyboardHeight + 48 : 32;
      return [
        contentContainerStyle,
        { paddingBottom: Math.max(baseBottom, baseBottom + extraBottom) },
      ];
    }, [contentContainerStyle, keyboardHeight, shouldPadKeyboard]);

    const handleLayout = (event: LayoutChangeEvent) => {
      setViewportHeight(event.nativeEvent.layout.height);
      onLayout?.(event);
    };

    const handleContentSizeChange = (width: number, height: number) => {
      setContentHeight(height);
      onContentSizeChange?.(width, height);
    };

    const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      setScrollY(event.nativeEvent.contentOffset.y);
      onScroll?.(event);
    };

    const maxScroll = Math.max(0, contentHeight - viewportHeight);
    const showScrollbar =
      viewportHeight > 24 && contentHeight > viewportHeight + 2 && maxScroll > 2;

    const trackHeight = Math.max(
      40,
      viewportHeight - trackTopOffset - trackBottomOffset
    );
    const ratio = contentHeight > 0 ? viewportHeight / contentHeight : 1;
    const thumbHeight = Math.max(
      MIN_THUMB_HEIGHT,
      Math.min(trackHeight, Math.round(trackHeight * ratio))
    );
    const usableTrack = Math.max(1, trackHeight - thumbHeight);
    const clampedScrollY = Math.max(0, Math.min(maxScroll, scrollY));
    const thumbTop =
      maxScroll > 0 ? Math.round((clampedScrollY / maxScroll) * usableTrack) : 0;

    return (
      <View
        style={[
          shrink ? styles.wrapperShrink : styles.wrapperFlex,
          containerStyle,
        ]}
      >
        <ScrollView
          {...rest}
          ref={ref}
          style={[shrink ? styles.scrollShrink : styles.scrollFlex, style]}
          contentContainerStyle={mergedContentContainerStyle}
          keyboardShouldPersistTaps={keyboardShouldPersistTaps}
          nestedScrollEnabled={nestedScrollEnabled}
          automaticallyAdjustKeyboardInsets={
            Platform.OS === 'ios' && shouldPadKeyboard
          }
          showsVerticalScrollIndicator={false}
          showsHorizontalScrollIndicator={false}
          scrollEventThrottle={scrollEventThrottle}
          onLayout={handleLayout}
          onContentSizeChange={handleContentSizeChange}
          onScroll={handleScroll}
        >
          {children}
        </ScrollView>

        {showScrollbar ? (
          <View
            pointerEvents="none"
            style={[
              styles.track,
              {
                top: trackTopOffset,
                bottom: trackBottomOffset,
              },
            ]}
          >
            <View
              style={[
                styles.thumb,
                {
                  height: thumbHeight,
                  transform: [{ translateY: thumbTop }],
                },
              ]}
            />
          </View>
        ) : null}
      </View>
    );
  }
);

CustomScrollView.displayName = 'CustomScrollView';

const styles = StyleSheet.create({
  wrapperFlex: {
    flex: 1,
    position: 'relative',
  },
  wrapperShrink: {
    flexGrow: 0,
    flexShrink: 1,
    minHeight: 0,
    position: 'relative',
  },
  scrollFlex: {
    flex: 1,
  },
  scrollShrink: {
    flexGrow: 0,
    flexShrink: 1,
  },
  track: {
    position: 'absolute',
    right: 3,
    width: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(240, 223, 206, 0.85)',
    overflow: 'hidden',
  },
  thumb: {
    width: '100%',
    borderRadius: 999,
    backgroundColor: '#D96B08',
  },
});

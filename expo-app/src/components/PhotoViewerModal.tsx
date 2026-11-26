import React from 'react';
import {
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export interface ActivePhotoViewer {
  src: string;
  title?: string;
}

interface PhotoViewerModalProps {
  photo: ActivePhotoViewer | null;
  onClose: () => void;
}

export const PhotoViewerModal: React.FC<PhotoViewerModalProps> = ({
  photo,
  onClose,
}) => {
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={Boolean(photo)}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View
        style={[
          styles.overlay,
          {
            paddingTop: Math.max(insets.top + 12, 24),
            paddingBottom: Math.max(insets.bottom + 16, 24),
          },
        ]}
      >
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityLabel="Fechar visualização da foto"
        />

        {/* Barra superior */}
        <View style={styles.topBar} pointerEvents="box-none">
          <Text style={styles.title} numberOfLines={1}>
            {photo?.title || 'Visualizar foto'}
          </Text>
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={onClose}
            style={styles.closeIconBtn}
            accessibilityRole="button"
            accessibilityLabel="Fechar foto"
          >
            <Text style={styles.closeIconText}>×</Text>
          </TouchableOpacity>
        </View>

        {/* Foto inteira sem cortes */}
        <View style={styles.imageContainer} pointerEvents="box-none">
          {photo?.src ? (
            <Image
              source={{ uri: photo.src }}
              style={styles.fullImage}
              resizeMode="contain"
              accessibilityLabel={photo.title || 'Foto em tela cheia'}
            />
          ) : null}
        </View>

        {/* Botão Fechar */}
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={onClose}
          style={styles.closeBtn}
          accessibilityRole="button"
          accessibilityLabel="Fechar imagem"
        >
          <Text style={styles.closeBtnText}>Fechar imagem</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(10, 8, 6, 0.94)',
    paddingHorizontal: 16,
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  topBar: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    zIndex: 2,
  },
  title: {
    flex: 1,
    fontSize: 15.5,
    fontFamily: 'PlusJakartaSans_700Bold',
    color: '#FFFFFF',
  },
  closeIconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.16)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeIconText: {
    fontSize: 26,
    color: '#FFFFFF',
    lineHeight: 28,
  },
  imageContainer: {
    flex: 1,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 14,
  },
  fullImage: {
    width: '100%',
    height: '100%',
  },
  closeBtn: {
    paddingHorizontal: 24,
    paddingVertical: 11,
    borderRadius: 999,
    backgroundColor: '#D96B08',
    zIndex: 2,
  },
  closeBtnText: {
    fontSize: 14,
    fontFamily: 'PlusJakartaSans_700Bold',
    color: '#FFFFFF',
  },
});

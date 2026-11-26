import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import Svg, { Circle, Path, Polyline, Rect } from 'react-native-svg';

const MAX_FOTO_CHARS = 300_000;

interface PhotoSourceModalProps {
  visible: boolean;
  title?: string;
  theme?: 'orange' | 'teal';
  aspect?: [number, number];
  defaultFileName?: string;
  onClose: () => void;
  onSelectPhoto: (dataUri: string, fileName: string) => void;
}

export const PhotoSourceModal: React.FC<PhotoSourceModalProps> = ({
  visible,
  title = 'Adicionar Foto',
  theme = 'orange',
  aspect,
  defaultFileName = 'foto.jpg',
  onClose,
  onSelectPhoto,
}) => {
  const [busy, setBusy] = useState(false);
  const isTeal = theme === 'teal';

  const processPickerResult = (result: ImagePicker.ImagePickerResult) => {
    if (result.canceled || !result.assets?.[0]) {
      return;
    }

    const asset = result.assets[0];
    if (asset.base64) {
      const mimeType = asset.mimeType || 'image/jpeg';
      const dataUri = `data:${mimeType};base64,${asset.base64}`;
      if (dataUri.length > MAX_FOTO_CHARS) {
        Alert.alert(
          'Imagem muito grande',
          'Escolha ou tire uma imagem menor para continuar.'
        );
        return;
      }
      onSelectPhoto(dataUri, asset.fileName || defaultFileName);
      onClose();
    } else if (asset.uri) {
      onSelectPhoto(asset.uri, asset.fileName || defaultFileName);
      onClose();
    }
  };

  const handleTakePhoto = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          'Permissão necessária',
          'Autorize o acesso à câmera nas configurações do aparelho para tirar uma foto agora.'
        );
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        ...(aspect ? { aspect } : {}),
        quality: 0.45,
        base64: true,
      });

      processPickerResult(result);
    } catch {
      Alert.alert(
        'Erro na câmera',
        'Não foi possível abrir a câmera do dispositivo.'
      );
    } finally {
      setBusy(false);
    }
  };

  const handleChooseFromGallery = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          'Permissão necessária',
          'Autorize o acesso à galeria para escolher uma imagem.'
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        ...(aspect ? { aspect } : {}),
        quality: 0.45,
        base64: true,
      });

      processPickerResult(result);
    } catch {
      Alert.alert(
        'Erro na galeria',
        'Não foi possível abrir a galeria de imagens.'
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={() => {
        if (!busy) onClose();
      }}
    >
      <View
        style={[
          styles.modalOverlay,
          isTeal ? styles.overlayTeal : styles.overlayOrange,
        ]}
      >
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={() => {
            if (!busy) onClose();
          }}
          accessibilityLabel="Fechar pop-up"
        />

        <View
          style={[
            styles.modalBox,
            isTeal ? styles.modalBoxTeal : styles.modalBoxOrange,
          ]}
        >
          <View
            style={[
              styles.modalHeader,
              isTeal ? styles.modalHeaderTeal : styles.modalHeaderOrange,
            ]}
          >
            <Text
              style={[
                styles.modalTitle,
                isTeal ? styles.titleTeal : styles.titleOrange,
              ]}
            >
              {title}
            </Text>
            <TouchableOpacity
              disabled={busy}
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Fechar"
            >
              <Text
                style={[
                  styles.modalClose,
                  isTeal ? styles.closeTeal : styles.closeOrange,
                ]}
              >
                ×
              </Text>
            </TouchableOpacity>
          </View>

          <Text
            style={[
              styles.subtitle,
              isTeal ? styles.subtitleTeal : styles.subtitleOrange,
            ]}
          >
            Como você deseja adicionar a foto?
          </Text>

          {busy ? (
            <View style={styles.busyBox}>
              <ActivityIndicator
                size="large"
                color={isTeal ? '#089C83' : '#D96B08'}
              />
              <Text
                style={[
                  styles.busyText,
                  isTeal ? styles.subtitleTeal : styles.subtitleOrange,
                ]}
              >
                Processando imagem...
              </Text>
            </View>
          ) : (
            <View style={styles.optionsList}>
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={handleTakePhoto}
                style={[
                  styles.optionCard,
                  isTeal ? styles.optionCardTeal : styles.optionCardOrange,
                ]}
                accessibilityRole="button"
                accessibilityLabel="Tirar foto agora"
              >
                <View
                  style={[
                    styles.optionIconBox,
                    isTeal ? styles.iconBoxTeal : styles.iconBoxOrange,
                  ]}
                >
                  <Svg
                    width={22}
                    height={22}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#FFFFFF"
                    strokeWidth={2.1}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <Path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                    <Circle cx="12" cy="13" r="4" />
                  </Svg>
                </View>
                <View style={styles.optionTextWrap}>
                  <Text
                    style={[
                      styles.optionTitle,
                      isTeal ? styles.titleTeal : styles.titleOrange,
                    ]}
                  >
                    Tirar foto agora
                  </Text>
                  <Text
                    style={[
                      styles.optionSub,
                      isTeal ? styles.subtitleTeal : styles.subtitleOrange,
                    ]}
                  >
                    Usar a câmera do dispositivo
                  </Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={0.85}
                onPress={handleChooseFromGallery}
                style={[
                  styles.optionCard,
                  isTeal ? styles.optionCardTeal : styles.optionCardOrange,
                ]}
                accessibilityRole="button"
                accessibilityLabel="Escolher da galeria"
              >
                <View
                  style={[
                    styles.optionIconBox,
                    isTeal ? styles.iconBoxTeal : styles.iconBoxOrange,
                  ]}
                >
                  <Svg
                    width={22}
                    height={22}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#FFFFFF"
                    strokeWidth={2.1}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <Rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                    <Circle cx="8.5" cy="8.5" r="1.5" />
                    <Polyline points="21 15 16 10 5 21" />
                  </Svg>
                </View>
                <View style={styles.optionTextWrap}>
                  <Text
                    style={[
                      styles.optionTitle,
                      isTeal ? styles.titleTeal : styles.titleOrange,
                    ]}
                  >
                    Escolher da galeria
                  </Text>
                  <Text
                    style={[
                      styles.optionSub,
                      isTeal ? styles.subtitleTeal : styles.subtitleOrange,
                    ]}
                  >
                    Selecionar uma imagem já salva
                  </Text>
                </View>
              </TouchableOpacity>
            </View>
          )}

          <TouchableOpacity
            activeOpacity={0.85}
            disabled={busy}
            onPress={onClose}
            style={[
              styles.cancelBtn,
              isTeal ? styles.cancelBtnTeal : styles.cancelBtnOrange,
            ]}
          >
            <Text
              style={[
                styles.cancelBtnText,
                isTeal ? styles.titleTeal : styles.titleOrange,
              ]}
            >
              Cancelar
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  overlayOrange: {
    backgroundColor: 'rgba(40, 20, 2, 0.45)',
  },
  overlayTeal: {
    backgroundColor: 'rgba(9, 69, 58, 0.45)',
  },
  modalBox: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1,
    padding: 20,
    gap: 12,
  },
  modalBoxOrange: {
    borderColor: '#F0DFCE',
  },
  modalBoxTeal: {
    borderColor: '#C6E5DF',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 10,
    borderBottomWidth: 1,
  },
  modalHeaderOrange: {
    borderBottomColor: '#F0DFCE',
  },
  modalHeaderTeal: {
    borderBottomColor: '#E3F3EF',
  },
  modalTitle: {
    fontSize: 16.5,
    fontFamily: 'PlusJakartaSans_700Bold',
  },
  titleOrange: {
    color: '#8A4505',
  },
  titleTeal: {
    color: '#0D5C4E',
  },
  modalClose: {
    fontSize: 24,
    lineHeight: 26,
    paddingHorizontal: 4,
  },
  closeOrange: {
    color: '#B8651B',
  },
  closeTeal: {
    color: '#168572',
  },
  subtitle: {
    fontSize: 13,
    fontFamily: 'PlusJakartaSans_400Regular',
  },
  subtitleOrange: {
    color: '#B8651B',
  },
  subtitleTeal: {
    color: '#168572',
  },
  optionsList: {
    gap: 10,
  },
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1.5,
  },
  optionCardOrange: {
    backgroundColor: '#FFF8F1',
    borderColor: '#EBD7C3',
  },
  optionCardTeal: {
    backgroundColor: '#F0F9F7',
    borderColor: '#A6DCD2',
  },
  optionIconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconBoxOrange: {
    backgroundColor: '#D96B08',
  },
  iconBoxTeal: {
    backgroundColor: '#089C83',
  },
  optionTextWrap: {
    flex: 1,
    gap: 2,
  },
  optionTitle: {
    fontSize: 14.5,
    fontFamily: 'PlusJakartaSans_700Bold',
  },
  optionSub: {
    fontSize: 12,
    fontFamily: 'PlusJakartaSans_400Regular',
  },
  busyBox: {
    paddingVertical: 24,
    alignItems: 'center',
    gap: 10,
  },
  busyText: {
    fontSize: 13,
    fontFamily: 'PlusJakartaSans_500Medium',
  },
  cancelBtn: {
    marginTop: 2,
    height: 42,
    borderRadius: 999,
    borderWidth: 1.5,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelBtnOrange: {
    borderColor: '#EBD7C3',
  },
  cancelBtnTeal: {
    borderColor: '#C6E5DF',
  },
  cancelBtnText: {
    fontSize: 13.5,
    fontFamily: 'PlusJakartaSans_700Bold',
  },
});

import { Platform } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Animal, Evento } from '../types';
import { buildAnimalPdfHtml } from './animalPdfHtml';

export { buildAnimalPdfHtml, getAnimalEvents, getAnimalVaccines } from './animalPdfHtml';

export async function exportAnimalPdf(
  pet: Animal,
  eventos: Evento[]
): Promise<{ uri?: string; shared: boolean }> {
  const html = buildAnimalPdfHtml(pet, eventos);
  if (Platform.OS === 'web') {
    await Print.printAsync({ html });
    return { shared: false };
  }

  const { uri } = await Print.printToFileAsync({ html });
  const canShare = await Sharing.isAvailableAsync();
  if (canShare) {
    await Sharing.shareAsync(uri, {
      mimeType: 'application/pdf',
      UTI: 'com.adobe.pdf',
      dialogTitle: `Ficha de ${pet.nome}`,
    });
    return { uri, shared: true };
  }
  return { uri, shared: false };
}

import * as Clipboard from 'expo-clipboard';

/**
 * Put text on the clipboard: a table's code or its invitation, to paste into
 * WhatsApp, Viber or Messenger. False when the platform refuses (a browser
 * that has not been given the permission), so the caller says nothing then.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    return await Clipboard.setStringAsync(text);
  } catch {
    return false;
  }
}

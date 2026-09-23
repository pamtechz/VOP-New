import QRCode from 'qrcode';

export async function generateQrDataUrl(value: string, size = 240): Promise<string> {
  const text = String(value || '').trim();
  if (!text) throw new Error('A QR value is required.');
  return QRCode.toDataURL(text, {
    width: size,
    margin: 1,
    errorCorrectionLevel: 'H',
  });
}

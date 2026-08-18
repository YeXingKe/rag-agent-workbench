export function cleanText(text: string): string {
  let normalizedText = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  normalizedText = normalizedText.replace(/\n{3,}/g, '\n\n');
  normalizedText = normalizedText.replace(/[ \t]{2,}/g, ' ');
  return normalizedText;
}

export function estimateTokenCount(text: string): number {
  const cleanedText = cleanText(text);
  if (!cleanedText) {
    return 0;
  }
  return Math.max(1, Math.ceil(cleanedText.length / 4));
}

export function normalizePlate(input: string): string {
  return input.replace(/\s+/g, "").toUpperCase();
}

export function formatPlate(input: string): string {
  const n = normalizePlate(input);
  const letters = n.match(/^[A-ZÆØÅ]+/)?.[0] ?? "";
  const rest = n.slice(letters.length);
  if (!rest) return letters;
  if (rest.length >= 5) {
    return `${letters} ${rest.slice(0, 2)} ${rest.slice(2)}`;
  }
  if (rest.length > 2) {
    return `${letters} ${rest.slice(0, 2)} ${rest.slice(2)}`;
  }
  return `${letters} ${rest}`;
}

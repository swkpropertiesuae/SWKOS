/** Hides contact details and company money totals from text shown to staff. */
export function redactForStaff(text: string): string {
  return String(text ?? '')
    .replace(/[\w.%+-]+@[\w-]+(?:\.[\w-]+)+/g, '[email hidden]')
    .replace(/(?:\+|\b00)\d[\d\s-]{7,16}\d|\b05\d[\s-]?\d{3}[\s-]?\d{4}\b/g, '[number hidden]')
    .replace(/AED\s?\d[\d,.]*\s?(?:M|Mn|million|B|bn)\b|AED\s?\d{1,3}(?:,\d{3}){2,}(?:\.\d+)?/gi, 'AED [hidden]')
}

export const LATVIAN_DAYS = [
  'svētdiena',
  'pirmdiena',
  'otrdiena',
  'trešdiena',
  'ceturtdiena',
  'piektdiena',
  'sestdiena'
] as const;

export async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function formatBytes(bytes: number): string {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

export function getSchoolShortName(schoolName?: string): string {
  if (!schoolName) return '';
  if (schoolName.includes('40.')) return 'Rīgas 40. vsk.';
  if (schoolName.includes('ASSOR')) return 'ASSOR';
  return schoolName;
}

export function escapeHtml(str?: string): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function linkify(text: string): string {
  const escaped = escapeHtml(text);
  return escaped.replace(
    /(https?:\/\/[^\s]+)/g,
    '<a href="$1" target="_blank" rel="noopener noreferrer" class="link">$1</a>'
  );
}

export function getTodayDateString(d: Date = new Date()): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Remove trailing "Rādīt vairāk", "Rādīt mazāk", and any trailing attachment filename that leaked from DOM
 */
export function cleanHomeworkText(text?: string, attachmentNames: string[] = []): string {
  if (!text) return '';
  let cleaned = text.trim();

  // Strip known attachment names if they were concatenated to the end of homework text
  for (const name of attachmentNames) {
    if (name && cleaned.endsWith(name)) {
      cleaned = cleaned.slice(0, -name.length).trim();
    }
  }

  // Strip trailing "Rādīt vairāk", "... Rādīt vairāk", or "Rādīt mazāk"
  cleaned = cleaned
    .replace(/\s*(\.\.\.\s*)?Rādīt vairāk\s*$/i, '')
    .replace(/\s*Rādīt mazāk\s*$/i, '')
    .trim();

  return cleaned;
}


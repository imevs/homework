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

export function decodeCommonEntities(str?: string): string {
  if (!str) return '';
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

export function hasHtmlTags(str: string): boolean {
  return /<[a-z][\s\S]*>/i.test(str);
}

/**
 * Linkifies bare URLs in text or HTML without modifying existing <a> tags or attributes
 */
export function linkifyHtml(html: string): string {
  const parts = html.split(/(<[^>]+>)/g);
  let insideAnchor = false;
  return parts
    .map((part) => {
      if (part.startsWith('<')) {
        if (/^<a\b/i.test(part)) {
          insideAnchor = true;
          let tag = part;
          if (!/target=/i.test(tag)) {
            tag = tag.replace(/^<a\b/i, '<a target="_blank"');
          }
          if (!/rel=/i.test(tag)) {
            tag = tag.replace(/^<a\b/i, '<a rel="noopener noreferrer"');
          }
          if (!/class=/i.test(tag)) {
            tag = tag.replace(/^<a\b/i, '<a class="link"');
          }
          return tag;
        }
        if (/^<\/a>/i.test(part)) {
          insideAnchor = false;
          return part;
        }
        return part;
      }
      if (insideAnchor) return part;
      return part.replace(
        /(https?:\/\/[^\s<]+)/g,
        '<a href="$1" target="_blank" rel="noopener noreferrer" class="link">$1</a>'
      );
    })
    .join('');
}

/**
 * Backwards-compatible linkify for plain text
 */
export function linkify(text: string): string {
  return formatHomeworkHtml(text);
}

/**
 * Sanitize HTML while preserving safe formatting tags (p, br, strong, b, em, i, u, s, ul, ol, li, a, span)
 */
export function sanitizeAndFormatHtml(html: string): string {
  if (!html) return '';

  // Decode if common formatting tags were entity-encoded (e.g. &lt;p&gt;)
  let s = html.replace(
    /&lt;(\/?(?:p|br|strong|b|em|i|u|s|strike|ul|ol|li|a|span|div|blockquote)(?:\s+[^&>]*)?)&gt;/gi,
    '<$1>'
  );

  // Strip dangerous elements
  s = s.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  s = s.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');
  s = s.replace(/<(?:iframe|object|embed|form|input|button|meta|link)\b[^>]*>/gi, '');

  // Strip dangerous attributes (inline event handlers and javascript: URLs)
  s = s.replace(/\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '');
  s = s.replace(/href\s*=\s*["']?javascript:[^"'>]*["']?/gi, 'href="#"');

  // Linkify bare URLs outside existing <a> tags
  s = linkifyHtml(s);

  return s.trim();
}

/**
 * Format homework content for HTML presentation:
 * - If text contains HTML tags (or encoded formatting tags), sanitize and render as rich HTML
 * - If text is plain text, escape HTML, preserve line breaks (<br>), and linkify URLs
 */
export function formatHomeworkHtml(text?: string): string {
  if (!text) return '';
  const decodedCheck = text.replace(
    /&lt;(\/?(?:p|br|strong|b|em|i|u|s|strike|ul|ol|li|a|span|div)(?:\s+[^&>]*)?)&gt;/gi,
    '<$1>'
  );
  if (hasHtmlTags(decodedCheck)) {
    return sanitizeAndFormatHtml(text);
  }

  // Plain text: escape HTML, turn newlines into <br>, and linkify URLs
  const escaped = escapeHtml(text);
  const withBreaks = escaped.replace(/\r?\n/g, '<br>');
  return withBreaks.replace(
    /(https?:\/\/[^\s<]+)/g,
    '<a href="$1" target="_blank" rel="noopener noreferrer" class="link">$1</a>'
  );
}

/**
 * Convert homework content to clean Markdown with preserved line breaks
 */
export function homeworkToMarkdown(text?: string): string {
  if (!text) return '';
  let s = text.replace(
    /&lt;(\/?(?:p|br|strong|b|em|i|u|s|strike|ul|ol|li|a|span|div)(?:\s+[^&>]*)?)&gt;/gi,
    '<$1>'
  );

  if (hasHtmlTags(s)) {
    s = s.replace(/<a\b[^>]*href=["']([^"'>]+)["'][^>]*>(.*?)<\/a>/gi, '[$2]($1)');
    s = s.replace(/<(?:strong|b)\b[^>]*>(.*?)<\/(?:strong|b)>/gi, '**$1**');
    s = s.replace(/<(?:em|i)\b[^>]*>(.*?)<\/(?:em|i)>/gi, '*$1*');
    s = s.replace(/<br\s*\/?>/gi, '___BR___');
    s = s.replace(/<\/p>/gi, '___BR___');
    s = s.replace(/<\/div>/gi, '___BR___');
    s = s.replace(/<li\b[^>]*>(.*?)<\/li>/gi, '• $1___BR___');
    s = s.replace(/<[^>]+>/g, '');
    s = decodeCommonEntities(s);
    s = s.replace(/___BR___/g, '<br>');
    s = s.replace(/\r?\n/g, '<br>');
    s = s.replace(/(?:<br>\s*){3,}/gi, '<br><br>');
    s = s.replace(/^(?:<br>\s*)+|(?:<br>\s*)+$/gi, '');
    return s.trim();
  }

  // Plain text: escape and turn newlines into <br> to preserve checklist line formatting
  return escapeHtml(text).replace(/\r?\n/g, '<br>').trim();
}

/**
 * Convert homework content to clean plain text for terminal output
 */
export function homeworkToPlainText(text?: string): string {
  if (!text) return '';
  let s = text.replace(
    /&lt;(\/?(?:p|br|strong|b|em|i|u|s|strike|ul|ol|li|a|span|div)(?:\s+[^&>]*)?)&gt;/gi,
    '<$1>'
  );
  s = s.replace(/<br\s*\/?>/gi, '\n');
  s = s.replace(/<\/p>/gi, '\n');
  s = s.replace(/<\/div>/gi, '\n');
  s = s.replace(/<li\b[^>]*>(.*?)<\/li>/gi, '• $1\n');
  s = s.replace(/<[^>]+>/g, '');
  s = decodeCommonEntities(s);
  return s
    .replace(/\r/g, '')
    .split('\n')
    .map((l) => l.trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function getTodayDateString(d: Date = new Date()): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Remove trailing "Rādīt vairāk", "Rādīt mazāk", "Pielikumi (N)", and trailing attachment filenames
 */
export function cleanHomeworkText(text?: string, attachmentNames: string[] = []): string {
  if (!text) return '';
  let cleaned = text.trim();
  let prev = '';

      // Loop until no more trailing UI noise or filenames remain (handles nested artifacts)
      while (prev !== cleaned) {
        prev = cleaned;

        // Strip known attachment names if they were concatenated to the end of homework text
        for (const name of attachmentNames) {
          if (name && cleaned.endsWith(name)) {
            cleaned = cleaned.slice(0, -name.length).trim();
          }
        }

        // Strip trailing "Rādīt vairāk", "... Rādīt vairāk", "Rādīt mazāk", "Pielikumi (N)", etc.
        cleaned = cleaned
          .replace(/\s*(\.\.\.\s*)?Rādīt vairāk\s*$/i, '')
          .replace(/\s*Rādīt mazāk\s*$/i, '')
          .replace(/\s*(Pielikumi\s*(\(\d+\))?|Pielikumi:?|Pielikums:?|Pielikumā)\s*$/i, '')
          .replace(/(?:<br\s*\/?>|\s|&nbsp;)+$/gi, '')
          .trim();
      }

      return cleaned;
    }

import type { ScrapeReport } from '../types.ts';
import { combineHomeworkByClass } from '../combiner.ts';
import { homeworkToMarkdown } from '../utils.ts';

/**
 * Generate a GitHub-flavored Markdown checklist grouped by combined class
 */
export function generateMarkdownReport(report: ScrapeReport): string {
  const classes = report.classes || combineHomeworkByClass(report.profiles || []);
  let md = `# 📚 E-Klase Mājasdarbi (Nākamajām dienām)\n\n`;
  md += `**Atjaunots:** ${new Date(report.scrapedAt).toLocaleString('lv-LV')}  \n`;
  md += `**Piezīme:** *Šodienas (${report.today}) mājasdarbi nav iekļauti.*\n\n`;
  md += `---\n\n`;

  for (const cls of classes) {
    const schoolsText = cls.schools && cls.schools.length > 0 ? `*Skolas: ${cls.schools.join(', ')}*\n\n` : '';
    md += `## 🏫 Klase ${cls.className}\n${schoolsText}`;

    if (cls.days.length === 0) {
      md += `*Nav ierakstu atlikušajām šīs nedēļas dienām.*\n\n`;
      continue;
    }

    for (const day of cls.days) {
      md += `### 📅 ${day.title}\n\n`;

      const hwLessons = day.lessons.filter((l) => l.homework);
      if (hwLessons.length === 0) {
        md += `*🎉 Šai dienai nav uzdotu mājasdarbu!*\n\n`;
      } else {
        for (const l of hwLessons) {
          const num = l.number ? `${l.number}. ` : '';
          const schoolTag = l.schoolShort ? ` \`[${l.schoolShort}]\`` : '';
          md += `- [ ] **${num}${l.subject}**${schoolTag}\n`;
          if (l.topic) {
            md += `  - 📖 *Tēma:* ${l.topic}\n`;
          }
          const formattedHw = homeworkToMarkdown(l.homework);
          md += `  - ✏️ *Uzdevums:* ${formattedHw}\n`;
          if (l.attachments && l.attachments.length > 0) {
            const attLinks = l.attachments
              .map((a) => `[${a.name} (${a.formattedSize})](${encodeURI(a.localPath || a.url)})`)
              .join(', ');
            md += `  - 📎 *Pielikumi:* ${attLinks}\n`;
          }
        }
        md += `\n`;
      }
    }
    md += `---\n\n`;
  }

  return md;
}


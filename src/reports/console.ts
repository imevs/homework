import type { ScrapeReport } from '../types.ts';
import { combineHomeworkByClass } from '../combiner.ts';

/**
 * Format and print the collected homework to console grouped by class
 */
export function printHomeworkReport(report: ScrapeReport): void {
  const classes = report.classes || combineHomeworkByClass(report.profiles || []);

  console.log('\n========================================================================');
  console.log('📋 E-KLASE MĀJASDARBI PA KLAŠU GRUPĀM (BEZ ŠODIENAS)');
  console.log('========================================================================');

  let totalTasks = 0;

  for (const cls of classes) {
    const schools = (cls.schools || []).join(', ');
    console.log(`\n🏫 KLASE ${cls.className} (${schools})`);
    console.log('------------------------------------------------------------------------');

    if (!cls.days || cls.days.length === 0) {
      console.log('   (Nav ierakstu atlikušajām šīs nedēļas dienām)');
      continue;
    }

    for (const day of cls.days) {
      const hwLessons = day.lessons.filter((l) => l.homework);
      if (hwLessons.length === 0) {
        console.log(`\n  📅 ${day.title} -> 🎉 Nav uzdotu mājasdarbu`);
        continue;
      }

      console.log(`\n  📅 ${day.title} (${hwLessons.length} uzd.)`);
      for (const l of hwLessons) {
        totalTasks++;
        const num = l.number ? `${l.number}. ` : '';
        const schoolTag = l.schoolShort ? `[${l.schoolShort}] ` : '';
        console.log(`     📚 ${schoolTag}${num}${l.subject}`);
        if (l.topic) {
          console.log(`        📖 Tēma:        ${l.topic}`);
        }
        console.log(`        ✏️  MĀJASDARBS:  ${l.homework}`);
        if (l.attachments && l.attachments.length > 0) {
          for (const a of l.attachments) {
            console.log(`        📎  Pielikums:   ${a.name} (${a.formattedSize})`);
            console.log(`                         ${a.localPath || a.url}`);
          }
        }
      }
    }
  }

  console.log('\n========================================================================');
  console.log(`✨ Total homework assignments across all classes: ${totalTasks}`);
  console.log('========================================================================\n');
}


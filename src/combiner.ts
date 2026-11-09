import type { ProfileReport, ClassReport, DayEntry, Lesson } from './types.ts';
import { getSchoolShortName, cleanHomeworkText } from './utils.ts';

/**
 * Combine scraped homework across multiple schools into unified classes (e.g. 4.c and 1.a)
 */
export function combineHomeworkByClass(profiles: ProfileReport[]): ClassReport[] {
  const classOrder = ['4.c', '1.a'];
  const classMap = new Map<
    string,
    {
      className: string;
      student: string;
      schools: Set<string>;
      daysMap: Map<string, DayEntry>;
    }
  >();

  for (const prof of profiles) {
    const cls = prof.className;
    if (!classMap.has(cls)) {
      classMap.set(cls, {
        className: cls,
        student: prof.student,
        schools: new Set<string>(),
        daysMap: new Map<string, DayEntry>()
      });
    }
    const classObj = classMap.get(cls)!;
    if (prof.student && prof.student !== 'Skolēns') {
      classObj.student = prof.student;
    }
    classObj.schools.add(prof.schoolName);

    for (const day of (prof.days || [])) {
      const dayDate = day.date ? day.date.slice(0, 10) : '';
      if (!classObj.daysMap.has(dayDate)) {
        classObj.daysMap.set(dayDate, {
          date: day.date,
          title: day.title,
          lessons: []
        });
      }
      const dayEntry = classObj.daysMap.get(dayDate)!;
      if (day.title && (!dayEntry.title || dayEntry.title.length < day.title.length)) {
        dayEntry.title = day.title;
      }
      for (const lesson of day.lessons) {
        const cleanedHw = cleanHomeworkText(
          lesson.homework,
          (lesson.attachments || []).map((a) => a.name)
        );
        dayEntry.lessons.push({
          ...lesson,
          homework: cleanedHw,
          hasHomework: Boolean(cleanedHw),
          schoolName: prof.schoolName,
          schoolShort: getSchoolShortName(prof.schoolName)
        });
      }
    }
  }

  const result: ClassReport[] = [];
  const sortedKeys = Array.from(classMap.keys()).sort((a, b) => {
    const idxA = classOrder.indexOf(a);
    const idxB = classOrder.indexOf(b);
    if (idxA !== -1 && idxB !== -1) return idxA - idxB;
    return a.localeCompare(b);
  });

  for (const cls of sortedKeys) {
    const obj = classMap.get(cls)!;
    const days = Array.from(obj.daysMap.values()).sort((a, b) => a.date.localeCompare(b.date));
    for (const day of days) {
      day.lessons.sort((a: Lesson, b: Lesson) => {
        const numA = parseInt(a.number, 10);
        const numB = parseInt(b.number, 10);
        const validA = !isNaN(numA);
        const validB = !isNaN(numB);
        if (validA && validB) return numA - numB;
        if (validA) return -1;
        if (validB) return 1;
        return (a.subject || '').localeCompare(b.subject || '');
      });
    }
    result.push({
      classId: 'class-' + cls.replace(/[^a-zA-Z0-9]/g, '_'),
      className: cls,
      student: obj.student,
      schools: Array.from(obj.schools),
      days
    });
  }

  return result;
}


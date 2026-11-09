import type { ScrapeReport } from '../types.ts';
import { combineHomeworkByClass } from '../combiner.ts';
import { escapeHtml, linkify } from '../utils.ts';

/**
 * Generate a modern, ultra-compact, responsive HTML report combined by class
 */
export function generateHtmlReport(report: ScrapeReport): string {
  const classes = report.classes || combineHomeworkByClass(report.profiles || []);

  let totalTasksAll = 0;
  for (const cls of classes) {
    for (const day of cls.days) {
      totalTasksAll += day.lessons.filter((l) => l.homework).length;
    }
  }

  // Navigation tabs (by class: 4.c, 1.a, and All)
  const tabButtonsHtml =
    classes
      .map((cls, idx) => {
        const count = cls.days.reduce(
          (acc, d) => acc + d.lessons.filter((l) => l.homework).length,
          0
        );
        return `
      <button class="tab-btn ${idx === 0 ? 'active' : ''}" data-target="${cls.classId}" onclick="switchClassTab('${cls.classId}', this)">
        <span class="tab-badge-class">${escapeHtml(cls.className)}</span>
        <span class="tab-count-pill">${count}</span>
      </button>`;
      })
      .join('') +
    `
    <button class="tab-btn" data-target="all" onclick="switchClassTab('all', this)">
      <span class="tab-badge-class">Visas</span>
      <span class="tab-count-pill">${totalTasksAll}</span>
    </button>`;

  // Tab contents
  const classesContentHtml = classes
    .map((cls, clsIdx) => {
      const daysHtml = cls.days
        .map((day, dayIdx) => {
          const hwLessons = day.lessons.filter((l) => l.homework);
          const hwCount = hwLessons.length;

          let lessonsHtml = '';
          if (hwCount === 0) {
            lessonsHtml = `
          <div class="empty-state">
            <span>🎉 Nav mājasdarbu</span>
          </div>`;
          } else {
            lessonsHtml = hwLessons
              .map((l, lessonIdx) => {
                const safeDate = (day.date || '').slice(0, 10).replace(/[^0-9]/g, '');
                const safeSubj = (l.subject || '').replace(/[^a-zA-Z0-9\u00C0-\u024F]/g, '_');
                const taskId = `task-${cls.classId}-${safeDate}-${l.number || lessonIdx}-${safeSubj}`;
                const numText = l.number ? `<span class="lesson-num">${escapeHtml(l.number)}.</span>` : '';
                const isAssor = (l.schoolShort || '').includes('ASSOR');
                const schoolTagHtml = l.schoolShort
                  ? `<span class="school-pill ${isAssor ? 'pill-assor' : 'pill-r40'}">${escapeHtml(l.schoolShort)}</span>`
                  : '';
                const topicHtml = l.topic
                  ? `<span class="topic-pill" title="${escapeHtml(l.topic)}">📖 ${escapeHtml(l.topic)}</span>`
                  : '';
                const homeworkHtml = linkify(l.homework);

                let attachmentsHtml = '';
                if (l.attachments && l.attachments.length > 0) {
                  const chips = l.attachments
                    .map(
                      (a) => `
              <a href="${escapeHtml(a.localPath || a.url)}" target="_blank" rel="noopener noreferrer" class="att-chip" title="Atvērt ${escapeHtml(a.name)}">
                <span class="att-icon">📎</span>
                <span class="att-name">${escapeHtml(a.name)}</span>
                <span class="att-size">(${escapeHtml(a.formattedSize)})</span>
              </a>
            `
                    )
                    .join('');
                  attachmentsHtml = `<div class="task-att-row">${chips}</div>`;
                }

                return `
            <div class="task-item" data-task-id="${taskId}">
              <div class="task-row-top">
                <label class="task-check-wrap">
                  <input type="checkbox" id="${taskId}" class="task-checkbox" onchange="toggleTask('${taskId}')">
                  <span class="task-check-box"></span>
                </label>
                <div class="task-heading">
                  ${numText}
                  <span class="task-subject">${escapeHtml(l.subject)}</span>
                  ${schoolTagHtml}
                  ${topicHtml}
                </div>
              </div>
              <div class="task-body">
                <div class="hw-text">${homeworkHtml}</div>
                ${attachmentsHtml}
              </div>
            </div>`;
              })
              .join('');
          }

          const cleanTitle = escapeHtml(day.title);

          return `
        <div class="day-card">
          <div class="day-header">
            <span class="day-title">${cleanTitle}</span>
            <span class="day-badge ${hwCount === 0 ? 'badge-zero' : ''}">${hwCount} uzd.</span>
          </div>
          <div class="day-body">
            ${lessonsHtml}
          </div>
        </div>`;
        })
        .join('');

      return `
      <section id="${cls.classId}" class="class-panel ${clsIdx === 0 ? 'active' : ''}">
        <div class="class-subbar">
          <span class="class-title">🎓 Klase <strong>${escapeHtml(cls.className)}</strong></span>
          <span class="class-schools">${escapeHtml(cls.schools.join(' • '))}</span>
        </div>
        <div class="days-grid">
          ${daysHtml}
        </div>
      </section>`;
    })
    .join('');

  return `<!DOCTYPE html>
<html lang="lv">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Mājasdarbi - E-Klase</title>
  <style>
    :root {
      --primary: #1e40af;
      --primary-light: #eff6ff;
      --accent: #2563eb;
      --success: #16a34a;
      --bg: #f8fafc;
      --card-bg: #ffffff;
      --border: #e2e8f0;
      --border-dark: #cbd5e1;
      --text: #0f172a;
      --text-muted: #64748b;
      --r40-bg: #eff6ff;
      --r40-text: #1d4ed8;
      --r40-border: #bfdbfe;
      --assor-bg: #fef3c7;
      --assor-text: #b45309;
      --assor-border: #fde68a;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background-color: var(--bg);
      color: var(--text);
      line-height: 1.4;
      padding: 10px 12px;
      font-size: 13.5px;
    }

    .container {
      max-width: 1200px;
      margin: 0 auto;
    }

    /* Compact Header Bar */
    .app-header {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 8px 14px;
      margin-bottom: 8px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 10px;
      box-shadow: 0 1px 2px rgba(0,0,0,0.04);
    }

    .header-left {
      display: flex;
      align-items: center;
      gap: 10px;
      flex-wrap: wrap;
    }

    h1 {
      font-size: 1.15rem;
      font-weight: 700;
      color: var(--text);
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .header-meta-pill {
      font-size: 0.76rem;
      background: #f1f5f9;
      color: var(--text-muted);
      padding: 2px 8px;
      border-radius: 999px;
      border: 1px solid var(--border);
      font-weight: 500;
    }

    .header-right {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .progress-box {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .progress-bar-wrap {
      width: 90px;
      height: 6px;
      background: #e2e8f0;
      border-radius: 999px;
      overflow: hidden;
    }

    .progress-bar-fill {
      height: 100%;
      background: var(--success);
      width: 0%;
      transition: width 0.25s ease;
    }

    .progress-text {
      font-size: 0.8rem;
      font-weight: 600;
      color: var(--text-muted);
      white-space: nowrap;
    }

    /* Tabs Bar */
    .tabs-bar {
      display: flex;
      gap: 6px;
      margin-bottom: 8px;
      flex-wrap: wrap;
    }

    .tab-btn {
      background: var(--card-bg);
      border: 1px solid var(--border-dark);
      border-radius: 6px;
      padding: 5px 12px;
      font-size: 0.84rem;
      font-weight: 500;
      color: var(--text);
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      transition: all 0.15s ease;
    }

    .tab-btn:hover {
      background: #f1f5f9;
      border-color: #94a3b8;
    }

    .tab-btn.active {
      background: var(--primary);
      border-color: var(--primary);
      color: #ffffff;
      font-weight: 600;
    }

    .tab-badge-class {
      font-weight: 700;
    }

    .tab-student-name {
      font-size: 0.8rem;
      opacity: 0.85;
    }

    .tab-count-pill {
      font-size: 0.72rem;
      padding: 1px 6px;
      border-radius: 999px;
      background: #e2e8f0;
      color: #334155;
      font-weight: 600;
    }

    .tab-btn.active .tab-count-pill {
      background: rgba(255, 255, 255, 0.25);
      color: #ffffff;
    }

    /* Class Panels */
    .class-panel {
      display: none;
      margin-bottom: 12px;
    }

    .class-panel.active {
      display: block;
    }

    .class-subbar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 4px 6px;
      margin-bottom: 6px;
      font-size: 0.8rem;
      color: var(--text-muted);
    }

    .class-title strong {
      color: var(--primary);
      font-size: 0.9rem;
    }

    /* Multi-column Grid for Days */
    .days-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(340px, 1fr));
      gap: 8px;
    }

    /* Day Card */
    .day-card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 8px;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      box-shadow: 0 1px 2px rgba(0,0,0,0.03);
    }

    .day-header {
      background: #f1f5f9;
      padding: 6px 10px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1px solid var(--border);
    }

    .day-title {
      font-weight: 600;
      font-size: 0.88rem;
      color: var(--text);
    }

    .day-badge {
      font-size: 0.72rem;
      font-weight: 600;
      padding: 1px 7px;
      border-radius: 999px;
      background: #e2e8f0;
      color: #334155;
    }

    .day-badge.badge-zero {
      background: #ecfdf5;
      color: #047857;
    }

    .day-body {
      padding: 6px;
      display: flex;
      flex-direction: column;
      gap: 6px;
      flex: 1;
    }

    /* Task Item */
    .task-item {
      background: #ffffff;
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 6px 8px;
      transition: background 0.12s ease, border-color 0.12s ease;
    }

    .task-item:hover {
      border-color: var(--border-dark);
      background: #fafafa;
    }

    .task-item.completed {
      background: #f8fafc;
      opacity: 0.5;
    }

    .task-item.completed .task-subject,
    .task-item.completed .hw-text {
      text-decoration: line-through;
      color: var(--text-muted);
    }

    .task-row-top {
      display: flex;
      align-items: flex-start;
      gap: 7px;
    }

    /* Checkbox */
    .task-check-wrap {
      position: relative;
      cursor: pointer;
      margin-top: 1px;
      user-select: none;
      flex-shrink: 0;
    }

    .task-check-wrap input {
      position: absolute;
      opacity: 0;
      cursor: pointer;
      height: 0;
      width: 0;
    }

    .task-check-box {
      display: inline-block;
      width: 17px;
      height: 17px;
      background-color: #fff;
      border: 1.5px solid #94a3b8;
      border-radius: 4px;
      transition: all 0.15s;
    }

    .task-check-wrap:hover input ~ .task-check-box {
      border-color: var(--accent);
    }

    .task-check-wrap input:checked ~ .task-check-box {
      background-color: var(--success);
      border-color: var(--success);
    }

    .task-check-wrap input:checked ~ .task-check-box:after {
      content: "";
      position: absolute;
      left: 6px;
      top: 3px;
      width: 4px;
      height: 8px;
      border: solid white;
      border-width: 0 2px 2px 0;
      transform: rotate(45deg);
    }

    .task-heading {
      flex: 1;
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 5px;
      min-width: 0;
    }

    .lesson-num {
      font-weight: 700;
      color: var(--text-muted);
      font-size: 0.85rem;
    }

    .task-subject {
      font-size: 0.92rem;
      font-weight: 700;
      color: var(--primary);
    }

    .school-pill {
      font-size: 0.68rem;
      font-weight: 600;
      padding: 1px 6px;
      border-radius: 4px;
      letter-spacing: 0.2px;
    }

    .pill-r40 {
      background: var(--r40-bg);
      color: var(--r40-text);
      border: 1px solid var(--r40-border);
    }

    .pill-assor {
      background: var(--assor-bg);
      color: var(--assor-text);
      border: 1px solid var(--assor-border);
    }

    .topic-pill {
      font-size: 0.72rem;
      background: #f1f5f9;
      color: #475569;
      padding: 1px 6px;
      border-radius: 4px;
      max-width: 220px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    /* Homework Body */
    .task-body {
      margin-top: 3px;
      padding-left: 24px;
    }

    .hw-text {
      background: #f8fafc;
      border-left: 2px solid #cbd5e1;
      padding: 4px 8px;
      border-radius: 0 4px 4px 0;
      font-size: 0.84rem;
      line-height: 1.35;
      white-space: pre-wrap;
      word-break: break-word;
      color: var(--text);
    }

    /* Attachments */
    .task-att-row {
      display: flex;
      flex-wrap: wrap;
      gap: 5px;
      margin-top: 4px;
    }

    .att-chip {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 3px 7px;
      background: #eff6ff;
      border: 1px solid #bfdbfe;
      border-radius: 4px;
      font-size: 0.75rem;
      color: #1e40af;
      text-decoration: none;
      transition: background 0.15s;
    }

    .att-chip:hover {
      background: #dbeafe;
      border-color: #93c5fd;
    }

    .att-icon { font-size: 0.8rem; }
    .att-name { font-weight: 500; max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .att-size { font-size: 0.7rem; color: #64748b; }

    .link {
      color: var(--accent);
      text-decoration: underline;
      word-break: break-all;
    }

    .empty-state {
      text-align: center;
      padding: 12px;
      color: var(--text-muted);
      font-size: 0.85rem;
    }

    footer {
      text-align: center;
      font-size: 0.75rem;
      color: var(--text-muted);
      margin-top: 12px;
      padding-bottom: 6px;
    }

    @media print {
      body { background: white; padding: 0; }
      .app-header, .tabs-bar, .class-subbar { display: none; }
      .class-panel { display: block !important; margin-bottom: 16px; page-break-after: always; }
      .days-grid { display: block; }
      .day-card { margin-bottom: 10px; page-break-inside: avoid; border-color: #ccc; box-shadow: none; }
    }
  </style>
</head>
<body>
  <div class="container">
    <header class="app-header">
      <div class="header-left">
        <h1>📚 E-Klase Mājasdarbi</h1>
        <span class="header-meta-pill">📅 Generated at (${escapeHtml(report.today)})</span>
        <span class="header-meta-pill">🕒 ${new Date(report.scrapedAt).toLocaleTimeString('lv-LV', { hour: '2-digit', minute: '2-digit' })}</span>
      </div>
      <div class="header-right">
        <div class="progress-box">
          <div class="progress-bar-wrap">
            <div id="progress-bar" class="progress-bar-fill"></div>
          </div>
          <span id="progress-count" class="progress-text">0 / ${totalTasksAll}</span>
        </div>
      </div>
    </header>

    <nav class="tabs-bar">
      ${tabButtonsHtml}
    </nav>

    <main>
      ${classesContentHtml}
    </main>

    <footer>
      <p>Automātiski ģenerēts no E-Klase dienasgrāmatas • ${new Date().toLocaleDateString('lv-LV')}</p>
    </footer>
  </div>

  <script>
    const STORAGE_KEY = 'eklase_tasks_completed_${report.today}';
    const TAB_KEY = 'eklase_active_tab';

    function switchClassTab(targetId, btn) {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      if (btn) btn.classList.add('active');

      if (targetId === 'all') {
        document.querySelectorAll('.class-panel').forEach(p => p.classList.add('active'));
      } else {
        document.querySelectorAll('.class-panel').forEach(p => {
          if (p.id === targetId) {
            p.classList.add('active');
          } else {
            p.classList.remove('active');
          }
        });
      }
      try {
        localStorage.setItem(TAB_KEY, targetId);
      } catch (e) {}
    }

    function loadSavedState() {
      // Restore active tab
      try {
        const savedTab = localStorage.getItem(TAB_KEY);
        if (savedTab) {
          const btn = document.querySelector('.tab-btn[data-target="' + savedTab + '"]');
          if (btn) switchClassTab(savedTab, btn);
        }
      } catch (e) {}

      // Restore checked tasks
      try {
        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
        saved.forEach(id => {
          const el = document.getElementById(id);
          if (el) {
            el.checked = true;
            const item = document.querySelector('[data-task-id="' + id + '"]');
            if (item) item.classList.add('completed');
          }
        });
      } catch (e) {}

      updateProgress();
    }

    function toggleTask(id) {
      const el = document.getElementById(id);
      const item = document.querySelector('[data-task-id="' + id + '"]');
      if (item) {
        if (el.checked) {
          item.classList.add('completed');
        } else {
          item.classList.remove('completed');
        }
      }

      const allChecked = Array.from(document.querySelectorAll('.task-checkbox:checked')).map(c => c.id);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(allChecked));
      } catch (e) {}

      updateProgress();
    }

    function updateProgress() {
      const all = document.querySelectorAll('.task-checkbox');
      const checked = document.querySelectorAll('.task-checkbox:checked');
      const total = all.length;
      const count = checked.length;
      const percent = total > 0 ? Math.round((count / total) * 100) : 0;

      const fill = document.getElementById('progress-bar');
      const text = document.getElementById('progress-count');

      if (fill) fill.style.width = percent + '%';
      if (text) text.innerText = count + ' / ' + total + ' (' + percent + '%)';
    }

    window.addEventListener('DOMContentLoaded', loadSavedState);
  </script>
</body>
</html>`;
}


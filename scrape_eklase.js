/**
 * E-Klase Playwright Multi-Profile Homework Scraper
 * 
 * Target profiles:
 * 1. 4.c, Rīgas 40. vidusskola
 * 2. 1.a, Rīgas 40. vidusskola
 * 3. 4.c, Aizgādņu biedrība ASSOR
 * 4. 1.a, Aizgādņu biedrība ASSOR
 * 
 * Rules:
 * - Excludes today's homework (saves homework strictly for days AFTER today)
 * - Already downloaded files are NOT re-downloaded (checked by path & size)
 * - Files are organized into folders relevant to the day of homework (e.g. attachments/2026-11-10_otrdiena/)
 * - Generates homework.json, homework.md, and interactive homework.html
 */

import { chromium } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

// Load .env if present
if (fs.existsSync('.env')) {
  const envContent = fs.readFileSync('.env', 'utf8');
  for (const line of envContent.split('\n')) {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
    if (match) {
      const key = match[1];
      let val = (match[2] || '').trim();
      val = val.replace(/^['"](.*)['"]$/, '$1');
      if (!process.env[key]) process.env[key] = val;
    }
  }
}

// Configuration
const CONFIG = {
  url: 'https://www.e-klase.lv',
  username: process.env.EKLASE_USER,
  password: process.env.EKLASE_PASSWORD,
  targetProfiles: [
    { className: '4.c', schoolName: 'Rīgas 40. vidusskola', label: '4.c, Rīgas 40. vidusskola' },
    { className: '1.a', schoolName: 'Rīgas 40. vidusskola', label: '1.a, Rīgas 40. vidusskola' },
    { className: '4.c', schoolName: 'Aizgādņu biedrība ASSOR', label: '4.c, Aizgādņu biedrība ASSOR' },
    { className: '1.a', schoolName: 'Aizgādņu biedrība ASSOR', label: '1.a, Aizgādņu biedrība ASSOR' },
  ],
  headless: process.env.HEADLESS !== 'false',
  timeout: 30000,
  outputJson: 'homework.json',
};

const LATVIAN_DAYS = ['svētdiena', 'pirmdiena', 'otrdiena', 'trešdiena', 'ceturtdiena', 'piektdiena', 'sestdiena'];

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

async function run() {
  console.log('========================================================');
  console.log('🚀 E-Klase Multi-Profile Homework Scraper');
  console.log(`👤 User:         ${CONFIG.username}`);
  console.log(`🎯 Profiles (${CONFIG.targetProfiles.length}):`);
  for (const p of CONFIG.targetProfiles) {
    console.log(`   - ${p.label}`);
  }
  console.log(`🖥️  Browser Mode: ${CONFIG.headless ? 'Headless' : 'Visible (Headed)'}`);
  console.log('========================================================\n');

  const browser = await chromium.launch({
    headless: CONFIG.headless,
    args: ['--disable-blink-features=AutomationControlled']
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: 'lv-LV',
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'
  });

  const page = await context.newPage();

  // Track auth headers across the session
  let authHeaders = {};
  page.on('request', (req) => {
    if (req.url().includes('family/api/')) {
      const h = req.headers();
      if (h.authorization) {
        authHeaders = {
          'authorization': h.authorization,
          'x-profile-id': h['x-profile-id'],
          'x-class-id': h['x-class-id']
        };
      }
    }
  });

  // Track the latest diary response
  let latestDiaryApiResponse = null;
  page.on('response', async (res) => {
    if (res.url().includes('family/api/diary')) {
      try {
        latestDiaryApiResponse = await res.json();
      } catch {
        // ignore
      }
    }
  });

  const attachmentsDir = path.resolve('attachments');
  if (!fs.existsSync(attachmentsDir)) {
    fs.mkdirSync(attachmentsDir, { recursive: true });
  }

  // Today's date YYYY-MM-DD
  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  console.log(`📆 Today's Date: ${todayStr} (Homework for today will NOT be saved)`);

  const allProfilesReports = [];

  try {
    // -------------------------------------------------------------------------
    // Step 1: Open e-klase.lv & Handle Cookies
    // -------------------------------------------------------------------------
    console.log(`🌐 1. Opening ${CONFIG.url}...`);
    await page.goto(CONFIG.url, { waitUntil: 'domcontentloaded', timeout: CONFIG.timeout });

    const cookieBtn = page.locator('#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll, button:has-text("Atļaut visu")').first();
    if (await cookieBtn.isVisible({ timeout: 4000 }).catch(() => false)) {
      console.log('🍪 Dismissing Cookiebot consent dialog...');
      await cookieBtn.click();
      await sleep(600);
    }

    // -------------------------------------------------------------------------
    // Step 2: Click on "Skolēns/Vecāks"
    // -------------------------------------------------------------------------
    console.log('🖱️  2. Clicking "Skolēns/Vecāks" button...');
    const studentParentBtn = page.locator('a[href*="family.e-klase.lv"]:visible, a:has-text("Skolēns/Vecāks"):visible').first();
    await studentParentBtn.waitFor({ state: 'visible', timeout: 8000 });
    await studentParentBtn.click();

    // -------------------------------------------------------------------------
    // Step 3: Authenticate (auth.e-klase.lv)
    // -------------------------------------------------------------------------
    console.log('🔑 3. Waiting for login form...');
    await page.waitForSelector('#username, input[name="username"], input[name="UserName"]', { timeout: 15000 });

    console.log('✍️  Filling credentials...');
    await page.locator('#username, input[name="username"], input[name="UserName"]').first().fill(CONFIG.username);
    await page.locator('#password, input[name="password"], input[name="Password"]').first().fill(CONFIG.password);

    console.log('🚀 Submitting credentials...');
    const submitBtn = page.locator('button:has-text("Pieslēgties"), button.btn--large, button[type="submit"]').first();
    await submitBtn.click();

    await page.waitForURL(/profile-selection|home/, { timeout: 20000 });
    console.log('✅ Successfully authenticated!');

    // -------------------------------------------------------------------------
    // Step 4: Loop through all target profiles
    // -------------------------------------------------------------------------
    for (let i = 0; i < CONFIG.targetProfiles.length; i++) {
      const target = CONFIG.targetProfiles[i];
      console.log(`\n--------------------------------------------------------`);
      console.log(`🎯 Profile [${i + 1}/${CONFIG.targetProfiles.length}]: ${target.label}`);
      console.log(`--------------------------------------------------------`);

      // Always navigate to profile selection to switch
      console.log('🔄 Navigating to profile-selection...');
      await page.goto('https://family.e-klase.lv/profile-selection', { waitUntil: 'domcontentloaded', timeout: CONFIG.timeout });
      await sleep(1500);

      // Locate card matching target class and school
      const profileCard = page.locator('div, a, button')
        .filter({ hasText: target.className })
        .filter({ hasText: target.schoolName })
        .last();

      if (!(await profileCard.isVisible({ timeout: 7000 }).catch(() => false))) {
        console.warn(`⚠️  Profile card not found on page for: ${target.label}. Skipping...`);
        continue;
      }

      // Extract student name from the card text
      let studentName = 'Skolēns';
      try {
        const cardParentText = await profileCard.evaluate((el) => {
          let cur = el;
          while (cur && cur.parentElement && cur.innerText.length < 300) {
            cur = cur.parentElement;
          }
          return cur ? cur.innerText : el.innerText;
        });
        const lines = cardParentText.split('\n').map(l => l.trim()).filter(Boolean);
        // Usually student name is the first non-empty line before class name
        for (let idx = 0; idx < lines.length; idx++) {
          if (lines[idx].includes(target.className) && lines[idx].includes(target.schoolName)) {
            if (idx > 0 && !lines[idx - 1].includes('202') && !lines[idx - 1].includes('skolēnu')) {
              studentName = lines[idx - 1];
            }
            break;
          }
        }
      } catch {
        // ignore
      }

      console.log(`👤 Student: ${studentName}`);
      console.log(`🖱️  Selecting profile: ${target.label}...`);
      latestDiaryApiResponse = null;
      await profileCard.click();

      await page.waitForURL(/home|diary/, { timeout: 15000 });
      await sleep(1000);

      // Navigate to Diary
      console.log('📅 Opening Diary ("Dienasgrāmata")...');
      await page.goto('https://family.e-klase.lv/diary', { waitUntil: 'domcontentloaded', timeout: CONFIG.timeout });
      await sleep(2500); // Allow API requests and Vue rendering to settle

      console.log(`📖 Diary loaded at: ${page.url()}`);

      // Parse diary API response
      const apiAttachmentsMap = new Map();
      if (Array.isArray(latestDiaryApiResponse)) {
        for (const day of latestDiaryApiResponse) {
          const dayDate = day.date ? day.date.slice(0, 10) : '';
          const dObj = new Date(dayDate + 'T00:00:00');
          const dayName = LATVIAN_DAYS[dObj.getDay()] || '';
          const dayFolderName = dayName ? `${dayDate}_${dayName}` : dayDate;

          for (const lesson of (day.lessons || [])) {
            const lessonNum = String(lesson.lessonNumber || '');
            const subjName = (lesson.classJournalName || '').trim().toLowerCase();
            const key = `${dayDate}_${lessonNum}_${subjName}`;
            const fallbackKey = `${dayDate}_${subjName}`;

            const attList = [];
            for (const ht of (lesson.homeTasks || [])) {
              for (const att of (ht.task?.attachments || [])) {
                attList.push({
                  id: att.id,
                  name: att.name,
                  dayDate,
                  dayFolderName,
                  sizeInBytes: att.sizeInBytes,
                  formattedSize: formatBytes(att.sizeInBytes),
                  url: `https://my.e-klase.lv/family/api/attachments/${att.id}`
                });
              }
            }
            for (const ls of (lesson.lessonSubjects || [])) {
              for (const att of (ls.value?.attachments || [])) {
                attList.push({
                  id: att.id,
                  name: att.name,
                  dayDate,
                  dayFolderName,
                  sizeInBytes: att.sizeInBytes,
                  formattedSize: formatBytes(att.sizeInBytes),
                  url: `https://my.e-klase.lv/family/api/attachments/${att.id}`
                });
              }
            }

            if (attList.length > 0) {
              apiAttachmentsMap.set(key, attList);
              if (!apiAttachmentsMap.has(fallbackKey)) {
                apiAttachmentsMap.set(fallbackKey, attList);
              }
            }
          }
        }
      }

      // Download attachments for this profile, skipping already downloaded files
      const downloadedMap = new Map();
      for (const [key, attList] of apiAttachmentsMap) {
        // Only process attachments for days strictly AFTER today
        for (const att of attList) {
          if (att.dayDate && att.dayDate <= todayStr) {
            continue; // Skip attachments from today or in the past
          }

          const targetDayFolder = path.join(attachmentsDir, att.dayFolderName || 'other');
          if (!fs.existsSync(targetDayFolder)) {
            fs.mkdirSync(targetDayFolder, { recursive: true });
          }

          const safeName = att.name.replace(/[\\/:*?"<>|]/g, '_');
          const localPath = path.join(targetDayFolder, safeName);
          const relativePath = path.posix.join('attachments', att.dayFolderName || 'other', safeName);

          // Check if file is already downloaded and non-empty
          if (fs.existsSync(localPath) && fs.statSync(localPath).size > 0) {
            console.log(`   ⏭️  [${att.dayFolderName}] Skipping (already downloaded): ${att.name}`);
            att.localPath = relativePath;
            downloadedMap.set(att.id, relativePath);
            continue;
          }

          if (!downloadedMap.has(att.id)) {
            try {
              console.log(`   ⬇️  [${att.dayFolderName}] Downloading: ${att.name} (${att.formattedSize})...`);
              const fileResp = await page.context().request.get(att.url, { headers: authHeaders });
              if (fileResp.status() === 200) {
                const buffer = await fileResp.body();
                fs.writeFileSync(localPath, buffer);
                att.localPath = relativePath;
                downloadedMap.set(att.id, relativePath);
                console.log(`      ✅ Saved to: ${relativePath}`);
              } else {
                console.warn(`      ⚠️  Download returned HTTP ${fileResp.status()}`);
              }
            } catch (dlErr) {
              console.warn(`      ⚠️  Failed to download ${att.name}: ${dlErr.message}`);
            }
          } else {
            att.localPath = downloadedMap.get(att.id);
          }
        }
      }

      // Parse diary entries from DOM
      const parsedDays = await page.evaluate(() => {
        const days = [];
        const clean = (s) => (s ? s.replace(/\s+/g, ' ').trim() : '');
        const dayContainers = Array.from(document.querySelectorAll('div[data-date]'));

        for (const dc of dayContainers) {
          const dateIso = dc.getAttribute('data-date') || '';
          const titleText = clean(dc.querySelector('p')?.innerText || '');

          const lessonRows = Array.from(dc.querySelectorAll('.col-span-5.grid, div.grid-cols-subgrid'));
          const lessons = [];

          for (const row of lessonRows) {
            const cells = Array.from(row.children);
            if (cells.length < 4) continue;

            const number = clean(cells[0]?.innerText || '');
            const subject = clean(cells[1]?.querySelector('.text-subhead-14')?.innerText || cells[1]?.innerText || '');
            const topic = clean(cells[2]?.innerText || '');
            const homework = clean(cells[3]?.innerText || '');
            const grades = clean(cells[4]?.innerText || '');

            if (subject || homework || topic) {
              lessons.push({
                number,
                subject,
                topic,
                homework,
                grades,
                hasHomework: Boolean(homework)
              });
            }
          }

          days.push({
            date: dateIso,
            title: titleText,
            lessons
          });
        }

        return days;
      });

      // Attach local file paths to lessons
      for (const day of parsedDays) {
        const dayDate = day.date ? day.date.slice(0, 10) : '';
        for (const lesson of day.lessons) {
          const lessonNum = String(lesson.number || '');
          const subjName = (lesson.subject || '').trim().toLowerCase();
          const key = `${dayDate}_${lessonNum}_${subjName}`;
          const fallbackKey = `${dayDate}_${subjName}`;

          const attachments = apiAttachmentsMap.get(key) || apiAttachmentsMap.get(fallbackKey) || [];
          lesson.attachments = attachments;
        }
      }

      // Filter for days strictly AFTER today (exclude today's homework!)
      const futureDays = parsedDays.filter(day => {
        const dayDate = day.date ? day.date.slice(0, 10) : '';
        return dayDate > todayStr;
      });

      console.log(`📊 Collected ${futureDays.length} future day(s) for ${target.label} (excluding today)`);

      allProfilesReports.push({
        profileId: `profile-${i}`,
        className: target.className,
        schoolName: target.schoolName,
        label: target.label,
        student: studentName,
        days: futureDays
      });
    }

    // -------------------------------------------------------------------------
    // Step 5: Save Combined Reports
    // -------------------------------------------------------------------------
    const combinedClasses = combineHomeworkByClass(allProfilesReports);
    const finalReport = {
      scrapedAt: new Date().toISOString(),
      today: todayStr,
      profilesCount: allProfilesReports.length,
      classesCount: combinedClasses.length,
      classes: combinedClasses,
      profiles: allProfilesReports
    };

    // Save JSON
    fs.writeFileSync(CONFIG.outputJson, JSON.stringify(finalReport, null, 2), 'utf8');
    console.log(`\n💾 Saved JSON data for all profiles and classes to: ${CONFIG.outputJson}`);

    // Save Markdown
    const markdownContent = generateMarkdownReport(finalReport);
    fs.writeFileSync('homework.md', markdownContent, 'utf8');
    console.log('📝 Saved markdown checklist to: homework.md');

    // Save HTML
    const htmlContent = generateHtmlReport(finalReport);
    fs.writeFileSync('homework.html', htmlContent, 'utf8');
    console.log('🌐 Saved interactive HTML report to: homework.html');

    // Terminal Summary
    printHomeworkReport(finalReport);

  } catch (error) {
    console.error('❌ Error executing scraper:', error);
    try {
      await page.screenshot({ path: 'error_screenshot.png', fullPage: true });
      console.log('📸 Saved error screenshot to error_screenshot.png');
    } catch {
      // ignore
    }
    process.exitCode = 1;
  } finally {
    await browser.close();
    console.log('🏁 Execution complete.');
  }
}

/**
 * Helper to get a concise school label for badges
 */
function getSchoolShortName(schoolName) {
  if (!schoolName) return '';
  if (schoolName.includes('40.')) return 'Rīgas 40. vsk.';
  if (schoolName.includes('ASSOR')) return 'ASSOR';
  return schoolName;
}

/**
 * Combine scraped homework across multiple schools into unified classes (e.g. 4.c and 1.a)
 */
function combineHomeworkByClass(profiles) {
  const classOrder = ['4.c', '1.a'];
  const classMap = new Map();

  for (const prof of profiles) {
    const cls = prof.className;
    if (!classMap.has(cls)) {
      classMap.set(cls, {
        className: cls,
        student: prof.student,
        schools: new Set(),
        daysMap: new Map()
      });
    }
    const classObj = classMap.get(cls);
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
      const dayEntry = classObj.daysMap.get(dayDate);
      if (day.title && (!dayEntry.title || dayEntry.title.length < day.title.length)) {
        dayEntry.title = day.title;
      }
      for (const lesson of day.lessons) {
        dayEntry.lessons.push({
          ...lesson,
          schoolName: prof.schoolName,
          schoolShort: getSchoolShortName(prof.schoolName)
        });
      }
    }
  }

  const result = [];
  const sortedKeys = Array.from(classMap.keys()).sort((a, b) => {
    const idxA = classOrder.indexOf(a);
    const idxB = classOrder.indexOf(b);
    if (idxA !== -1 && idxB !== -1) return idxA - idxB;
    return a.localeCompare(b);
  });

  for (const cls of sortedKeys) {
    const obj = classMap.get(cls);
    const days = Array.from(obj.daysMap.values()).sort((a, b) => a.date.localeCompare(b.date));
    for (const day of days) {
      day.lessons.sort((a, b) => {
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

/**
 * Generate a GitHub-flavored Markdown checklist grouped by combined class
 */
function generateMarkdownReport(report) {
  const classes = report.classes || combineHomeworkByClass(report.profiles || []);
  let md = `# 📚 E-Klase Mājasdarbi (Nākamajām dienām)\n\n`;
  md += `**Atjaunots:** ${new Date(report.scrapedAt).toLocaleString('lv-LV')}  \n`;
  md += `**Piezīme:** *Šodienas (${report.today}) mājasdarbi nav iekļauti.*\n\n`;
  md += `---\n\n`;

  for (const cls of classes) {
    const schoolsText = cls.schools && cls.schools.length > 0 ? `*Skolas: ${cls.schools.join(', ')}*\n\n` : '';
    md += `## 🏫 Klase ${cls.className} — 👤 ${cls.student}\n${schoolsText}`;

    if (cls.days.length === 0) {
      md += `*Nav ierakstu atlikušajām šīs nedēļas dienām.*\n\n`;
      continue;
    }

    for (const day of cls.days) {
      md += `### 📅 ${day.title}\n\n`;

      const hwLessons = day.lessons.filter(l => l.homework);
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
          md += `  - ✏️ *Uzdevums:* ${l.homework.replace(/\n/g, ' ')}\n`;
          if (l.attachments && l.attachments.length > 0) {
            const attLinks = l.attachments.map(a => `[${a.name} (${a.formattedSize})](${encodeURI(a.localPath || a.url)})`).join(', ');
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

/**
 * Generate a modern, ultra-compact, responsive HTML report combined by class
 */
function generateHtmlReport(report) {
  const classes = report.classes || combineHomeworkByClass(report.profiles || []);

  const escapeHtml = (str) => {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  };

  const linkify = (text) => {
    const escaped = escapeHtml(text);
    return escaped.replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer" class="link">$1</a>');
  };

  let totalTasksAll = 0;
  for (const cls of classes) {
    for (const day of cls.days) {
      totalTasksAll += day.lessons.filter(l => l.homework).length;
    }
  }

  // Navigation tabs (by class: 4.c, 1.a, and All)
  const tabButtonsHtml = classes.map((cls, idx) => {
    const count = cls.days.reduce((acc, d) => acc + d.lessons.filter(l => l.homework).length, 0);
    return `
      <button class="tab-btn ${idx === 0 ? 'active' : ''}" data-target="${cls.classId}" onclick="switchClassTab('${cls.classId}', this)">
        <span class="tab-badge-class">${escapeHtml(cls.className)}</span>
        <span class="tab-student-name">${escapeHtml(cls.student)}</span>
        <span class="tab-count-pill">${count}</span>
      </button>`;
  }).join('') + `
    <button class="tab-btn" data-target="all" onclick="switchClassTab('all', this)">
      <span class="tab-badge-class">Visas</span>
      <span class="tab-student-name">Kopā</span>
      <span class="tab-count-pill">${totalTasksAll}</span>
    </button>`;

  // Tab contents
  const classesContentHtml = classes.map((cls, clsIdx) => {
    const daysHtml = cls.days.map((day, dayIdx) => {
      const hwLessons = day.lessons.filter(l => l.homework);
      const hwCount = hwLessons.length;

      let lessonsHtml = '';
      if (hwCount === 0) {
        lessonsHtml = `
          <div class="empty-state">
            <span>🎉 Nav mājasdarbu</span>
          </div>`;
      } else {
        lessonsHtml = hwLessons.map((l, lessonIdx) => {
          const taskId = `task-${cls.classId}-${dayIdx}-${lessonIdx}`;
          const numText = l.number ? `<span class="lesson-num">${escapeHtml(l.number)}.</span>` : '';
          const isAssor = (l.schoolShort || '').includes('ASSOR');
          const schoolTagHtml = l.schoolShort ? `
            <span class="school-pill ${isAssor ? 'pill-assor' : 'pill-r40'}">${escapeHtml(l.schoolShort)}</span>` : '';
          const topicHtml = l.topic ? `
            <span class="topic-pill" title="${escapeHtml(l.topic)}">📖 ${escapeHtml(l.topic)}</span>` : '';
          const homeworkHtml = linkify(l.homework);

          let attachmentsHtml = '';
          if (l.attachments && l.attachments.length > 0) {
            const chips = l.attachments.map(a => `
              <a href="${escapeHtml(a.localPath || a.url)}" target="_blank" rel="noopener noreferrer" class="att-chip" title="Atvērt ${escapeHtml(a.name)}">
                <span class="att-icon">📎</span>
                <span class="att-name">${escapeHtml(a.name)}</span>
                <span class="att-size">(${escapeHtml(a.formattedSize)})</span>
              </a>
            `).join('');
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
        }).join('');
      }

      // Compact day title format (e.g. "Otrdiena, 10.11.")
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
    }).join('');

    return `
      <section id="${cls.classId}" class="class-panel ${clsIdx === 0 ? 'active' : ''}">
        <div class="class-subbar">
          <span class="class-title">🎓 Klase <strong>${escapeHtml(cls.className)}</strong> (${escapeHtml(cls.student)})</span>
          <span class="class-schools">${escapeHtml(cls.schools.join(' • '))}</span>
        </div>
        <div class="days-grid">
          ${daysHtml}
        </div>
      </section>`;
  }).join('');

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
        <span class="header-meta-pill">📅 Bez šodienas (${escapeHtml(report.today)})</span>
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

/**
 * Format and print the collected homework to console grouped by class
 */
function printHomeworkReport(report) {
  const classes = report.classes || combineHomeworkByClass(report.profiles || []);

  console.log('\n========================================================================');
  console.log('📋 E-KLASE MĀJASDARBI PA KLAŠU GRUPĀM (BEZ ŠODIENAS)');
  console.log('========================================================================');

  let totalTasks = 0;

  for (const cls of classes) {
    const schools = (cls.schools || []).join(', ');
    console.log(`\n🏫 KLASE ${cls.className} | 👤 ${cls.student} (${schools})`);
    console.log('------------------------------------------------------------------------');

    if (!cls.days || cls.days.length === 0) {
      console.log('   (Nav ierakstu atlikušajām šīs nedēļas dienām)');
      continue;
    }

    for (const day of cls.days) {
      const hwLessons = day.lessons.filter(l => l.homework);
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

export {
  combineHomeworkByClass,
  generateMarkdownReport,
  generateHtmlReport,
  printHomeworkReport
};

if (process.argv.includes('--generate-only')) {
  console.log('🔄 Regenerating reports from existing homework.json...');
  if (fs.existsSync(CONFIG.outputJson)) {
    const raw = fs.readFileSync(CONFIG.outputJson, 'utf8');
    const data = JSON.parse(raw);
    const combinedClasses = combineHomeworkByClass(data.profiles || []);
    data.classes = combinedClasses;
    data.classesCount = combinedClasses.length;
    fs.writeFileSync(CONFIG.outputJson, JSON.stringify(data, null, 2), 'utf8');
    fs.writeFileSync('homework.md', generateMarkdownReport(data), 'utf8');
    fs.writeFileSync('homework.html', generateHtmlReport(data), 'utf8');
    printHomeworkReport(data);
    console.log('✅ Reports successfully regenerated!');
  } else {
    console.error(`File ${CONFIG.outputJson} not found.`);
  }
} else {
  run();
}

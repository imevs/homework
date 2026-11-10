import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';
import type {
  AppConfig,
  ProfileReport,
  DayEntry,
  Lesson,
  Attachment,
  AuthHeaders
} from './types.ts';
import {
  sleep,
  formatBytes,
  getTodayDateString,
  LATVIAN_DAYS,
  cleanHomeworkText
} from './utils.ts';

interface ScraperResult {
  profiles: ProfileReport[];
  today: string;
}

export async function runScraper(config: AppConfig): Promise<ScraperResult> {
  console.log('========================================================');
  console.log('🚀 E-Klase Multi-Profile Homework Scraper');
  console.log(`👤 User:         ${config.username}`);
  console.log(`🎯 Profiles (${config.targetProfiles.length}):`);
  for (const p of config.targetProfiles) {
    console.log(`   - ${p.label}`);
  }
  console.log(`🖥️  Browser Mode: ${config.headless ? 'Headless' : 'Visible (Headed)'}`);
  console.log('========================================================\n');

  const authFile = config.authFile;
  const hasSavedSession = Boolean(authFile && fs.existsSync(authFile));

  const browser: Browser = await chromium.launch({
    headless: config.headless,
    args: ['--disable-blink-features=AutomationControlled']
  });

  const contextOptions: any = {
    viewport: { width: 1440, height: 900 },
    locale: 'lv-LV',
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'
  };

  if (hasSavedSession) {
    try {
      contextOptions.storageState = authFile;
      console.log(`🔑 Loading saved session from: ${authFile}`);
    } catch (e: any) {
      console.warn(`⚠️ Failed reading saved session (${e?.message}). Will log in afresh.`);
    }
  }

  const context: BrowserContext = await browser.newContext(contextOptions);
  const page: Page = await context.newPage();

  // Track auth headers across the session
  let authHeaders: AuthHeaders = {};
  page.on('request', (req) => {
    if (req.url().includes('family/api/')) {
      const h = req.headers();
      if (h.authorization) {
        authHeaders = {
          authorization: h.authorization,
          'x-profile-id': h['x-profile-id'],
          'x-class-id': h['x-class-id']
        };
      }
    }
  });

  // Track the latest diary response
  let latestDiaryApiResponse: any = null;
  page.on('response', async (res) => {
    if (res.url().includes('family/api/diary')) {
      try {
        latestDiaryApiResponse = await res.json();
      } catch {
        // ignore
      }
    }
  });

  const attachmentsDir = config.attachmentsDir;
  if (!fs.existsSync(attachmentsDir)) {
    fs.mkdirSync(attachmentsDir, { recursive: true });
  }

  const todayStr = getTodayDateString();
  console.log(`📆 Today's Date: ${todayStr} (Homework for today will NOT be saved)`);

  const allProfilesReports: ProfileReport[] = [];

  try {
    let isLoggedIn = false;

    // Check if saved session is valid
    if (hasSavedSession) {
      console.log('⚡ Checking if saved session is still active...');
      try {
        await page.goto('https://family.e-klase.lv/profile-selection', {
          waitUntil: 'domcontentloaded',
          timeout: 12000
        });

        // Wait up to 3.5s to see if the page redirects to auth.e-klase.lv (which happens when tokens expire)
        await page
          .waitForURL((url) => url.hostname.includes('auth.e-klase.lv') || url.pathname.includes('/login'), {
            timeout: 3500
          })
          .catch(() => null);

        const currentUrl = page.url();
          if (currentUrl.includes('auth.e-klase.lv') || currentUrl.includes('login')) {
            console.log('ℹ️ Saved session expired (redirected to auth). Falling back to credentials login...');
            isLoggedIn = false;
          } else {
            // Verify that an actual student/profile card is visible in the DOM
            const profileCardVisible = await page
              .locator('div, a, button')
              .filter({ hasText: config.targetProfiles[0]?.className || '4.c' })
              .first()
              .isVisible({ timeout: 4000 })
              .catch(() => false);

              if (profileCardVisible) {
                isLoggedIn = true;
                console.log('✅ Reused active session! Skipped credentials login.');
              } else {
                console.log('ℹ️ Saved session not confirmed (no profile cards visible). Falling back to credentials login...');
                isLoggedIn = false;
              }
            }
          } catch (err: any) {
            console.log(`ℹ️ Session check failed (${err?.message}). Falling back to regular login...`);
            isLoggedIn = false;
          }
        }

        if (!isLoggedIn) {
          const currentUrl = page.url();
          if (!currentUrl.includes('auth.e-klase.lv') && !currentUrl.includes('login')) {
            // ---------------------------------------------------------------------
            // Step 1: Open e-klase.lv & Handle Cookies
            // ---------------------------------------------------------------------
            console.log(`🌐 1. Opening ${config.url}...`);
            await page.goto(config.url, { waitUntil: 'domcontentloaded', timeout: config.timeout });

              const cookieBtn = page
                .locator('#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll, button:has-text("Atļaut visu")')
                .first();
              if (await cookieBtn.isVisible({ timeout: 4000 }).catch(() => false)) {
                console.log('🍪 Dismissing Cookiebot consent dialog...');
                await cookieBtn.click();
                await sleep(600);
              }

              // ---------------------------------------------------------------------
              // Step 2: Click on "Skolēns/Vecāks"
              // ---------------------------------------------------------------------
              console.log('🖱️  2. Clicking "Skolēns/Vecāks" button...');
              const studentParentBtn = page
                .locator('a[href*="family.e-klase.lv"]:visible, a:has-text("Skolēns/Vecāks"):visible')
                .first();
              await studentParentBtn.waitFor({ state: 'visible', timeout: 8000 });
              await studentParentBtn.click();
            } else {
              console.log('🔑 Already on login page, proceeding with credentials...');
            }

            // -----------------------------------------------------------------------
            // Step 3: Authenticate (auth.e-klase.lv)
            // -----------------------------------------------------------------------
            console.log('🔑 3. Waiting for login form...');
            await page.waitForSelector('#username, input[name="username"], input[name="UserName"]', {
              timeout: 15000
            });

            console.log('✍️  Filling credentials...');
            await page
              .locator('#username, input[name="username"], input[name="UserName"]')
              .first()
              .fill(config.username);
            await page
              .locator('#password, input[name="password"], input[name="Password"]')
              .first()
              .fill(config.password);

            console.log('🚀 Submitting credentials...');
            const submitBtn = page
              .locator('button:has-text("Pieslēgties"), button.btn--large, button[type="submit"]')
              .first();
            await submitBtn.click();

            // Wait until redirected back to family.e-klase.lv and settle
            await page.waitForURL(
              (url) => url.hostname.includes('family.e-klase.lv') && !url.hostname.includes('auth.e-klase.lv'),
              { timeout: 25000 }
            );
            await page.waitForLoadState('domcontentloaded');
            await sleep(2000);
            console.log('✅ Successfully authenticated!');

            // Save state to authFile for subsequent runs
            if (authFile) {
              try {
                const authDir = path.dirname(authFile);
                if (!fs.existsSync(authDir)) {
                  fs.mkdirSync(authDir, { recursive: true });
                }
                await context.storageState({ path: authFile });
                console.log(`💾 Saved session state to: ${authFile}`);
              } catch (saveErr: any) {
                console.warn(`⚠️ Could not save session state: ${saveErr?.message}`);
              }
            }
          }

          // -------------------------------------------------------------------------
          // Step 4: Loop through all target profiles
          // -------------------------------------------------------------------------
          for (let i = 0; i < config.targetProfiles.length; i++) {
            const target = config.targetProfiles[i];
            console.log(`\n--------------------------------------------------------`);
            console.log(`🎯 Profile [${i + 1}/${config.targetProfiles.length}]: ${target.label}`);
            console.log(`--------------------------------------------------------`);

            // Navigate to profile selection to switch (skip redundant navigation if already there)
            const isAlreadyOnProfileSelection = page.url().includes('family.e-klase.lv/profile-selection');
            if (!isAlreadyOnProfileSelection) {
              console.log('🔄 Navigating to profile-selection...');
              try {
                await page.goto('https://family.e-klase.lv/profile-selection', {
                  waitUntil: 'domcontentloaded',
                  timeout: config.timeout
                });
              } catch (navErr: any) {
                if (navErr?.message && navErr.message.includes('interrupted')) {
                  console.warn(`⚠️ Navigation interrupted, waiting for page load...`);
                  await page.waitForLoadState('domcontentloaded', { timeout: 10000 }).catch(() => null);
                } else {
                  throw navErr;
                }
              }
              await sleep(1500);
            }

            if (page.url().includes('auth.e-klase.lv') || page.url().includes('login')) {
              throw new Error('Session invalidated during profile switching (redirected to auth.e-klase.lv)');
            }

            // Locate card matching target class and school
            const profileCard = page
              .locator('div, a, button')
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
              const cardParentText = await profileCard.evaluate((el: HTMLElement) => {
                let cur: HTMLElement | null = el;
                while (cur && cur.parentElement && cur.innerText.length < 300) {
                  cur = cur.parentElement;
                }
                return cur ? cur.innerText : el.innerText;
              });
              const lines = cardParentText
                .split('\n')
                .map((l) => l.trim())
                .filter(Boolean);
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

            console.log(`🖱️  Selecting profile: ${target.label}...`);
            latestDiaryApiResponse = null;
            await profileCard.click();

            await page.waitForURL(/home|diary/, { timeout: 15000 });
            await sleep(1000);

            // Navigate to Diary
            console.log('📅 Opening Diary ("Dienasgrāmata")...');
            await page.goto('https://family.e-klase.lv/diary', {
              waitUntil: 'domcontentloaded',
              timeout: config.timeout
            });
            await sleep(2500); // Allow API requests and Vue rendering to settle

            console.log(`📖 Diary loaded at: ${page.url()}`);

            // Parse diary API response for attachments and untruncated homework text
            const apiAttachmentsMap = new Map<string, Attachment[]>();
            const apiHomeworkMap = new Map<string, string>();

            if (Array.isArray(latestDiaryApiResponse)) {
              for (const day of latestDiaryApiResponse) {
                const dayDate = day.date ? day.date.slice(0, 10) : '';
                const dObj = new Date(dayDate + 'T00:00:00');
                const dayName = LATVIAN_DAYS[dObj.getDay()] || '';
                const dayFolderName = dayName ? `${dayDate}_${dayName}` : dayDate;

                for (const lesson of day.lessons || []) {
                  const lessonNum = String(lesson.lessonNumber || '');
                  const rawSubj = String(
                    lesson.classJournalName || lesson.subjectName || lesson.subject?.name || ''
                  );
                  const subjName = rawSubj.trim().toLowerCase();
                  const cleanSubj = subjName.replace(/\s*\b\d+\.[a-z]\b/gi, '').trim();

                  const key = `${dayDate}_${lessonNum}_${subjName}`;
                  const keyClean = `${dayDate}_${lessonNum}_${cleanSubj}`;
                  const numKey = `${dayDate}_#${lessonNum}`;
                  const fallbackKey = `${dayDate}_${cleanSubj || subjName}`;
                  const lookupKeys = [key, keyClean, numKey, fallbackKey];

                  const attList: Attachment[] = [];
                  const hwTexts: string[] = [];

                  for (const ht of lesson.homeTasks || []) {
                    const taskObj = ht.task || ht;
                    const text = (
                      taskObj?.text ||
                      taskObj?.description ||
                      taskObj?.content ||
                      taskObj?.name ||
                      ht.note ||
                      ''
                    ).trim();
                    if (text) {
                      hwTexts.push(text);
                    }
                    for (const att of taskObj?.attachments || []) {
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

                  for (const ls of lesson.lessonSubjects || []) {
                    for (const att of ls.value?.attachments || []) {
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
                    for (const k of lookupKeys) {
                      if (!apiAttachmentsMap.has(k)) {
                        apiAttachmentsMap.set(k, attList);
                      }
                    }
                  }

                  if (hwTexts.length > 0) {
                    const combinedHw = hwTexts.join('\n');
                    for (const k of lookupKeys) {
                      if (!apiHomeworkMap.has(k)) {
                        apiHomeworkMap.set(k, combinedHw);
                      }
                    }
                  }
                }
              }
            }

            // Download attachments for this profile, skipping already downloaded files
            const downloadedMap = new Map<string, string>();
            for (const [, attList] of apiAttachmentsMap) {
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
                    console.log(
                      `   ⬇️  [${att.dayFolderName}] Downloading: ${att.name} (${att.formattedSize})...`
                    );
                    const headers: Record<string, string> = {};
                    if (authHeaders.authorization) headers['authorization'] = authHeaders.authorization;
                    if (authHeaders['x-profile-id']) headers['x-profile-id'] = authHeaders['x-profile-id'];
                    if (authHeaders['x-class-id']) headers['x-class-id'] = authHeaders['x-class-id'];

                    const fileResp = await page.context().request.get(att.url, { headers });
                    if (fileResp.status() === 200) {
                      const buffer = await fileResp.body();
                      fs.writeFileSync(localPath, buffer);
                      att.localPath = relativePath;
                      downloadedMap.set(att.id, relativePath);
                      console.log(`      ✅ Saved to: ${relativePath}`);
                    } else {
                      console.warn(`      ⚠️  Download returned HTTP ${fileResp.status()}`);
                    }
                  } catch (dlErr: any) {
                    console.warn(`      ⚠️  Failed to download ${att.name}: ${dlErr?.message}`);
                  }
                } else {
                  att.localPath = downloadedMap.get(att.id);
                }
              }
            }

            // Expand all collapsed "Rādīt vairāk" homework buttons on the page via Playwright
            try {
              let expandedCount = 0;
              while (expandedCount < 50) {
                const showMoreBtn = page.locator('button, a, span, div, p').filter({
                  hasText: /Rādīt vairāk/i
                }).first();
                const isVisible = await showMoreBtn.isVisible({ timeout: 350 }).catch(() => false);
                if (!isVisible) {
                  break;
                }
                await showMoreBtn.click({ timeout: 1500, force: true }).catch(() => null);
                expandedCount++;
                await sleep(200); // Allow Vue to update reactive state and expand DOM
              }
              if (expandedCount > 0) {
                console.log(`🔓 Expanded ${expandedCount} collapsed homework item(s) via "Rādīt vairāk"`);
                await sleep(400); // Allow layout settlement
              }
            } catch {
              // ignore
            }

            // Parse diary entries from DOM
            const parsedDays = await page.evaluate(async () => {
              const days: Array<{
                date: string;
                title: string;
                lessons: Array<{
                  number: string;
                  subject: string;
                  topic: string;
                  homework: string;
                  grades: string;
                  hasHomework: boolean;
                }>;
              }> = [];

              const clean = (s: string | null | undefined): string =>
                s ? s.replace(/\s+/g, ' ').trim() : '';

              const cleanMultiline = (s: string | null | undefined): string => {
                if (!s) return '';
                return s
                  .replace(/\r\n/g, '\n')
                  .replace(/\r/g, '\n')
                  .split('\n')
                  .map((line) => line.replace(/[ \t]+/g, ' ').trim())
                  .filter((line, idx, arr) => line || (idx > 0 && arr[idx - 1]))
                  .join('\n')
                  .trim();
              };

              // Backup pass: trigger click on any remaining "Rādīt vairāk" elements
              const showMoreButtons = Array.from(
                document.querySelectorAll('button, a, span, div')
              ).filter((el) => el.children.length === 0 && (el.textContent || '').includes('Rādīt vairāk'));
              if (showMoreButtons.length > 0) {
                for (const btn of showMoreButtons) {
                  try {
                    (btn as HTMLElement).click();
                    btn.dispatchEvent(
                      new MouseEvent('click', { bubbles: true, cancelable: true, view: window })
                    );
                  } catch {
                    // ignore
                  }
                }
                await new Promise((r) => setTimeout(r, 400));
              }

              const dayContainers = Array.from(document.querySelectorAll('div[data-date]'));

              for (const dc of dayContainers) {
                const dateIso = dc.getAttribute('data-date') || '';
                const titleText = clean(dc.querySelector('p')?.innerText || '');

                const lessonRows = Array.from(
                  dc.querySelectorAll('.col-span-5.grid, div.grid-cols-subgrid')
                );
                const lessons: Array<{
                  number: string;
                  subject: string;
                  topic: string;
                  homework: string;
                  grades: string;
                  hasHomework: boolean;
                }> = [];

                for (const row of lessonRows) {
                  const cells = Array.from(row.children) as HTMLElement[];
                  if (cells.length < 4) continue;

                  const number = clean(cells[0]?.innerText || '');
                  const subject = clean(
                    cells[1]?.querySelector('.text-subhead-14')?.textContent || cells[1]?.innerText || ''
                  );
                  const topic = clean(cells[2]?.innerText || '');

                  let homework = '';
                  const hwCell = cells[3];
                  if (hwCell) {
                    // Clone cell and remove attachment links, buttons, and chips to avoid concatenated filenames
                    const clone = hwCell.cloneNode(true) as HTMLElement;
                    clone
                      .querySelectorAll(
                        'a, button, [class*="attachment"], [class*="file"], [class*="chip"], [class*="badge"], svg'
                      )
                      .forEach((el) => el.remove());

                    const hasFormatting = Boolean(
                      clone.querySelector('p, br, strong, b, em, i, u, s, ul, ol, li')
                    );

                    if (hasFormatting) {
                      homework = (clone.innerHTML || '')
                        .replace(/\s*(\.\.\.\s*)?Rādīt vairāk\s*$/i, '')
                        .replace(/\s*Rādīt mazāk\s*$/i, '')
                        .replace(/\s*(Pielikumi\s*(\(\d+\))?|Pielikumi:?|Pielikums:?|Pielikumā)\s*$/i, '')
                        .trim();
                    } else {
                      clone.querySelectorAll('br').forEach((br) => br.replaceWith('\n'));
                      clone.querySelectorAll('p, div, li').forEach((el) => el.append('\n'));

                      homework = cleanMultiline(clone.textContent || '');
                      homework = homework
                        .replace(/\s*(\.\.\.\s*)?Rādīt vairāk\s*$/i, '')
                        .replace(/\s*Rādīt mazāk\s*$/i, '')
                        .replace(/\s*(Pielikumi\s*(\(\d+\))?|Pielikumi:?|Pielikums:?|Pielikumā)\s*$/i, '')
                        .trim();
                    }
                  }

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

            // Attach local file paths to lessons and pick the most complete homework text
            const daysWithAttachments: DayEntry[] = parsedDays.map((day) => {
              const dayDate = day.date ? day.date.slice(0, 10) : '';
              const lessonsWithAtt: Lesson[] = day.lessons.map((lesson) => {
                const lessonNum = String(lesson.number || '');
                const rawSubj = (lesson.subject || '').trim().toLowerCase();
                const cleanSubj = rawSubj.replace(/\s*\b\d+\.[a-z]\b/gi, '').trim();

                const key = `${dayDate}_${lessonNum}_${rawSubj}`;
                const keyClean = `${dayDate}_${lessonNum}_${cleanSubj}`;
                const numKey = `${dayDate}_#${lessonNum}`;
                const fallbackKey = `${dayDate}_${cleanSubj || rawSubj}`;

                const attachments =
                  apiAttachmentsMap.get(key) ||
                  apiAttachmentsMap.get(keyClean) ||
                  apiAttachmentsMap.get(numKey) ||
                  apiAttachmentsMap.get(fallbackKey) ||
                  [];

                // Choose most complete homework text between API and expanded DOM
                const apiHw =
                  apiHomeworkMap.get(key) ||
                  apiHomeworkMap.get(keyClean) ||
                  apiHomeworkMap.get(numKey) ||
                  apiHomeworkMap.get(fallbackKey) ||
                  '';

                let finalHomework = lesson.homework;
                if (apiHw) {
                  if (!finalHomework) {
                    finalHomework = apiHw;
                  } else if (apiHw.length >= finalHomework.length) {
                    finalHomework = apiHw;
                  } else if (
                    finalHomework.includes('...') ||
                    finalHomework.endsWith(' un') ||
                    finalHomework.endsWith(' un.')
                  ) {
                    finalHomework = apiHw;
                  }
                }

                // Strip any leaked attachment names or "Rādīt vairāk"
                finalHomework = cleanHomeworkText(
                  finalHomework,
                  attachments.map((a) => a.name)
                );

                return {
                  ...lesson,
                  homework: finalHomework,
                  hasHomework: Boolean(finalHomework),
                  attachments
                };
              });

              return {
                date: day.date,
                title: day.title,
                lessons: lessonsWithAtt
              };
            });

            // Filter for days strictly AFTER today (exclude today's homework!)
            const futureDays = daysWithAttachments.filter((day) => {
              const dayDate = day.date ? day.date.slice(0, 10) : '';
              return dayDate > todayStr;
            });

            console.log(
              `📊 Collected ${futureDays.length} future day(s) for ${target.label} (excluding today)`
            );

            allProfilesReports.push({
              profileId: `profile-${i}`,
              className: target.className,
              schoolName: target.schoolName,
              label: target.label,
              student: studentName,
              days: futureDays
            });
          }

          // Refresh saved session state at end of successful scrape
          if (authFile) {
            try {
              await context.storageState({ path: authFile });
            } catch {
              // ignore
            }
          }

          return {
            profiles: allProfilesReports,
            today: todayStr
          };
        } catch (error) {
          console.error('❌ Error executing scraper:', error);
          try {
            await page.screenshot({ path: 'error_screenshot.png', fullPage: true });
            console.log('📸 Saved error screenshot to error_screenshot.png');
          } catch {
            // ignore
          }
          throw error;
        } finally {
          await browser.close();
          console.log('🏁 Execution complete.');
        }
      }

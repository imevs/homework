import * as fs from 'fs';
import { CONFIG } from './config.ts';
import { runScraper } from './scraper.ts';
import { combineHomeworkByClass } from './combiner.ts';
import { generateMarkdownReport } from './reports/markdown.ts';
import { generateHtmlReport } from './reports/html.ts';
import { printHomeworkReport } from './reports/console.ts';
import type { ScrapeReport } from './types.ts';

export * from './types.ts';
export * from './utils.ts';
export * from './config.ts';
export * from './combiner.ts';
export * from './reports/markdown.ts';
export * from './reports/html.ts';
export * from './reports/console.ts';
export * from './scraper.ts';

export async function main(): Promise<void> {
  const isGenerateOnly = process.argv.includes('--generate-only');

  if (isGenerateOnly) {
    console.log('🔄 Regenerating reports from existing homework.json...');
    if (!fs.existsSync(CONFIG.outputJson)) {
      console.error(`❌ File ${CONFIG.outputJson} not found.`);
      process.exitCode = 1;
      return;
    }

    const raw = fs.readFileSync(CONFIG.outputJson, 'utf8');
    const data: ScrapeReport = JSON.parse(raw);
    const combinedClasses = combineHomeworkByClass(data.profiles || []);
    data.classes = combinedClasses;
    data.classesCount = combinedClasses.length;

    fs.writeFileSync(CONFIG.outputJson, JSON.stringify(data, null, 2), 'utf8');
    fs.writeFileSync(CONFIG.outputMarkdown, generateMarkdownReport(data), 'utf8');
    fs.writeFileSync(CONFIG.outputHtml, generateHtmlReport(data), 'utf8');

    printHomeworkReport(data);
    console.log('✅ Reports successfully regenerated!');
    return;
  }

  try {
    const { profiles, today } = await runScraper(CONFIG);
    const combinedClasses = combineHomeworkByClass(profiles);

    const report: ScrapeReport = {
      scrapedAt: new Date().toISOString(),
      today,
      profilesCount: profiles.length,
      classesCount: combinedClasses.length,
      classes: combinedClasses,
      profiles
    };

    // Save JSON
    fs.writeFileSync(CONFIG.outputJson, JSON.stringify(report, null, 2), 'utf8');
    console.log(`\n💾 Saved JSON data for all profiles and classes to: ${CONFIG.outputJson}`);

    // Save Markdown
    fs.writeFileSync(CONFIG.outputMarkdown, generateMarkdownReport(report), 'utf8');
    console.log(`📝 Saved markdown checklist to: ${CONFIG.outputMarkdown}`);

    // Save HTML
    fs.writeFileSync(CONFIG.outputHtml, generateHtmlReport(report), 'utf8');
    console.log(`🌐 Saved interactive HTML report to: ${CONFIG.outputHtml}`);

    // Terminal Summary
    printHomeworkReport(report);
  } catch (error) {
    console.error('❌ Error executing scraper:', error);
    process.exitCode = 1;
  }
}

// Execute if run directly from CLI
main();


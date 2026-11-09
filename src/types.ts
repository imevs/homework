export interface TargetProfile {
  className: string;
  schoolName: string;
  label: string;
}

export interface Attachment {
  id: string;
  name: string;
  dayDate: string;
  dayFolderName: string;
  sizeInBytes: number;
  formattedSize: string;
  url: string;
  localPath?: string;
}

export interface Lesson {
  number: string;
  subject: string;
  topic: string;
  homework: string;
  grades: string;
  hasHomework: boolean;
  schoolName?: string;
  schoolShort?: string;
  attachments?: Attachment[];
}

export interface DayEntry {
  date: string;
  title: string;
  lessons: Lesson[];
}

export interface ProfileReport {
  profileId: string;
  className: string;
  schoolName: string;
  label: string;
  student: string;
  days: DayEntry[];
}

export interface ClassReport {
  classId: string;
  className: string;
  student: string;
  schools: string[];
  days: DayEntry[];
}

export interface ScrapeReport {
  scrapedAt: string;
  today: string;
  profilesCount: number;
  classesCount: number;
  classes: ClassReport[];
  profiles: ProfileReport[];
}

export interface AuthHeaders {
  authorization?: string;
  'x-profile-id'?: string;
  'x-class-id'?: string;
}

export interface AppConfig {
  url: string;
  username: string;
  password: string;
  targetProfiles: TargetProfile[];
  headless: boolean;
  timeout: number;
  outputJson: string;
  outputMarkdown: string;
  outputHtml: string;
  attachmentsDir: string;
}


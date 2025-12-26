// =====================
// 1단계: SRT 자막 나누기
// =====================
export interface SrtEntry {
  index: string;
  timecode: string;
  text: string;
}

export interface SrtChunk {
  id: number;
  indexStart: number;
  indexEnd: number;
  structureFileName: string;
  structureContent: string;
  textFileName: string;
  textContent: string;
}

// =====================
// 2단계: SRT 자막 수정
// =====================
export type ProcessingStatus = 'idle' | 'processing' | 'review_ready' | 'completed' | 'error';

export interface ProjectEntry {
  id: string;
  timecodeFile: File | null;
  textFile: File | null;
  status: ProcessingStatus;
  originalText: string;
  correctedText: string;
  finalSrt: string;
  error?: string;
}

export interface ReferenceConfig {
  characters: string[];
  movies: string[];
  files: File[];
}

export interface ReferenceFileContent {
  mimeType: string;
  data: string;
}

// =====================
// 3단계: SRT 분할된 자막 합치기
// =====================
export interface SRTBlock {
  id: number;
  startTime: string;
  endTime: string;
  startTimeMs: number;
  endTimeMs: number;
  content: string;
}

export interface SRTFile {
  id: string;
  name: string;
  size: number;
  blocks: SRTBlock[];
  rawContent: string;
}

export interface MergedResult {
  blocks: SRTBlock[];
  rawContent: string;
}

// =====================
// 공통 타입
// =====================
export type TabType = 'split' | 'correct' | 'merge';

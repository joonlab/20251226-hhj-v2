import { SrtEntry, SrtChunk, SRTBlock, SRTFile } from '../types';

// =====================
// 1단계: SRT 자막 나누기 유틸
// =====================

/**
 * Parses SRT content into an array of SrtEntry objects.
 * Handles different newline characters and ensures empty lines are handled.
 */
export const parseSrt = (content: string): SrtEntry[] => {
  const normalized = content.replace(/\r\n/g, '\n').trim();
  const blocks = normalized.split(/\n\n+/);

  const entries: SrtEntry[] = [];

  for (const block of blocks) {
    const lines = block.split('\n');
    if (lines.length >= 3) {
      const index = lines[0].trim();
      const timecode = lines[1].trim();
      const text = lines.slice(2).join('\n').trim();

      if (index && timecode && text) {
        entries.push({ index, timecode, text });
      }
    }
  }

  return entries;
};

/**
 * Splits entries into chunks of a specific size (default 100).
 * Separates timecodes and text into different strings.
 */
export const chunkEntries = (entries: SrtEntry[], size: number = 100): SrtChunk[] => {
  const result: SrtChunk[] = [];

  for (let i = 0; i < entries.length; i += size) {
    const chunk = entries.slice(i, i + size);
    const chunkIndex = Math.floor(i / size) + 1;

    const structureContent = chunk.map((entry) => {
      return `${entry.index}\n${entry.timecode}`;
    }).join('\n\n');

    const textContent = chunk.map((entry) => {
      return entry.text;
    }).join('\n\n');

    result.push({
      id: chunkIndex,
      indexStart: i + 1,
      indexEnd: i + chunk.length,
      structureFileName: `${chunkIndex}_num&timecodes.txt`,
      structureContent: structureContent,
      textFileName: `${chunkIndex}_text.txt`,
      textContent: textContent
    });
  }

  return result;
};

/**
 * Triggers a file download in the browser.
 */
export const downloadBlob = (content: string, fileName: string) => {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

// =====================
// 3단계: SRT 합치기 유틸
// =====================

/**
 * Parses time string (HH:MM:SS,mmm) to milliseconds
 */
export const timeToMs = (timeStr: string): number => {
  const [time, msStr] = timeStr.split(',');
  const [hours, minutes, seconds] = time.split(':').map(Number);
  const ms = Number(msStr);
  return (hours * 3600000) + (minutes * 60000) + (seconds * 1000) + ms;
};

/**
 * Formats milliseconds to time string (HH:MM:SS,mmm)
 */
export const msToTime = (duration: number): string => {
  const milliseconds = Math.floor(duration % 1000);
  const seconds = Math.floor((duration / 1000) % 60);
  const minutes = Math.floor((duration / (1000 * 60)) % 60);
  const hours = Math.floor((duration / (1000 * 60 * 60)));

  const h = String(hours).padStart(2, '0');
  const m = String(minutes).padStart(2, '0');
  const s = String(seconds).padStart(2, '0');
  const ms = String(milliseconds).padStart(3, '0');

  return `${h}:${m}:${s},${ms}`;
};

/**
 * Parses raw SRT string into blocks
 */
export const parseSRTBlocks = (text: string): SRTBlock[] => {
  const normalizedText = text.replace(/\r\n/g, '\n').trim();
  const rawBlocks = normalizedText.split(/\n\s*\n/);

  return rawBlocks.map((block) => {
    const lines = block.split('\n');
    if (lines.length < 3) return null;

    const id = parseInt(lines[0], 10);
    const timeMatch = lines[1].match(/(\d{2}:\d{2}:\d{2},\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2},\d{3})/);

    if (!timeMatch) return null;

    const startTime = timeMatch[1];
    const endTime = timeMatch[2];
    const content = lines.slice(2).join('\n');

    return {
      id,
      startTime,
      endTime,
      startTimeMs: timeToMs(startTime),
      endTimeMs: timeToMs(endTime),
      content
    };
  }).filter((b): b is SRTBlock => b !== null);
};

/**
 * Merges multiple SRT files into one by sequentially re-indexing blocks
 * without changing original timestamps.
 */
export const mergeSRTFiles = (files: SRTFile[]): string => {
  let globalId = 1;
  const allBlocks: string[] = [];

  files.forEach((file) => {
    file.blocks.forEach((block) => {
      allBlocks.push(`${globalId++}\n${block.startTime} --> ${block.endTime}\n${block.content}`);
    });
  });

  return allBlocks.join('\n\n');
};

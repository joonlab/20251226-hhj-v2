import React, { useState, useEffect } from 'react';
import { SRTFile } from '../types';
import { parseSRTBlocks, mergeSRTFiles } from '../utils/srtUtils';

declare const JSZip: any;

interface MergeTabProps {
  files: SRTFile[];
  setFiles: React.Dispatch<React.SetStateAction<SRTFile[]>>;
}

const MergeTab: React.FC<MergeTabProps> = ({ files, setFiles }) => {
  const [mergedPreview, setMergedPreview] = useState<string>('');

  const readFileAsSRT = (file: File): Promise<SRTFile> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target?.result as string;
        const blocks = parseSRTBlocks(text);
        resolve({
          id: Math.random().toString(36).substr(2, 9),
          name: file.name,
          size: file.size,
          blocks,
          rawContent: text
        });
      };
      reader.readAsText(file);
    });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFiles = e.target.files;
    if (!uploadedFiles) return;

    const fileArray = Array.from(uploadedFiles) as File[];
    const srtFilesToAdd: SRTFile[] = [];

    for (const file of fileArray) {
      // Handle ZIP files
      if (
        file.name.endsWith('.zip') ||
        file.type === 'application/zip' ||
        file.type === 'application/x-zip-compressed'
      ) {
        try {
          const zip = new JSZip();
          const loadedZip = await zip.loadAsync(file);

          for (const filename of Object.keys(loadedZip.files)) {
            const zipEntry = loadedZip.files[filename];

            // Only process .srt files, ignore directories and hidden files
            if (
              !zipEntry.dir &&
              !filename.startsWith('__MACOSX') &&
              !filename.split('/').pop()?.startsWith('.') &&
              filename.toLowerCase().endsWith('.srt')
            ) {
              const text = await zipEntry.async('text');
              const cleanName = filename.split('/').pop() || filename;
              const blocks = parseSRTBlocks(text);

              srtFilesToAdd.push({
                id: Math.random().toString(36).substr(2, 9),
                name: cleanName,
                size: text.length,
                blocks,
                rawContent: text
              });
            }
          }
        } catch (error) {
          console.error("Error unzipping file:", file.name, error);
          alert(`압축 파일(${file.name})을 해제하는 중 오류가 발생했습니다.`);
        }
      }
      // Handle regular SRT files
      else if (file.name.toLowerCase().endsWith('.srt')) {
        const srtFile = await readFileAsSRT(file);
        srtFilesToAdd.push(srtFile);
      }
    }

    if (srtFilesToAdd.length > 0) {
      setFiles(prev => {
        const combined = [...prev, ...srtFilesToAdd];
        return combined.sort((a, b) =>
          a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
        );
      });
    }

    e.target.value = '';
  };

  const removeFile = (id: string) => {
    setFiles(prev => prev.filter(f => f.id !== id));
  };

  const moveFile = (id: string, direction: 'up' | 'down') => {
    const index = files.findIndex(f => f.id === id);
    if ((direction === 'up' && index === 0) || (direction === 'down' && index === files.length - 1)) return;

    const newFiles = [...files];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    [newFiles[index], newFiles[targetIndex]] = [newFiles[targetIndex], newFiles[index]];

    setFiles(newFiles);
  };

  const sortFilesByName = () => {
    const sorted = [...files].sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
    );
    setFiles(sorted);
  };

  useEffect(() => {
    if (files.length > 0) {
      setMergedPreview(mergeSRTFiles(files));
    } else {
      setMergedPreview('');
    }
  }, [files]);

  const downloadMerged = () => {
    if (!mergedPreview) return;
    const blob = new Blob([mergedPreview], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'merged_subtitles.srt';
    link.click();
    URL.revokeObjectURL(url);
  };

  const resetAll = () => {
    if (confirm('모든 파일을 제거하시겠습니까?')) {
      setFiles([]);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 space-y-4">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <svg className="w-5 h-5 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              SRT 파일 목록
            </h2>
            <div className="flex items-center gap-3">
              <button
                onClick={sortFilesByName}
                disabled={files.length < 2}
                className={`text-sm flex items-center gap-1 transition-colors ${
                  files.length < 2 ? 'text-slate-300 cursor-not-allowed' : 'text-slate-500 hover:text-indigo-600 font-medium'
                }`}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12" />
                </svg>
                이름순 정렬
              </button>
              <button
                onClick={resetAll}
                disabled={files.length === 0}
                className="text-sm text-red-500 hover:text-red-600 flex items-center gap-1 transition-colors font-medium disabled:opacity-50"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                초기화
              </button>
            </div>
          </div>

          <div className="group border-2 border-dashed border-slate-200 rounded-2xl p-10 text-center hover:border-indigo-400 hover:bg-indigo-50/30 transition-all cursor-pointer relative">
            <input
              type="file"
              multiple
              accept=".srt,.zip"
              onChange={handleFileUpload}
              className="absolute inset-0 opacity-0 cursor-pointer"
            />
            <div className="bg-white w-14 h-14 rounded-full shadow-sm flex items-center justify-center mx-auto mb-4 border border-slate-100 group-hover:scale-110 transition-transform">
              <svg className="w-7 h-7 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
            </div>
            <p className="text-slate-700 font-bold text-lg">SRT 파일 또는 ZIP 업로드</p>
            <p className="text-sm text-slate-400 mt-2">여러 파일을 순서대로 병합합니다 (ZIP 내 SRT 자동 인식)</p>
          </div>

          <div className="mt-6 space-y-3">
            {files.map((file, idx) => (
              <div key={file.id} className="group bg-white rounded-xl border border-slate-200 p-4 hover:border-indigo-200 hover:shadow-md transition-all flex items-center justify-between">
                <div className="flex items-center gap-4 min-w-0">
                  <span className="flex-shrink-0 w-8 h-8 bg-indigo-100 text-indigo-600 text-sm font-bold rounded-full flex items-center justify-center">
                    {idx + 1}
                  </span>
                  <div className="min-w-0">
                    <h3 className="font-bold text-slate-700 truncate" title={file.name}>{file.name}</h3>
                    <div className="flex gap-3 mt-1">
                      <span className="text-[11px] text-slate-400 font-medium">자막 {file.blocks.length}개</span>
                      {file.blocks.length > 0 && (
                        <span className="text-[11px] text-indigo-400 font-mono">
                          {file.blocks[0].startTime} ~ {file.blocks[file.blocks.length - 1].endTime}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => moveFile(file.id, 'up')}
                    className="p-2 hover:bg-slate-50 rounded-lg text-slate-400 hover:text-indigo-600 transition-all"
                    title="위로"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                    </svg>
                  </button>
                  <button
                    onClick={() => moveFile(file.id, 'down')}
                    className="p-2 hover:bg-slate-50 rounded-lg text-slate-400 hover:text-indigo-600 transition-all"
                    title="아래로"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  <div className="w-px h-4 bg-slate-200 mx-1"></div>
                  <button
                    onClick={() => removeFile(file.id)}
                    className="p-2 hover:bg-red-50 rounded-lg text-slate-400 hover:text-red-500 transition-all"
                    title="제거"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>
            ))}
            {files.length === 0 && (
              <div className="text-center py-16 text-slate-300 border-2 border-dotted rounded-2xl">
                <svg className="w-16 h-16 mx-auto mb-4 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
                <p className="font-medium">파일이 없습니다. SRT 파일을 추가해주세요.</p>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 sticky top-24">
          <h2 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2">
            <svg className="w-5 h-5 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            병합 결과
          </h2>

          <button
            onClick={downloadMerged}
            disabled={files.length === 0}
            className={`w-full py-4 rounded-xl font-extrabold text-white flex items-center justify-center gap-2 shadow-lg transition-all ${
              files.length === 0
                ? 'bg-slate-300 cursor-not-allowed'
                : 'bg-indigo-600 hover:bg-indigo-700 hover:-translate-y-1 active:translate-y-0 active:shadow-md'
            }`}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            합쳐진 SRT 다운로드
          </button>

          {files.length > 0 && (
            <div className="mt-8">
              <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.15em] mb-3">미리보기</h3>
              <div className="bg-slate-900 text-slate-400 p-4 rounded-xl text-[11px] font-mono whitespace-pre h-48 overflow-y-auto shadow-inner border border-slate-800 custom-scrollbar">
                {mergedPreview.split('\n').slice(0, 20).join('\n')}
                {mergedPreview.split('\n').length > 20 && '\n...'}
              </div>
            </div>
          )}

          {files.length === 0 && (
            <div className="mt-6 p-6 text-center text-slate-400 bg-slate-50 rounded-xl border border-slate-100">
              <p className="text-sm">파일을 추가하면 여기에<br/>미리보기가 표시됩니다</p>
            </div>
          )}

          {files.length > 0 && (
            <div className="mt-6 p-4 bg-indigo-50 rounded-xl border border-indigo-100">
              <p className="text-xs text-indigo-700 leading-relaxed">
                <span className="font-bold">안내:</span> 원본 자막의 시간 정보는 유지되며, 번호만 순서대로 다시 매겨집니다.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default MergeTab;

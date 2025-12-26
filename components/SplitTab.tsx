import React, { useState, useRef } from 'react';
import { SrtEntry, SrtChunk } from '../types';
import { parseSrt, chunkEntries, downloadBlob } from '../utils/srtUtils';

declare const JSZip: any;

interface SplitTabProps {
  file: File | null;
  setFile: React.Dispatch<React.SetStateAction<File | null>>;
  entries: SrtEntry[];
  setEntries: React.Dispatch<React.SetStateAction<SrtEntry[]>>;
  chunks: SrtChunk[];
  setChunks: React.Dispatch<React.SetStateAction<SrtChunk[]>>;
}

const SplitTab: React.FC<SplitTabProps> = ({ file, setFile, entries, setEntries, chunks, setChunks }) => {
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [isZipping, setIsZipping] = useState<boolean>(false);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processFile = (selectedFile: File) => {
    if (!selectedFile.name.toLowerCase().endsWith('.srt')) {
      alert('SRT 파일만 업로드 가능합니다.');
      return;
    }
    setFile(selectedFile);
    setChunks([]);

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      const parsed = parseSrt(content);
      setEntries(parsed);
    };
    reader.readAsText(selectedFile);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      processFile(selectedFile);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const droppedFiles = e.dataTransfer.files;
    if (droppedFiles && droppedFiles.length > 0) {
      processFile(droppedFiles[0]);
    }
  };

  const handleSplit = () => {
    if (entries.length === 0) return;
    setIsProcessing(true);

    setTimeout(() => {
      const processedChunks = chunkEntries(entries, 100);
      setChunks(processedChunks);
      setIsProcessing(false);
    }, 500);
  };

  const handleDownloadZip = async () => {
    if (chunks.length === 0) return;
    setIsZipping(true);
    try {
      const zip = new JSZip();
      chunks.forEach((chunk) => {
        zip.file(chunk.structureFileName, chunk.structureContent);
        zip.file(chunk.textFileName, chunk.textContent);
      });
      const blob = await zip.generateAsync({ type: 'blob' });
      const zipFileName = `${file?.name.replace('.srt', '')}_AI_split.zip`;

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = zipFileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('ZIP 생성 중 오류 발생:', error);
      alert('ZIP 파일을 생성하는 중 오류가 발생했습니다.');
    } finally {
      setIsZipping(false);
    }
  };

  const reset = () => {
    setFile(null);
    setEntries([]);
    setChunks([]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
        {!file ? (
          <div
            onClick={() => fileInputRef.current?.click()}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-all group ${
              isDragging
                ? 'border-indigo-500 bg-indigo-50'
                : 'border-slate-300 hover:bg-slate-50 hover:border-indigo-300'
            }`}
          >
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              className="hidden"
              accept=".srt"
            />
            <div className="mb-4 flex justify-center">
              <div className={`p-4 rounded-full transition-all ${isDragging ? 'bg-indigo-100' : 'bg-slate-100 group-hover:bg-indigo-100'}`}>
                <svg
                  className={`w-10 h-10 transition-colors ${
                    isDragging ? 'text-indigo-600' : 'text-slate-400 group-hover:text-indigo-500'
                  }`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
              </div>
            </div>
            <p className={`font-bold text-lg ${isDragging ? 'text-indigo-600' : 'text-slate-700'}`}>
              {isDragging ? '파일을 여기에 놓으세요' : 'SRT 파일을 업로드하세요'}
            </p>
            <p className="text-slate-400 text-sm mt-2">클릭하거나 파일을 드래그하세요</p>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="flex items-center justify-between p-4 bg-indigo-50 border border-indigo-100 rounded-xl">
              <div className="flex items-center space-x-3">
                <div className="bg-indigo-600 text-white p-2.5 rounded-lg">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <div>
                  <p className="font-bold text-slate-800">{file.name}</p>
                  <p className="text-xs text-slate-500">총 {entries.length}개의 자막 항목</p>
                </div>
              </div>
              <button
                onClick={reset}
                className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="flex items-center gap-4">
              <div className="flex-1 p-3 bg-slate-50 border border-slate-200 rounded-lg text-slate-600 text-sm flex items-center justify-center">
                <span className="font-medium">100줄 단위로 분할 + 타임코드/텍스트 분리</span>
              </div>
              <button
                onClick={handleSplit}
                disabled={isProcessing}
                className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white font-bold rounded-lg transition-all flex items-center space-x-2"
              >
                {isProcessing ? (
                  <>
                    <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <span>처리 중...</span>
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                    </svg>
                    <span>자막 분리</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>

      {chunks.length > 0 && (
        <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-800">분할 결과 ({chunks.length}세트)</h2>
              <p className="text-sm text-slate-500">총 {chunks.length * 2}개의 파일 생성</p>
            </div>
            <button
              onClick={handleDownloadZip}
              disabled={isZipping}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white text-sm font-bold rounded-lg transition-all flex items-center space-x-2"
            >
              {isZipping ? (
                <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                </svg>
              )}
              <span>ZIP 다운로드</span>
            </button>
          </div>

          <div className="grid grid-cols-1 gap-3">
            {chunks.map((chunk) => (
              <div
                key={chunk.id}
                className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between shadow-sm hover:border-indigo-200 transition-all"
              >
                <div className="mb-3 md:mb-0 flex items-center gap-3">
                  <span className="bg-slate-100 text-slate-600 font-bold px-2.5 py-1 rounded text-sm">#{chunk.id}</span>
                  <p className="font-semibold text-slate-700">
                    Lines {chunk.indexStart} ~ {chunk.indexEnd}
                  </p>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => downloadBlob(chunk.structureContent, chunk.structureFileName)}
                    className="flex-1 md:flex-none flex items-center justify-center space-x-2 px-3 py-2 bg-violet-50 text-violet-700 hover:bg-violet-100 rounded-lg transition-colors border border-violet-200 text-sm"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>타임코드</span>
                  </button>
                  <button
                    onClick={() => downloadBlob(chunk.textContent, chunk.textFileName)}
                    className="flex-1 md:flex-none flex items-center justify-center space-x-2 px-3 py-2 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-lg transition-colors border border-emerald-200 text-sm"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <span>텍스트</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default SplitTab;

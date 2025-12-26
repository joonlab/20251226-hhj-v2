import React, { useState, useRef, useMemo } from 'react';
import { ProjectEntry, ProcessingStatus, ReferenceConfig } from '../types';
import { processTextSegment } from '../services/geminiService';

declare const JSZip: any;
declare const diff_match_patch: any;

const CorrectTab: React.FC = () => {
  const [projects, setProjects] = useState<ProjectEntry[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingProgress, setProcessingProgress] = useState(0);

  const [refConfig, setRefConfig] = useState<ReferenceConfig>({
    characters: [],
    movies: [],
    files: []
  });

  const [charInput, setCharInput] = useState('');
  const [movieInput, setMovieInput] = useState('');
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [editorLines, setEditorLines] = useState<string[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const refFileInputRef = useRef<HTMLInputElement>(null);

  // Reference Management
  const addCharacter = () => {
    if (charInput.trim() && !refConfig.characters.includes(charInput.trim())) {
      setRefConfig(prev => ({ ...prev, characters: [...prev.characters, charInput.trim()] }));
      setCharInput('');
    }
  };

  const addMovie = () => {
    if (movieInput.trim() && !refConfig.movies.includes(movieInput.trim())) {
      setRefConfig(prev => ({ ...prev, movies: [...prev.movies, movieInput.trim()] }));
      setMovieInput('');
    }
  };

  const removeTag = (type: 'characters' | 'movies', value: string) => {
    setRefConfig(prev => ({ ...prev, [type]: prev[type].filter(t => t !== value) }));
  };

  const handleRefFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files);
      setRefConfig(prev => ({ ...prev, files: [...prev.files, ...newFiles] }));
    }
  };

  const removeRefFile = (index: number) => {
    setRefConfig(prev => ({ ...prev, files: prev.files.filter((_, i) => i !== index) }));
  };

  // File Pairing Logic
  const handleFiles = async (incomingFiles: File[]) => {
    const processedFiles: File[] = [];

    for (const file of incomingFiles) {
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

            if (!zipEntry.dir && !filename.startsWith('__MACOSX') && !filename.split('/').pop()?.startsWith('.')) {
              const blob = await zipEntry.async('blob');
              const cleanName = filename.split('/').pop() || filename;
              const type = cleanName.endsWith('.txt') ? 'text/plain' : 'application/octet-stream';
              const extractedFile = new File([blob], cleanName, { type });
              processedFiles.push(extractedFile);
            }
          }
        } catch (error) {
          console.error("Error Unzipping file:", file.name, error);
          alert(`압축 파일(${file.name})을 해제하는 중 오류가 발생했습니다.`);
        }
      } else {
        processedFiles.push(file);
      }
    }

    const newProjectsMap = new Map<string, Partial<ProjectEntry>>();

    const getProjectId = (filename: string) => {
      const match = filename.match(/^(.+?)_/);
      return match ? match[1] : null;
    };

    processedFiles.forEach(file => {
      const id = getProjectId(file.name);
      if (!id) return;

      if (!newProjectsMap.has(id)) {
        newProjectsMap.set(id, { id, status: 'idle', originalText: '', correctedText: '', finalSrt: '' });
      }
      const entry = newProjectsMap.get(id)!;

      if (file.name.includes('num&timecodes')) {
        entry.timecodeFile = file;
      } else if (file.name.includes('text')) {
        entry.textFile = file;
      }
    });

    setProjects(prev => {
      const merged = [...prev];
      newProjectsMap.forEach((newEntry, id) => {
        const existingIndex = merged.findIndex(p => p.id === id);
        if (existingIndex >= 0) {
          if (newEntry.timecodeFile) merged[existingIndex].timecodeFile = newEntry.timecodeFile;
          if (newEntry.textFile) merged[existingIndex].textFile = newEntry.textFile;
          if (merged[existingIndex].status === 'error') merged[existingIndex].status = 'idle';
        } else {
          merged.push(newEntry as ProjectEntry);
        }
      });
      return merged.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
    });
  };

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      await handleFiles(Array.from(e.target.files));
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files) {
      await handleFiles(Array.from(e.dataTransfer.files));
    }
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  // Processing Logic
  const mergeToSrt = async (timecodeFile: File, correctedText: string): Promise<string> => {
    const timecodeContent = await timecodeFile.text();
    const timecodeBlocks = timecodeContent.trim().split(/\n\s*\n/);
    const textLines = correctedText.trim().split('\n').filter(line => line.trim() !== '');

    let srtOutput = '';
    const length = Math.min(timecodeBlocks.length, textLines.length);

    for (let i = 0; i < length; i++) {
      const tcBlock = timecodeBlocks[i].trim();
      const textLine = textLines[i].trim();
      srtOutput += `${tcBlock}\n${textLine}\n\n`;
    }

    return srtOutput.trim();
  };

  const processProject = async (project: ProjectEntry) => {
    if (!project.textFile || !project.timecodeFile) return project;

    try {
      const rawText = await project.textFile.text();
      const corrected = await processTextSegment(rawText, refConfig);

      return {
        ...project,
        status: 'review_ready' as ProcessingStatus,
        originalText: rawText,
        correctedText: corrected,
      };
    } catch (error) {
      return {
        ...project,
        status: 'error' as ProcessingStatus,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  };

  const processAll = async () => {
    setIsProcessing(true);
    setProcessingProgress(0);

    const idleProjects = projects.filter(p => p.status === 'idle' || p.status === 'error');
    const total = idleProjects.length;
    let completed = 0;

    const CONCURRENCY = 5;

    const chunk = <T,>(arr: T[], size: number): T[][] =>
      Array.from({ length: Math.ceil(arr.length / size) }, (v, i) =>
        arr.slice(i * size, i * size + size)
      );

    const chunks = chunk(idleProjects, CONCURRENCY);

    for (const batch of chunks) {
      await Promise.all(
        batch.map(async (project) => {
          setProjects(prev => prev.map(p => p.id === project.id ? { ...p, status: 'processing' } : p));
          const result = await processProject(project);
          setProjects(prev => prev.map(p => p.id === project.id ? result : p));
          completed++;
          setProcessingProgress((completed / total) * 100);
        })
      );
    }

    setIsProcessing(false);
  };

  const confirmAll = async () => {
    const toConfirm = projects.filter(p => p.status === 'review_ready');
    if (toConfirm.length === 0) return;

    const processed = await Promise.all(toConfirm.map(async (p) => {
      if (!p.timecodeFile) return p;
      const finalSrt = await mergeToSrt(p.timecodeFile, p.correctedText);
      return { ...p, status: 'completed' as ProcessingStatus, finalSrt };
    }));

    setProjects(prev => prev.map(p => {
      const updated = processed.find(u => u.id === p.id);
      return updated || p;
    }));
  };

  // Editor & Diff Logic
  const openEditor = (project: ProjectEntry) => {
    if (project.status === 'review_ready' || project.status === 'completed') {
      setEditingProjectId(project.id);
      setEditorLines(project.correctedText.split('\n'));
    }
  };

  const handleLineUpdate = (index: number, newText: string) => {
    setEditorLines(prev => {
      const next = [...prev];
      next[index] = newText;
      return next;
    });
  };

  const saveEditor = async () => {
    if (!editingProjectId) return;

    const project = projects.find(p => p.id === editingProjectId);
    if (project && project.timecodeFile) {
      const finalText = editorLines.join('\n');
      const srt = await mergeToSrt(project.timecodeFile, finalText);

      setProjects(prev => prev.map(p => p.id === editingProjectId ? {
        ...p,
        correctedText: finalText,
        finalSrt: srt,
        status: 'completed'
      } : p));
    }
    setEditingProjectId(null);
  };

  // Row-by-Row Diff Calculation
  const rowDiffs = useMemo(() => {
    const project = projects.find(p => p.id === editingProjectId);
    if (!project || !editingProjectId) return [];

    const originalLines = project.originalText.split('\n');
    const correctedLines = editorLines;

    const dmp = new diff_match_patch();
    let globalChangeIndex = 0;
    const maxLines = Math.max(originalLines.length, correctedLines.length);
    const rows = [];

    for (let i = 0; i < maxLines; i++) {
      const o = originalLines[i] || '';
      const c = correctedLines[i] || '';

      if (o === c) {
        rows.push({
          left: <span>{o}</span>,
          right: <span>{c}</span>,
        });
        continue;
      }

      const diffs = dmp.diff_main(o, c);
      dmp.diff_cleanupSemantic(diffs);

      const leftContent: React.ReactNode[] = [];
      const rightContent: React.ReactNode[] = [];

      let currentChangeId: number | null = null;
      let isInsideChangeBlock = false;

      diffs.forEach(([op, text]: [number, string], idx: number) => {
        const isWhitespace = !text.trim();

        if (op === 0) {
          leftContent.push(<span key={`o-${idx}`}>{text}</span>);
          rightContent.push(<span key={`c-${idx}`}>{text}</span>);
          isInsideChangeBlock = false;
        }
        else if (op === -1) {
          if (isWhitespace) {
            leftContent.push(<span key={`o-${idx}`}>{text}</span>);
          } else {
            if (!isInsideChangeBlock) {
              globalChangeIndex++;
              currentChangeId = globalChangeIndex;
              isInsideChangeBlock = true;
            }
            leftContent.push(
              <span key={`o-${idx}`} className="diff-del relative group">
                {text}
                <sup className="diff-index select-none">{currentChangeId}</sup>
              </span>
            );
          }
        }
        else if (op === 1) {
          if (isWhitespace) {
            rightContent.push(<span key={`c-${idx}`}>{text}</span>);
          } else {
            if (!isInsideChangeBlock) {
              globalChangeIndex++;
              currentChangeId = globalChangeIndex;
              isInsideChangeBlock = true;
            }
            rightContent.push(
              <span key={`c-${idx}`} className="diff-ins relative group">
                {text}
                <sup className="diff-index select-none">{currentChangeId}</sup>
              </span>
            );
          }
        }
      });

      rows.push({
        left: <>{leftContent}</>,
        right: <>{rightContent}</>,
      });
    }

    return rows;
  }, [editingProjectId, projects, editorLines]);

  const currentProject = projects.find(p => p.id === editingProjectId);

  // Download Logic
  const downloadProject = (project: ProjectEntry) => {
    if (!project.finalSrt) return;
    const blob = new Blob([project.finalSrt], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${project.id}_수정완료.srt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const downloadAllZip = async () => {
    const completed = projects.filter(p => p.status === 'completed' && p.finalSrt);
    if (completed.length === 0) return;

    const zip = new JSZip();
    completed.forEach(p => {
      zip.file(`${p.id}_수정완료.srt`, p.finalSrt);
    });

    const content = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(content);
    const a = document.createElement('a');
    a.href = url;
    a.download = `SRT_Result_${new Date().getTime()}.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="flex flex-col lg:flex-row gap-6">
      {/* Left Panel: Configuration */}
      <aside className="w-full lg:w-80 space-y-4">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-4 border-b border-slate-100 bg-gradient-to-r from-violet-50 to-indigo-50">
            <h2 className="font-bold text-slate-800 flex items-center">
              <svg className="w-5 h-5 mr-2 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
              </svg>
              교정 가이드 설정
            </h2>
          </div>

          <div className="p-4 space-y-5">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                등장인물
              </label>
              <div className="flex space-x-2 mb-2">
                <input
                  type="text"
                  value={charInput}
                  onChange={(e) => setCharInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addCharacter()}
                  placeholder="인물명 입력"
                  className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                />
                <button onClick={addCharacter} className="px-3 py-2 bg-indigo-50 text-indigo-600 rounded-lg hover:bg-indigo-100 font-medium text-sm transition-colors">+</button>
              </div>
              <div className="flex flex-wrap gap-2">
                {refConfig.characters.map((char) => (
                  <span key={char} className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-100">
                    {char}
                    <button onClick={() => removeTag('characters', char)} className="ml-1.5 text-indigo-400 hover:text-indigo-600">x</button>
                  </span>
                ))}
                {refConfig.characters.length === 0 && <span className="text-xs text-slate-400 italic">등록된 인물이 없습니다</span>}
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                영화/작품 제목
              </label>
              <div className="flex space-x-2 mb-2">
                <input
                  type="text"
                  value={movieInput}
                  onChange={(e) => setMovieInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addMovie()}
                  placeholder="작품명 입력"
                  className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none"
                />
                <button onClick={addMovie} className="px-3 py-2 bg-purple-50 text-purple-600 rounded-lg hover:bg-purple-100 font-medium text-sm transition-colors">+</button>
              </div>
              <div className="flex flex-wrap gap-2">
                {refConfig.movies.map((movie) => (
                  <span key={movie} className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium bg-purple-50 text-purple-700 border border-purple-100">
                    &lt;{movie}&gt;
                    <button onClick={() => removeTag('movies', movie)} className="ml-1.5 text-purple-400 hover:text-purple-600">x</button>
                  </span>
                ))}
                {refConfig.movies.length === 0 && <span className="text-xs text-slate-400 italic">등록된 작품이 없습니다</span>}
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                참고 문서
              </label>
              <div
                onClick={() => refFileInputRef.current?.click()}
                className="border-2 border-dashed border-slate-200 rounded-lg p-4 text-center hover:bg-slate-50 hover:border-slate-300 transition-all cursor-pointer"
              >
                <input
                  type="file"
                  ref={refFileInputRef}
                  className="hidden"
                  multiple
                  accept=".txt,.md,.pdf,.csv,.doc,.docx,.ppt,.pptx"
                  onChange={handleRefFileUpload}
                />
                <p className="text-sm text-slate-600 font-medium">참고 파일 업로드</p>
                <p className="text-xs text-slate-400 mt-1">TXT, MD, PDF, CSV</p>
              </div>
              <div className="mt-2 space-y-1.5">
                {refConfig.files.map((file, idx) => (
                  <div key={idx} className="flex items-center justify-between p-2 bg-white border border-slate-100 rounded text-xs shadow-sm">
                    <span className="truncate max-w-[160px] text-slate-700">{file.name}</span>
                    <button onClick={() => removeRefFile(idx)} className="text-slate-300 hover:text-red-500">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </aside>

      {/* Right Panel: File List */}
      <div className="flex-1 flex flex-col">
        <div
          className={`flex-1 bg-white rounded-2xl shadow-sm border border-slate-200 flex flex-col overflow-hidden transition-all ${isProcessing ? 'ring-2 ring-indigo-100' : ''}`}
          onDrop={onDrop}
          onDragOver={onDragOver}
        >
          {/* Progress Bar */}
          {isProcessing && (
            <div className="px-4 pt-4">
              <div className="flex items-center space-x-3">
                <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-indigo-600 rounded-full transition-all duration-300"
                    style={{ width: `${processingProgress}%` }}
                  ></div>
                </div>
                <span className="text-xs font-semibold text-indigo-600">{Math.round(processingProgress)}%</span>
              </div>
            </div>
          )}

          {/* Toolbar */}
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <h2 className="font-bold text-slate-800">
              작업 파일 <span className="text-slate-400 font-normal">({projects.length})</span>
            </h2>
            <div className="flex items-center space-x-2">
              {projects.some(p => p.status === 'review_ready') && (
                <button
                  onClick={confirmAll}
                  disabled={isProcessing}
                  className="px-3 py-1.5 bg-green-50 text-green-700 text-xs font-bold rounded hover:bg-green-100 transition-colors border border-green-200"
                >
                  일괄 확정
                </button>
              )}
              {projects.some(p => p.status === 'completed') && (
                <button
                  onClick={downloadAllZip}
                  className="px-3 py-1.5 bg-indigo-50 text-indigo-700 text-xs font-bold rounded hover:bg-indigo-100 transition-colors"
                >
                  ZIP 다운로드
                </button>
              )}
              <button
                onClick={() => setProjects([])}
                disabled={isProcessing}
                className="px-3 py-1.5 text-slate-400 hover:text-red-500 text-xs font-bold transition-colors"
              >
                초기화
              </button>
            </div>
          </div>

          {/* List Content */}
          <div className="flex-1 overflow-y-auto p-4 custom-scrollbar bg-slate-50/30 min-h-[300px]">
            {projects.length === 0 ? (
              <div
                className="h-full min-h-[280px] flex flex-col items-center justify-center border-2 border-dashed border-slate-300 rounded-xl bg-slate-50 cursor-pointer hover:bg-white hover:border-indigo-400 transition-all group"
                onClick={() => fileInputRef.current?.click()}
              >
                <div className="p-4 bg-white rounded-full shadow-sm mb-4 group-hover:scale-110 transition-transform">
                  <svg className="w-8 h-8 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                </div>
                <p className="text-slate-600 font-bold text-lg">파일 추가하기</p>
                <p className="text-slate-400 text-sm mt-1 text-center">
                  1단계에서 생성된 파일 또는 ZIP을 업로드하세요
                </p>
                <input
                  type="file"
                  ref={fileInputRef}
                  className="hidden"
                  multiple
                  onChange={onFileChange}
                />
              </div>
            ) : (
              <div className="space-y-3">
                {projects.map((p) => (
                  <div key={p.id} className="bg-white border border-slate-200 rounded-xl p-4 flex items-center justify-between shadow-sm hover:shadow-md transition-shadow">
                    <div className="flex items-center space-x-4">
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-sm font-bold
                        ${p.status === 'completed' ? 'bg-green-100 text-green-600' :
                          p.status === 'review_ready' ? 'bg-amber-100 text-amber-600' :
                          p.status === 'processing' ? 'bg-indigo-100 text-indigo-600' :
                          p.status === 'error' ? 'bg-red-100 text-red-600' : 'bg-slate-100 text-slate-500'}`}>
                        {p.id}
                      </div>
                      <div>
                        <h3 className="font-semibold text-slate-700 text-sm">Project #{p.id}</h3>
                        <div className="flex space-x-2 mt-1">
                          <span className={`text-[10px] px-1.5 py-0.5 rounded border ${p.timecodeFile ? 'bg-slate-50 border-slate-200 text-slate-600' : 'bg-red-50 border-red-100 text-red-400'}`}>
                            {p.timecodeFile ? 'Timecodes' : 'Timecodes missing'}
                          </span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded border ${p.textFile ? 'bg-slate-50 border-slate-200 text-slate-600' : 'bg-red-50 border-red-100 text-red-400'}`}>
                            {p.textFile ? 'Text' : 'Text missing'}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center space-x-2">
                      {p.status === 'error' && (
                        <span className="text-xs text-red-500 font-medium mr-2">{p.error}</span>
                      )}

                      {(p.status === 'review_ready' || p.status === 'completed') && (
                        <button
                          onClick={() => openEditor(p)}
                          className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors border
                            ${p.status === 'completed'
                              ? 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                              : 'bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100'}`}
                        >
                          {p.status === 'completed' ? '다시 수정' : '검토 및 완료'}
                        </button>
                      )}

                      {p.status === 'completed' && (
                        <button
                          onClick={() => downloadProject(p)}
                          className="p-2 text-indigo-600 bg-indigo-50 rounded-lg hover:bg-indigo-100 transition-colors"
                          title="개별 다운로드"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                          </svg>
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Bottom Action Bar */}
          <div className="p-4 border-t border-slate-200 bg-white">
            <button
              onClick={processAll}
              disabled={isProcessing || projects.length === 0}
              className={`w-full py-4 rounded-xl text-white font-bold text-lg shadow-lg transition-all flex items-center justify-center
                ${isProcessing || projects.length === 0
                  ? 'bg-slate-300 shadow-none cursor-not-allowed'
                  : 'bg-indigo-600 hover:bg-indigo-700 hover:shadow-indigo-500/40 hover:-translate-y-0.5'}`}
            >
              {isProcessing ? (
                <>
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mr-3"></div>
                  AI 수정 진행 중...
                </>
              ) : (
                'AI 자막 교정 시작'
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Editor Modal */}
      {editingProjectId && currentProject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-7xl h-[90vh] flex flex-col overflow-hidden animate-scale-in">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div>
                <h3 className="text-lg font-bold text-slate-800">자막 검토 및 확정</h3>
                <p className="text-xs text-slate-500">Project #{currentProject.id} - 줄 단위 비교</p>
              </div>
              <div className="flex space-x-2">
                <button
                  onClick={() => setEditingProjectId(null)}
                  className="px-4 py-2 text-slate-500 text-sm font-medium hover:bg-slate-100 rounded-lg transition-colors"
                >
                  취소
                </button>
                <button
                  onClick={saveEditor}
                  className="px-6 py-2 bg-indigo-600 text-white text-sm font-bold rounded-lg hover:bg-indigo-700 shadow-md transition-all flex items-center"
                >
                  <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  확정 및 저장
                </button>
              </div>
            </div>

            {/* Modal Content */}
            <div className="flex-1 overflow-y-auto custom-scrollbar bg-slate-100 p-4">
              <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
                <div className="flex bg-slate-50 border-b border-slate-200 sticky top-0 z-10 text-xs font-bold text-slate-500 uppercase tracking-wider">
                  <div className="w-1/2 px-4 py-3 border-r border-slate-200 flex justify-between">
                    <span>원본</span>
                    <span className="text-[10px] text-red-500 normal-case bg-red-50 px-2 py-0.5 rounded">삭제됨</span>
                  </div>
                  <div className="w-1/2 px-4 py-3 flex justify-between">
                    <span>수정본 (편집 가능)</span>
                    <span className="text-[10px] text-indigo-600 normal-case bg-indigo-50 px-2 py-0.5 rounded">추가됨</span>
                  </div>
                </div>

                <div className="divide-y divide-slate-100">
                  {rowDiffs.map((row, index) => (
                    <div key={index} className="flex group hover:bg-slate-50/50 transition-colors">
                      <div className="w-1/2 px-4 py-2 border-r border-slate-200 font-mono text-sm text-slate-600 leading-relaxed break-words whitespace-pre-wrap flex items-center min-h-[40px]">
                        {row.left}
                      </div>
                      <div
                        className="w-1/2 px-4 py-2 font-mono text-sm text-slate-800 leading-relaxed break-words whitespace-pre-wrap outline-none focus:bg-indigo-50/20 transition-colors flex items-center min-h-[40px]"
                        contentEditable
                        suppressContentEditableWarning={true}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                          }
                        }}
                        onBlur={(e) => {
                          const newText = e.currentTarget.innerText;
                          handleLineUpdate(index, newText);
                        }}
                      >
                        {row.right}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CorrectTab;

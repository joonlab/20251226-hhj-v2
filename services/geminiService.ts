import { GoogleGenAI } from "@google/genai";
import { ReferenceConfig, ReferenceFileContent } from "../types";

const readFileAsBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Remove data URL prefix (e.g., "data:application/pdf;base64,")
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

const getSystemInstruction = (config: ReferenceConfig) => `
당신은 대한민국 최고의 영화 및 영상 자막 교정 전문가입니다.
제공되는 텍스트 파일의 내용을 한국어 맞춤법, 띄어쓰기, 고유명사 표기법에 맞춰 완벽하게 교정하십시오.

[중요: 입력 데이터 구조]
- 입력은 타임코드가 없는 순수한 텍스트 라인들의 나열입니다.
- **절대 줄바꿈(개행)을 추가하거나 삭제하지 마십시오.** 입력된 줄 수와 출력된 줄 수가 정확히 일치해야 합니다.
- 각 줄은 하나의 자막 블록에 해당합니다.

[교정 가이드]
1. **등장인물**: ${config.characters.length > 0 ? config.characters.join(', ') : '(없음)'}
   - 위 인물명은 반드시 지키고, 문맥에 맞게 처리하십시오.
2. **영화/작품**: ${config.movies.length > 0 ? config.movies.join(', ') : '(없음)'}
   - 영화 제목은 반드시 <영화제목> 형태로 홑화살괄호를 사용하여 감싸십시오. (예: <인셉션>, <다크 나이트>)
3. **맞춤법**: 한글 맞춤법과 띄어쓰기를 완벽하게 교정하십시오.
4. **마침표 삭제**: 문장 끝의 마침표(.)는 자막 가독성을 위해 제거하십시오. 물음표(?)나 느낌표(!)는 유지합니다.
5. **참고 문서**: 사용자가 별도로 첨부한 참고 문서의 내용을 바탕으로 고유명사나 맥락을 이해하십시오.

출력은 오직 교정된 텍스트만 라인별로 출력하십시오. 부연 설명은 하지 마십시오.
`;

export const processTextSegment = async (
  text: string,
  config: ReferenceConfig
): Promise<string> => {
  try {
    const apiKey = import.meta.env.VITE_API_KEY;
    if (!apiKey) {
      throw new Error("API_KEY가 설정되지 않았습니다. .env.local 파일에 VITE_API_KEY를 설정해주세요.");
    }
    const ai = new GoogleGenAI({ apiKey });

    // Prepare parts: System Instruction is set in config, but we pass reference files as contents
    const parts: any[] = [{ text: text }];

    // Process reference files
    for (const file of config.files) {
      if (file.type.includes('pdf') || file.type.includes('image')) {
        const base64 = await readFileAsBase64(file);
        parts.unshift({
          inlineData: {
            mimeType: file.type,
            data: base64
          }
        });
        parts.unshift({ text: `[참고 문서: ${file.name}]` });
      } else if (file.type.includes('text') || file.name.endsWith('.md') || file.name.endsWith('.csv')) {
        const content = await file.text();
        parts.unshift({ text: `[참고 문서 (${file.name}) 내용 시작]\n${content}\n[참고 문서 내용 끝]` });
      }
    }

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: { parts },
      config: {
        systemInstruction: getSystemInstruction(config),
        // Use thinkingLevel: 'HIGH' as requested instead of numerical budget
        thinkingConfig: {
          thinkingLevel: 'HIGH',
        } as any,
      },
    });

    return response.text?.trim() || '';
  } catch (error) {
    console.error("Gemini API Error:", error);
    throw new Error("자막 처리 중 오류가 발생했습니다.");
  }
};

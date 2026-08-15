/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE?: string;
  readonly VITE_IMG_PUBLIC_BASE?: string;
  readonly VITE_WORKER_ORIGIN?: string;
  readonly VITE_R2_PUBLIC_HOST?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module 'lunar-javascript' {
  export const Solar: {
    fromYmd: (y: number, m: number, d: number) => {
      getLunar: () => {
        toString: () => string;
        getMonthInChinese: () => string;
        getDayInChinese: () => string;
        getFestivals: () => string[];
        getOtherFestivals: () => string[];
        getDayYi: () => string[];
        getDayJi: () => string[];
        getDayNaYin?: () => string;
        getEightChar: () => unknown;
      };
    };
  };
}

/** lunar-javascript（由 main.ts 挂到 window） */
declare const Solar: {
  fromYmd: (y: number, m: number, d: number) => {
    getLunar: () => {
      toString: () => string;
      getMonthInChinese: () => string;
      getDayInChinese: () => string;
      getFestivals: () => string[];
      getOtherFestivals: () => string[];
      getDayYi: () => string[];
      getDayJi: () => string[];
      getDayNaYin?: () => string;
      getEightChar: () => unknown;
    };
  };
};

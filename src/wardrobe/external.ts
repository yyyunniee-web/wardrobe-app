/**
 * 第三方接口（天气 / AI 视觉），页面禁止直接写 fetch
 */
import { API_BASE } from '@/utils/request';

export async function fetchJson<T = unknown>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

/**
 * 视觉识别：经 Cloudflare Worker 代理（Key 仅服务端）。
 * 仍返回模型文本字符串，供 parseAIResponse 使用。
 * cfg 保留签名兼容；不再向浏览器暴露 / 依赖 apiKey。
 */
export async function callVisionAPI(
  imageDataUrl: string,
  prompt: string,
  _cfg?: { modelName?: string; apiKey?: string; apiUrl?: string },
): Promise<string> {
  const imageUrl = String(imageDataUrl || '').trim();
  const promptText = String(prompt || '').trim();
  if (!imageUrl) throw new Error('缺少图片地址');
  if (!promptText) throw new Error('缺少 prompt');

  const endpoint = `${API_BASE.replace(/\/$/, '')}/ai/vision`;
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageUrl, prompt: promptText }),
  });

  let data: { ok?: boolean; text?: string; error?: string } | null = null;
  try {
    data = (await res.json()) as { ok?: boolean; text?: string; error?: string };
  } catch {
    data = null;
  }

  if (!res.ok) {
    throw new Error((data && data.error) || `AI 代理失败 HTTP ${res.status}`);
  }
  if (!data || data.ok === false) {
    throw new Error((data && data.error) || 'AI 代理返回失败');
  }
  const text = data.text != null ? String(data.text).trim() : '';
  if (!text) throw new Error('返回内容为空');
  return text;
}

type WeatherDay = { temp: number | null; cond: string; desc: string };

export type WeatherPayload = {
  city: string;
  today: WeatherDay;
  tomorrow: WeatherDay;
  manual: boolean;
  error: boolean;
  loading: boolean;
};

const WMO_COND_MAP: Record<number, string> = {
  0: '晴',
  1: '晴',
  2: '多云',
  3: '阴',
  45: '雾',
  48: '雾',
  51: '小雨',
  53: '小雨',
  55: '小雨',
  56: '小雨',
  57: '小雨',
  61: '小雨',
  63: '中雨',
  65: '中雨',
  66: '小雨',
  67: '小雨',
  71: '小雪',
  73: '小雪',
  75: '小雪',
  77: '小雪',
  80: '小雨',
  81: '中雨',
  82: '中雨',
  85: '小雪',
  86: '小雪',
  95: '雷阵雨',
  96: '雷阵雨',
  99: '雷阵雨',
};

function wmoToCond(code: number): string {
  return WMO_COND_MAP[code] || '多云';
}

export function weatherFetchFailed(city: string): WeatherPayload {
  return {
    city: city || '北京',
    today: { temp: null, cond: '天气获取失败', desc: '' },
    tomorrow: { temp: null, cond: '天气获取失败', desc: '' },
    manual: false,
    error: true,
    loading: false,
  };
}

export async function fetchRealWeather(city: string): Promise<WeatherPayload> {
  try {
    const geoUrl =
      'https://geocoding-api.open-meteo.com/v1/search?name=' +
      encodeURIComponent(city) +
      '&count=1&language=zh&format=json';
    const geo = await fetchJson<{
      results?: Array<{ name?: string; latitude: number; longitude: number }>;
    }>(geoUrl);
    const loc = geo.results && geo.results[0];
    if (!loc) return weatherFetchFailed(city);

    const forecastUrl =
      'https://api.open-meteo.com/v1/forecast?latitude=' +
      loc.latitude +
      '&longitude=' +
      loc.longitude +
      '&current=temperature_2m,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min&forecast_days=2&timezone=auto';
    const data = await fetchJson<{
      current?: { temperature_2m?: number; weather_code?: number };
      daily?: {
        weather_code?: number[];
        temperature_2m_max?: number[];
        temperature_2m_min?: number[];
      };
    }>(forecastUrl);

    const todayTemp =
      data.current && data.current.temperature_2m != null
        ? Math.round(data.current.temperature_2m)
        : null;
    const todayCond = wmoToCond(data.current?.weather_code ?? 2);
    const tmax = data.daily?.temperature_2m_max?.[1];
    const tmin = data.daily?.temperature_2m_min?.[1];
    const tomorrowTemp =
      tmax != null && tmin != null ? Math.round((tmax + tmin) / 2) : tmax != null ? Math.round(tmax) : null;
    const tomorrowCond = wmoToCond(data.daily?.weather_code?.[1] ?? 2);

    return {
      city: loc.name || city,
      today: { temp: todayTemp, cond: todayCond, desc: '' },
      tomorrow: { temp: tomorrowTemp, cond: tomorrowCond, desc: '' },
      manual: false,
      error: false,
      loading: false,
    };
  } catch {
    return weatherFetchFailed(city);
  }
}

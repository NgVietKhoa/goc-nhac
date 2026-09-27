import { imageProxyUrl } from './api.ts';
import { img } from './format.ts';

const FALLBACK = '#2a2622';
const cache = new Map<string, string>();

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h /= 6;
  return [h, s, l];
}

function hslToHex(h: number, s: number, l: number): string {
  const f = (n: number) => {
    const k = (n + h * 12) % 12;
    const a = s * Math.min(l, 1 - l);
    const c = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(c * 255)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

/**
 * Màu chủ đạo của ảnh bìa, đã làm tối đủ để chữ #f3efe8 đọc rõ (tương phản ≥ 4.5:1).
 * Ảnh đi qua /api/image (cùng origin) để canvas đọc được pixel.
 */
export async function dominantColor(url: string | undefined): Promise<string> {
  if (!url) return FALLBACK;
  const hit = cache.get(url);
  if (hit) return hit;
  const src = imageProxyUrl(img(url, 64) ?? url);
  const color = await new Promise<string>((resolve) => {
    const image = new Image();
    image.crossOrigin = 'use-credentials';
    image.onload = () => {
      try {
        const size = 32;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) return resolve(FALLBACK);
        ctx.drawImage(image, 0, 0, size, size);
        const { data } = ctx.getImageData(0, 0, size, size);
        // Gom màu theo hue, ưu tiên điểm ảnh bão hòa (tránh nền trắng/đen chiếm ưu thế).
        const buckets = new Map<number, { w: number; r: number; g: number; b: number }>();
        for (let i = 0; i < data.length; i += 4) {
          const [h, s, l] = rgbToHsl(data[i], data[i + 1], data[i + 2]);
          if (l < 0.08 || l > 0.94) continue;
          const key = Math.round(h * 18);
          const w = 0.15 + s * s;
          const bucket = buckets.get(key) ?? { w: 0, r: 0, g: 0, b: 0 };
          bucket.w += w;
          bucket.r += data[i] * w;
          bucket.g += data[i + 1] * w;
          bucket.b += data[i + 2] * w;
          buckets.set(key, bucket);
        }
        const best = [...buckets.values()].sort((a, b) => b.w - a.w)[0];
        if (!best) return resolve(FALLBACK);
        const [h, s] = rgbToHsl(best.r / best.w, best.g / best.w, best.b / best.w);
        resolve(hslToHex(h, Math.min(s, 0.55), 0.24));
      } catch {
        resolve(FALLBACK);
      }
    };
    image.onerror = () => resolve(FALLBACK);
    image.src = src;
  });
  cache.set(url, color);
  return color;
}

import { getStroke } from 'perfect-freehand';
import type { Point, Stroke, PenStyle, ShapeKind } from '../types';

// --- 共通ユーティリティ -----------------------------------------------------

// 小さなLCG。seed固定でperlinもどきを安定させる。
const mulberry32 = (seed: number) => {
    let t = seed;
    return () => {
        t |= 0;
        t = (t + 0x6D2B79F5) | 0;
        let r = Math.imul(t ^ (t >>> 15), 1 | t);
        r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
        return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
};

// perfect-freehandに渡す入力形式。
const toInput = (points: Point[]): [number, number, number][] =>
    points.map((p) => [p.x, p.y, p.p]);

// perfect-freehandの出力をPath2Dにする。
const buildStrokePath = (outline: number[][]): Path2D | null => {
    if (outline.length === 0) return null;
    const path = new Path2D();
    const [x0, y0] = outline[0];
    path.moveTo(x0, y0);
    for (let i = 1; i < outline.length; i++) {
        const [x, y] = outline[i];
        path.lineTo(x, y);
    }
    path.closePath();
    return path;
};

// 円を1点として描く（タップ時のフォールバック）。
const dot = (ctx: CanvasRenderingContext2D, x: number, y: number, radius: number) => {
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
};

// 曲線を等間隔リサンプリングする。可愛い系ペンでスタンプを並べる用。
const resampleEqualDistance = (points: Point[], spacing: number): { x: number; y: number; angle: number }[] => {
    if (points.length < 2) {
        if (points.length === 1) return [{ x: points[0].x, y: points[0].y, angle: 0 }];
        return [];
    }
    const out: { x: number; y: number; angle: number }[] = [];
    let dist = 0;
    let next = 0;
    out.push({ x: points[0].x, y: points[0].y, angle: 0 });
    for (let i = 1; i < points.length; i++) {
        const a = points[i - 1];
        const b = points[i];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const seg = Math.hypot(dx, dy);
        if (seg === 0) continue;
        while (dist + seg >= next + spacing) {
            next += spacing;
            const t = (next - dist) / seg;
            out.push({
                x: a.x + dx * t,
                y: a.y + dy * t,
                angle: Math.atan2(dy, dx),
            });
        }
        dist += seg;
    }
    return out;
};

// --- ペン種類ごとの描画 -----------------------------------------------------

const renderNormalPen = (
    ctx: CanvasRenderingContext2D,
    points: Point[],
    color: string,
    size: number,
    opacity: number,
) => {
    const outline = getStroke(toInput(points), {
        size,
        thinning: 0.5,
        smoothing: 0.5,
        streamline: 0.5,
        simulatePressure: true,
    });
    const path = buildStrokePath(outline);
    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.fillStyle = color;
    if (path) ctx.fill(path);
    else if (points.length === 1) dot(ctx, points[0].x, points[0].y, size / 2);
    ctx.restore();
};

const renderMarker = (
    ctx: CanvasRenderingContext2D,
    points: Point[],
    color: string,
    size: number,
    opacity: number,
) => {
    const outline = getStroke(toInput(points), {
        size,
        thinning: 0,
        smoothing: 0.5,
        streamline: 0.4,
        simulatePressure: false,
    });
    const path = buildStrokePath(outline);
    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.fillStyle = color;
    if (path) ctx.fill(path);
    else if (points.length === 1) dot(ctx, points[0].x, points[0].y, size / 2);
    ctx.restore();
};

const renderHighlighter = (
    ctx: CanvasRenderingContext2D,
    points: Point[],
    color: string,
    size: number,
    preview = false,
) => {
    const outline = getStroke(toInput(points), {
        size: size * 2.5,
        thinning: 0,
        smoothing: 0.5,
        streamline: 0.5,
        simulatePressure: false,
    });
    const path = buildStrokePath(outline);
    ctx.save();
    // 本番はmultiplyで下地と混ざる蛍光ペン風。
    // プレビュー時は空canvasに描くのでmultiplyだと透明と乗算されて見えないため、通常合成の半透明で代替表示。
    if (preview) {
        ctx.globalAlpha = 0.4;
    } else {
        ctx.globalCompositeOperation = 'multiply';
        ctx.globalAlpha = 0.4;
    }
    ctx.fillStyle = color;
    if (path) ctx.fill(path);
    else if (points.length === 1) dot(ctx, points[0].x, points[0].y, size);
    ctx.restore();
};

const renderPencil = (
    ctx: CanvasRenderingContext2D,
    points: Point[],
    color: string,
    size: number,
    opacity: number,
    seed: number,
) => {
    // ジッタで複数回重ねてざらつき感を出す。
    const rand = mulberry32(seed);
    ctx.save();
    ctx.globalAlpha = opacity * 0.35;
    ctx.fillStyle = color;
    for (let pass = 0; pass < 3; pass++) {
        const jitter = pass === 0 ? 0 : (rand() - 0.5) * size * 0.3;
        const jittered = points.map((p) => ({
            x: p.x + (rand() - 0.5) * 0.6 + jitter,
            y: p.y + (rand() - 0.5) * 0.6 + jitter,
            p: p.p,
        }));
        const outline = getStroke(toInput(jittered), {
            size: size * 0.7,
            thinning: 0.6,
            smoothing: 0.3,
            streamline: 0.5,
            simulatePressure: true,
        });
        const path = buildStrokePath(outline);
        if (path) ctx.fill(path);
    }
    ctx.restore();
};

const renderCrayon = (
    ctx: CanvasRenderingContext2D,
    points: Point[],
    color: string,
    size: number,
    opacity: number,
    seed: number,
) => {
    // 太めのストロークを一度描いて、点々ノイズを乗せる。
    const outline = getStroke(toInput(points), {
        size,
        thinning: 0.3,
        smoothing: 0.4,
        streamline: 0.4,
        simulatePressure: true,
    });
    const path = buildStrokePath(outline);
    ctx.save();
    ctx.globalAlpha = opacity * 0.75;
    ctx.fillStyle = color;
    if (path) {
        ctx.fill(path);
        // パスの内側にノイズ点を打つ。小サイズでも粒感が出る。
        const rand = mulberry32(seed);
        const samples = resampleEqualDistance(points, Math.max(1, size * 0.3));
        ctx.globalAlpha = opacity * 0.5;
        ctx.fillStyle = '#ffffff';
        for (const s of samples) {
            for (let i = 0; i < 4; i++) {
                const r = (rand() - 0.5) * size * 0.9;
                const a = rand() * Math.PI * 2;
                const px = s.x + Math.cos(a) * r;
                const py = s.y + Math.sin(a) * r;
                ctx.beginPath();
                ctx.arc(px, py, size * 0.08, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    } else if (points.length === 1) {
        dot(ctx, points[0].x, points[0].y, size / 2);
    }
    ctx.restore();
};

// 星スタンプを事前にOffscreenに1回描いて使い回す。
const starCache = new Map<string, HTMLCanvasElement>();
const buildStar = (size: number, color: string): HTMLCanvasElement => {
    const key = `${size}|${color}`;
    const cached = starCache.get(key);
    if (cached) return cached;
    const c = document.createElement('canvas');
    const pad = size * 0.2;
    c.width = Math.ceil(size + pad * 2);
    c.height = Math.ceil(size + pad * 2);
    const cx = c.width / 2;
    const cy = c.height / 2;
    const outer = size / 2;
    const inner = outer * 0.45;
    const ctx = c.getContext('2d');
    if (!ctx) return c;
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
        const r = i % 2 === 0 ? outer : inner;
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const x = cx + Math.cos(a) * r;
        const y = cy + Math.sin(a) * r;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    starCache.set(key, c);
    return c;
};

const heartCache = new Map<string, HTMLCanvasElement>();
const buildHeart = (size: number, color: string): HTMLCanvasElement => {
    const key = `${size}|${color}`;
    const cached = heartCache.get(key);
    if (cached) return cached;
    const c = document.createElement('canvas');
    const pad = size * 0.2;
    c.width = Math.ceil(size + pad * 2);
    c.height = Math.ceil(size + pad * 2);
    const ctx = c.getContext('2d');
    if (!ctx) return c;
    const cx = c.width / 2;
    const cy = c.height / 2;
    const s = size / 2;
    ctx.beginPath();
    // ハートはベジェでそれっぽく。
    ctx.moveTo(cx, cy + s * 0.6);
    ctx.bezierCurveTo(cx + s * 1.2, cy + s * 0.1, cx + s * 0.6, cy - s * 0.8, cx, cy - s * 0.1);
    ctx.bezierCurveTo(cx - s * 0.6, cy - s * 0.8, cx - s * 1.2, cy + s * 0.1, cx, cy + s * 0.6);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    heartCache.set(key, c);
    return c;
};

const renderStampedPen = (
    ctx: CanvasRenderingContext2D,
    points: Point[],
    color: string,
    size: number,
    opacity: number,
    seed: number,
    buildStamp: (size: number, color: string) => HTMLCanvasElement,
    rotate = true,
) => {
    const spacing = size * 0.9;
    const samples = resampleEqualDistance(points, spacing);
    const stamp = buildStamp(size, color);
    const rand = mulberry32(seed);
    ctx.save();
    ctx.globalAlpha = opacity;
    for (const s of samples) {
        const scale = 0.85 + rand() * 0.3;
        const rot = rotate ? rand() * Math.PI * 2 : 0;
        ctx.save();
        ctx.translate(s.x, s.y);
        ctx.rotate(rot);
        ctx.scale(scale, scale);
        ctx.drawImage(stamp, -stamp.width / 2, -stamp.height / 2);
        ctx.restore();
    }
    ctx.restore();
};

const renderRainbow = (
    ctx: CanvasRenderingContext2D,
    points: Point[],
    size: number,
    opacity: number,
) => {
    // perfect-freehandの輪郭ではなく、点列を直接線分で描いて色をずらす。
    if (points.length < 1) return;
    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = size;
    if (points.length === 1) {
        ctx.fillStyle = `hsl(0, 90%, 60%)`;
        dot(ctx, points[0].x, points[0].y, size / 2);
        ctx.restore();
        return;
    }
    for (let i = 1; i < points.length; i++) {
        const hue = (i * 12) % 360;
        ctx.strokeStyle = `hsl(${hue}, 90%, 60%)`;
        ctx.beginPath();
        ctx.moveTo(points[i - 1].x, points[i - 1].y);
        ctx.lineTo(points[i].x, points[i].y);
        ctx.stroke();
    }
    ctx.restore();
};

const renderFluffy = (
    ctx: CanvasRenderingContext2D,
    points: Point[],
    color: string,
    size: number,
    opacity: number,
    seed: number,
) => {
    const rand = mulberry32(seed);
    ctx.save();
    ctx.globalAlpha = opacity * 0.45;
    ctx.fillStyle = color;
    for (let pass = 0; pass < 4; pass++) {
        const ox = (rand() - 0.5) * size * 0.6;
        const oy = (rand() - 0.5) * size * 0.6;
        const shifted = points.map((p) => ({ x: p.x + ox, y: p.y + oy, p: p.p }));
        const outline = getStroke(toInput(shifted), {
            size: size * (1 + pass * 0.1),
            thinning: 0.2,
            smoothing: 0.6,
            streamline: 0.6,
            simulatePressure: false,
        });
        const path = buildStrokePath(outline);
        if (path) ctx.fill(path);
    }
    ctx.restore();
};

const renderDot = (
    ctx: CanvasRenderingContext2D,
    points: Point[],
    color: string,
    size: number,
    opacity: number,
) => {
    const samples = resampleEqualDistance(points, size * 1.3);
    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.fillStyle = color;
    for (const s of samples) {
        ctx.beginPath();
        ctx.arc(s.x, s.y, size * 0.4, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();
};

// --- 高レベル: Strokeを描画 ------------------------------------------------

export const renderPenStroke = (
    ctx: CanvasRenderingContext2D,
    style: PenStyle,
    points: Point[],
    color: string,
    size: number,
    opacity: number,
    seed: number,
    preview = false,
) => {
    switch (style) {
        case 'normal':      renderNormalPen(ctx, points, color, size, opacity); break;
        case 'marker':      renderMarker(ctx, points, color, size, opacity); break;
        case 'highlighter': renderHighlighter(ctx, points, color, size, preview); break;
        case 'pencil':      renderPencil(ctx, points, color, size, opacity, seed); break;
        case 'crayon':      renderCrayon(ctx, points, color, size, opacity, seed); break;
        case 'sparkle':     renderStampedPen(ctx, points, color, size * 1.4, opacity, seed, buildStar); break;
        case 'heart':       renderStampedPen(ctx, points, color, size * 1.4, opacity, seed, buildHeart); break;
        case 'rainbow':     renderRainbow(ctx, points, size, opacity); break;
        case 'fluffy':      renderFluffy(ctx, points, color, size, opacity, seed); break;
        case 'dot':         renderDot(ctx, points, color, size, opacity); break;
    }
};

export const renderShape = (
    ctx: CanvasRenderingContext2D,
    shape: ShapeKind,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    color: string,
    size: number,
    filled: boolean,
) => {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = size;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (shape === 'rect') {
        const x = Math.min(x1, x2);
        const y = Math.min(y1, y2);
        const w = Math.abs(x2 - x1);
        const h = Math.abs(y2 - y1);
        if (filled) ctx.fillRect(x, y, w, h);
        else ctx.strokeRect(x, y, w, h);
    } else if (shape === 'ellipse') {
        const cx = (x1 + x2) / 2;
        const cy = (y1 + y2) / 2;
        const rx = Math.abs(x2 - x1) / 2;
        const ry = Math.abs(y2 - y1) / 2;
        ctx.beginPath();
        ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
        if (filled) ctx.fill();
        else ctx.stroke();
    } else if (shape === 'line') {
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
    } else if (shape === 'arrow') {
        const dx = x2 - x1;
        const dy = y2 - y1;
        const len = Math.hypot(dx, dy);
        if (len < 1) {
            ctx.restore();
            return;
        }
        const head = Math.max(size * 3, Math.min(len * 0.3, size * 8));
        const nx = dx / len;
        const ny = dy / len;
        // 矢印の先端より手前で線を止める。
        const ex = x2 - nx * head * 0.6;
        const ey = y2 - ny * head * 0.6;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(ex, ey);
        ctx.stroke();
        const px = -ny;
        const py = nx;
        ctx.beginPath();
        ctx.moveTo(x2, y2);
        ctx.lineTo(x2 - nx * head + px * head * 0.5, y2 - ny * head + py * head * 0.5);
        ctx.lineTo(x2 - nx * head - px * head * 0.5, y2 - ny * head - py * head * 0.5);
        ctx.closePath();
        ctx.fill();
    }
    ctx.restore();
};

export const renderText = (
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    text: string,
    size: number,
    color: string,
) => {
    ctx.save();
    ctx.font = `700 ${size}px "LINE Seed JP", sans-serif`;
    ctx.fillStyle = color;
    ctx.textBaseline = 'top';
    const lines = text.split('\n');
    const lh = size * 1.3;
    for (let i = 0; i < lines.length; i++) {
        ctx.fillText(lines[i], x, y + i * lh);
    }
    ctx.restore();
};

// モザイクはcanvas自身の内容を参照するため、srcCanvasを別で渡す。
// srcCanvasは「このモザイクより前に描かれた状態」のcanvas。
export const renderMosaic = (
    ctx: CanvasRenderingContext2D,
    srcCanvas: HTMLCanvasElement,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    block: number,
) => {
    // 範囲をcanvas内にクランプ。
    const x = Math.max(0, Math.floor(Math.min(x1, x2)));
    const y = Math.max(0, Math.floor(Math.min(y1, y2)));
    const xMax = Math.min(srcCanvas.width, Math.ceil(Math.max(x1, x2)));
    const yMax = Math.min(srcCanvas.height, Math.ceil(Math.max(y1, y2)));
    const w = xMax - x;
    const h = yMax - y;
    if (w < 1 || h < 1) return;
    const srcCtx = srcCanvas.getContext('2d');
    if (!srcCtx) return;
    const b = Math.max(2, Math.floor(block));
    // 範囲のピクセルを一括取得。ブロックごとに中央ピクセル色でfillRect。
    const img = srcCtx.getImageData(x, y, w, h);
    const data = img.data;
    for (let by = 0; by < h; by += b) {
        for (let bx = 0; bx < w; bx += b) {
            const cx = Math.min(w - 1, bx + Math.floor(b / 2));
            const cy = Math.min(h - 1, by + Math.floor(b / 2));
            const idx = (cy * w + cx) * 4;
            const r = data[idx];
            const g = data[idx + 1];
            const bl = data[idx + 2];
            ctx.fillStyle = `rgb(${r}, ${g}, ${bl})`;
            const bw = Math.min(b, w - bx);
            const bh = Math.min(b, h - by);
            ctx.fillRect(x + bx, y + by, bw, bh);
        }
    }
};

export const renderStroke = (
    ctx: CanvasRenderingContext2D,
    stroke: Stroke,
    srcCanvasForMosaic: HTMLCanvasElement,
) => {
    switch (stroke.kind) {
        case 'pen':
            renderPenStroke(ctx, stroke.style, stroke.points, stroke.color, stroke.size, stroke.opacity, stroke.seed);
            break;
        case 'text':
            renderText(ctx, stroke.x, stroke.y, stroke.text, stroke.size, stroke.color);
            break;
        case 'shape':
            renderShape(ctx, stroke.shape, stroke.x1, stroke.y1, stroke.x2, stroke.y2, stroke.color, stroke.size, stroke.filled);
            break;
        case 'mosaic':
            renderMosaic(ctx, srcCanvasForMosaic, stroke.x1, stroke.y1, stroke.x2, stroke.y2, stroke.block);
            break;
    }
};

// シーン全体を描画する。モザイクは直前までの描画結果からサンプルする必要があるため、
// 各ストローク適用後に副作用でcanvas自体が更新される運用でOK。
export const renderScene = (
    canvas: HTMLCanvasElement,
    image: HTMLImageElement | null,
    strokes: Stroke[],
) => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (image) ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    for (const stroke of strokes) {
        renderStroke(ctx, stroke, canvas);
    }
};

<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue';
import type { Point, Stroke, ToolState, ShapeKind } from '../types';
import { renderScene, renderPenStroke, renderShape } from '../lib/strokes';
import { loadImageFromFile, extractImageFromClipboard } from '../lib/image';

const props = defineProps<{
    image: HTMLImageElement | null;
    width: number;
    height: number;
    strokes: Stroke[];
    toolState: ToolState;
}>();

const emit = defineEmits<{
    (e: 'add-stroke', stroke: Stroke): void;
    (e: 'remove-strokes', keptStrokes: Stroke[]): void;
    (e: 'load-file', file: File): void;
    (e: 'load-error', message: string): void;
}>();

const containerRef = ref<HTMLDivElement | null>(null);
const baseCanvasRef = ref<HTMLCanvasElement | null>(null);
const liveCanvasRef = ref<HTMLCanvasElement | null>(null);

const isDragging = ref(false);
const isDrawing = ref(false);
const currentPoints = ref<Point[]>([]);
const shapeStart = ref<{ x: number; y: number } | null>(null);
const shapeCurrent = ref<{ x: number; y: number } | null>(null);
const textEditPos = ref<{ x: number; y: number } | null>(null);
const textEditValue = ref('');
const textAreaRef = ref<HTMLTextAreaElement | null>(null);

// ベースcanvasは「確定済みストローク+画像」のスナップショット。
const redrawBase = () => {
    const canvas = baseCanvasRef.value;
    if (!canvas) return;
    renderScene(canvas, props.image, props.strokes);
};

// プレビューcanvasをクリア。
const clearLive = () => {
    const canvas = liveCanvasRef.value;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
};

// 画像・strokes・サイズのいずれかが変われば再描画。
// 親はcommit時に新しい配列を作って差し替えるので、identityベースのwatchで足りる。
watch(
    [() => props.image, () => props.strokes, () => props.width, () => props.height],
    () => {
        nextTick(() => {
            redrawBase();
            clearLive();
        });
    },
);

onMounted(() => {
    redrawBase();
    window.addEventListener('paste', onPaste);
});

onBeforeUnmount(() => {
    window.removeEventListener('paste', onPaste);
});

// --- 座標変換 ---
const toCanvasCoord = (e: PointerEvent): Point => {
    const canvas = liveCanvasRef.value;
    if (!canvas) return { x: 0, y: 0, p: 0.5 };
    const rect = canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * canvas.width;
    const y = ((e.clientY - rect.top) / rect.height) * canvas.height;
    // マウスは筆圧0.5固定、Apple Pencil等は0..1。pressure 0は未サポートとみなす。
    const p = e.pressure > 0 && e.pressure !== 0.5 ? e.pressure : 0.5;
    return { x, y, p };
};

// --- Pointer events ---
const onPointerDown = (e: PointerEvent) => {
    if (!props.image) return;
    const tool = props.toolState.tool;
    const pos = toCanvasCoord(e);

    if (tool === 'text') {
        textEditPos.value = { x: pos.x, y: pos.y };
        textEditValue.value = '';
        nextTick(() => textAreaRef.value?.focus());
        return;
    }

    liveCanvasRef.value?.setPointerCapture(e.pointerId);
    isDrawing.value = true;

    if (tool === 'pen') {
        currentPoints.value = [pos];
        drawLivePen();
    } else if (tool === 'eraser') {
        currentPoints.value = [pos];
        applyEraserAt(pos);
    } else if (tool === 'shape' || tool === 'mosaic') {
        shapeStart.value = { x: pos.x, y: pos.y };
        shapeCurrent.value = { x: pos.x, y: pos.y };
        drawLiveShape();
    }
};

const onPointerMove = (e: PointerEvent) => {
    if (!isDrawing.value) return;
    const tool = props.toolState.tool;
    const pos = toCanvasCoord(e);

    if (tool === 'pen') {
        currentPoints.value = [...currentPoints.value, pos];
        drawLivePen();
    } else if (tool === 'eraser') {
        currentPoints.value = [...currentPoints.value, pos];
        applyEraserAt(pos);
        drawLiveEraserCursor(pos);
    } else if (tool === 'shape' || tool === 'mosaic') {
        shapeCurrent.value = { x: pos.x, y: pos.y };
        drawLiveShape();
    }
};

const onPointerUp = (e: PointerEvent) => {
    if (!isDrawing.value) return;
    liveCanvasRef.value?.releasePointerCapture(e.pointerId);
    const tool = props.toolState.tool;

    if (tool === 'pen') {
        commitPen();
    } else if (tool === 'shape' && shapeStart.value && shapeCurrent.value) {
        commitShape(props.toolState.shape);
    } else if (tool === 'mosaic' && shapeStart.value && shapeCurrent.value) {
        commitMosaic();
    }
    // eraserはpointer-move時点で即削除済みなので、追加コミット不要。

    isDrawing.value = false;
    currentPoints.value = [];
    shapeStart.value = null;
    shapeCurrent.value = null;
    clearLive();
};

// --- Live preview描画 ---
const drawLivePen = () => {
    const canvas = liveCanvasRef.value;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const t = props.toolState;
    renderPenStroke(
        ctx,
        t.penStyle,
        currentPoints.value,
        t.color,
        t.size,
        t.opacity,
        currentPenSeed,
        true, // プレビュー表示（空canvas合成のため蛍光ペンだけ特別扱い）
    );
};

const drawLiveShape = () => {
    const canvas = liveCanvasRef.value;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx || !shapeStart.value || !shapeCurrent.value) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const t = props.toolState;
    if (t.tool === 'mosaic') {
        // モザイクはプレビュー中は点線枠だけ表示する（実際のモザイクは確定後に生成）。
        ctx.save();
        ctx.strokeStyle = '#8b5cf6';
        ctx.setLineDash([6, 4]);
        ctx.lineWidth = 2;
        const x = Math.min(shapeStart.value.x, shapeCurrent.value.x);
        const y = Math.min(shapeStart.value.y, shapeCurrent.value.y);
        const w = Math.abs(shapeCurrent.value.x - shapeStart.value.x);
        const h = Math.abs(shapeCurrent.value.y - shapeStart.value.y);
        ctx.strokeRect(x, y, w, h);
        ctx.restore();
    } else {
        renderShape(
            ctx,
            t.shape,
            shapeStart.value.x,
            shapeStart.value.y,
            shapeCurrent.value.x,
            shapeCurrent.value.y,
            t.color,
            t.size,
            t.shapeFilled,
        );
    }
};

const drawLiveEraserCursor = (pos: Point) => {
    const canvas = liveCanvasRef.value;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.strokeStyle = '#8b5cf6';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, props.toolState.size, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
};

// --- コミット処理 ---
let currentPenSeed = Math.floor(Math.random() * 1_000_000);
const refreshSeed = () => {
    currentPenSeed = Math.floor(Math.random() * 1_000_000);
};

const commitPen = () => {
    if (currentPoints.value.length === 0) return;
    const t = props.toolState;
    const stroke: Stroke = {
        kind: 'pen',
        style: t.penStyle,
        color: t.color,
        size: t.size,
        opacity: t.opacity,
        points: currentPoints.value.slice(),
        seed: currentPenSeed,
    };
    emit('add-stroke', stroke);
    refreshSeed();
};

const commitShape = (shape: ShapeKind) => {
    if (!shapeStart.value || !shapeCurrent.value) return;
    const dx = shapeCurrent.value.x - shapeStart.value.x;
    const dy = shapeCurrent.value.y - shapeStart.value.y;
    if (Math.hypot(dx, dy) < 2) return;
    const t = props.toolState;
    const stroke: Stroke = {
        kind: 'shape',
        shape,
        x1: shapeStart.value.x,
        y1: shapeStart.value.y,
        x2: shapeCurrent.value.x,
        y2: shapeCurrent.value.y,
        color: t.color,
        size: t.size,
        filled: t.shapeFilled,
    };
    emit('add-stroke', stroke);
};

const commitMosaic = () => {
    if (!shapeStart.value || !shapeCurrent.value) return;
    const dx = shapeCurrent.value.x - shapeStart.value.x;
    const dy = shapeCurrent.value.y - shapeStart.value.y;
    if (Math.abs(dx) < 4 || Math.abs(dy) < 4) return;
    const t = props.toolState;
    const stroke: Stroke = {
        kind: 'mosaic',
        x1: shapeStart.value.x,
        y1: shapeStart.value.y,
        x2: shapeCurrent.value.x,
        y2: shapeCurrent.value.y,
        block: t.mosaicBlock,
    };
    emit('add-stroke', stroke);
};

// --- 消しゴム ---
const applyEraserAt = (pos: Point) => {
    const radius = props.toolState.size;
    const kept: Stroke[] = [];
    let removed = false;
    for (const stroke of props.strokes) {
        if (strokeHitsPoint(stroke, pos.x, pos.y, radius)) {
            removed = true;
            continue;
        }
        kept.push(stroke);
    }
    if (removed) emit('remove-strokes', kept);
};

const strokeHitsPoint = (stroke: Stroke, px: number, py: number, radius: number): boolean => {
    switch (stroke.kind) {
        case 'pen': {
            const r = radius + stroke.size * 0.7;
            for (const p of stroke.points) {
                if (Math.hypot(p.x - px, p.y - py) < r) return true;
            }
            return false;
        }
        case 'text': {
            const lines = stroke.text.split('\n');
            const maxLen = Math.max(1, ...lines.map((l) => l.length));
            const bw = maxLen * stroke.size * 0.6;
            const bh = lines.length * stroke.size * 1.3;
            return px >= stroke.x - radius && px <= stroke.x + bw + radius && py >= stroke.y - radius && py <= stroke.y + bh + radius;
        }
        case 'shape':
        case 'mosaic': {
            const minX = Math.min(stroke.x1, stroke.x2);
            const maxX = Math.max(stroke.x1, stroke.x2);
            const minY = Math.min(stroke.y1, stroke.y2);
            const maxY = Math.max(stroke.y1, stroke.y2);
            return px >= minX - radius && px <= maxX + radius && py >= minY - radius && py <= maxY + radius;
        }
    }
};

// --- テキスト入力確定 ---
const commitText = () => {
    if (!textEditPos.value) return;
    const text = textEditValue.value.trim();
    if (!text) {
        textEditPos.value = null;
        return;
    }
    const t = props.toolState;
    const stroke: Stroke = {
        kind: 'text',
        x: textEditPos.value.x,
        y: textEditPos.value.y,
        text,
        size: t.textSize,
        color: t.color,
    };
    emit('add-stroke', stroke);
    textEditPos.value = null;
    textEditValue.value = '';
};

const cancelText = () => {
    textEditPos.value = null;
    textEditValue.value = '';
};

const onTextKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
        e.preventDefault();
        cancelText();
    } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        commitText();
    }
};

// テキスト入力オーバーレイのCSS位置を計算する。canvas実座標→表示座標へ。
const textEditCssStyle = computed(() => {
    if (!textEditPos.value) return { display: 'none' };
    const canvas = liveCanvasRef.value;
    if (!canvas) return { display: 'none' };
    const scaleX = canvas.clientWidth / canvas.width;
    const scaleY = canvas.clientHeight / canvas.height;
    const left = textEditPos.value.x * scaleX;
    const top = textEditPos.value.y * scaleY;
    const fontSize = props.toolState.textSize * scaleY;
    return {
        left: `${left}px`,
        top: `${top}px`,
        fontSize: `${fontSize}px`,
        color: props.toolState.color,
    };
});

// --- ドラッグ&ドロップ ---
const onDragOver = (e: DragEvent) => {
    e.preventDefault();
    isDragging.value = true;
};
const onDragLeave = (e: DragEvent) => {
    e.preventDefault();
    isDragging.value = false;
};
const onDrop = (e: DragEvent) => {
    e.preventDefault();
    isDragging.value = false;
    const file = e.dataTransfer?.files?.[0];
    if (file) emit('load-file', file);
};

// --- クリップボードペースト ---
const onPaste = async (e: ClipboardEvent) => {
    // テキスト編集中はpasteをテキスト側に任せる。
    if (textEditPos.value) return;
    const file = extractImageFromClipboard(e);
    if (file) {
        e.preventDefault();
        emit('load-file', file);
        return;
    }
};

// loadImageFromFileの直接呼び出しが欲しい場合のためにexposeしておく。
defineExpose({ loadImageFromFile });
</script>

<template>
    <div
        ref="containerRef"
        class="relative mx-auto bg-gray-50 rounded-lg shadow-inner overflow-hidden"
        :class="{ 'ring-2 ring-brand-500': isDragging }"
        :style="image ? { aspectRatio: `${width}/${height}`, maxHeight: '70vh' } : { minHeight: '360px' }"
        @dragover="onDragOver"
        @dragleave="onDragLeave"
        @drop="onDrop"
    >
        <template v-if="image">
            <canvas
                ref="baseCanvasRef"
                :width="width"
                :height="height"
                class="block w-full h-full absolute inset-0 pointer-events-none"
            />
            <canvas
                ref="liveCanvasRef"
                :width="width"
                :height="height"
                class="block w-full h-full absolute inset-0 touch-none"
                :style="{ cursor: toolState.tool === 'text' ? 'text' : 'crosshair' }"
                @pointerdown="onPointerDown"
                @pointermove="onPointerMove"
                @pointerup="onPointerUp"
                @pointercancel="onPointerUp"
            />
            <!-- テキスト入力オーバーレイ -->
            <div v-if="textEditPos" class="absolute z-10" :style="textEditCssStyle">
                <textarea
                    ref="textAreaRef"
                    v-model="textEditValue"
                    rows="1"
                    class="min-w-[80px] bg-white/90 border-2 border-brand-500 rounded px-1 py-0.5 shadow font-sans resize focus:outline-none"
                    :style="{ fontSize: 'inherit', color: 'inherit' }"
                    placeholder="テキスト..."
                    @keydown="onTextKeyDown"
                />
                <div class="mt-1 flex gap-1">
                    <button
                        type="button"
                        class="text-xs bg-brand-500 text-white px-2 py-0.5 rounded hover:bg-brand-600"
                        @click="commitText"
                    >
                        確定 (⌘Enter)
                    </button>
                    <button
                        type="button"
                        class="text-xs bg-gray-200 text-gray-700 px-2 py-0.5 rounded hover:bg-gray-300"
                        @click="cancelText"
                    >
                        キャンセル
                    </button>
                </div>
            </div>
        </template>
        <template v-else>
            <div class="absolute inset-0 flex flex-col items-center justify-center text-gray-400 p-10 text-center">
                <svg class="w-16 h-16 mb-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <path d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
                <p class="text-lg font-medium">画像をここに</p>
                <p class="text-sm mt-2">ドラッグ&ドロップ / クリップボードから貼り付け (Ctrl+V) / ファイル選択</p>
            </div>
        </template>
        <!-- D&D中のオーバーレイ -->
        <div
            v-if="isDragging"
            class="absolute inset-0 z-20 flex items-center justify-center bg-brand-100/80 pointer-events-none"
        >
            <p class="text-2xl font-bold text-brand-600">ここにドロップ！</p>
        </div>
    </div>
</template>

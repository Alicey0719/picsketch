<script setup lang="ts">
import { ref, reactive, computed, onMounted, onBeforeUnmount } from 'vue';
import type { Stroke, ToolState } from './types';
import { loadImageFromFile, canvasToBlob, baseNameWithoutExt } from './lib/image';
import { renderScene } from './lib/strokes';
import SketchCanvas from './components/SketchCanvas.vue';
import Toolbar from './components/Toolbar.vue';
import PropertiesPanel from './components/PropertiesPanel.vue';

// --- 状態 ------------------------------------------------------------------

const toolState = reactive<ToolState>({
    tool: 'pen',
    penStyle: 'normal',
    color: '#ef4444',
    size: 8,
    opacity: 1.0,
    shape: 'arrow',
    shapeFilled: false,
    textSize: 32,
    mosaicBlock: 16,
});

const image = ref<HTMLImageElement | null>(null);
const imageWidth = ref(0);
const imageHeight = ref(0);
const fileName = ref('image');

// ストローク履歴はスナップショット方式。シンプルだがundo/redoが素直に書ける。
const strokes = ref<Stroke[]>([]);
const history = ref<Stroke[][]>([[]]);
const historyIndex = ref(0);

const canUndo = computed(() => historyIndex.value > 0);
const canRedo = computed(() => historyIndex.value < history.value.length - 1);

const commitStrokes = (next: Stroke[]) => {
    // redoテールを切り捨ててpush。
    history.value = history.value.slice(0, historyIndex.value + 1);
    history.value.push(next);
    historyIndex.value = history.value.length - 1;
    strokes.value = next;
};

const undo = () => {
    if (!canUndo.value) return;
    historyIndex.value -= 1;
    strokes.value = history.value[historyIndex.value];
};
const redo = () => {
    if (!canRedo.value) return;
    historyIndex.value += 1;
    strokes.value = history.value[historyIndex.value];
};
const clearAll = () => {
    if (strokes.value.length === 0) return;
    commitStrokes([]);
};

// --- ツール選択 ------------------------------------------------------------

const selectTool = (t: ToolState['tool']) => {
    toolState.tool = t;
};
const updateTool = (patch: Partial<ToolState>) => {
    Object.assign(toolState, patch);
};

// --- 画像ロード ------------------------------------------------------------

const fileInput = ref<HTMLInputElement | null>(null);
const triggerFilePick = () => fileInput.value?.click();

const onFileInputChange = async (e: Event) => {
    const target = e.target as HTMLInputElement;
    const file = target.files?.[0];
    if (file) await handleLoadFile(file);
    // 同じファイルを再度選択できるようにクリア。
    target.value = '';
};

const handleLoadFile = async (file: File) => {
    try {
        const loaded = await loadImageFromFile(file);
        image.value = loaded.image;
        imageWidth.value = loaded.width;
        imageHeight.value = loaded.height;
        fileName.value = baseNameWithoutExt(loaded.file.name);
        // 画像を差し替えたらストロークはリセット。
        strokes.value = [];
        history.value = [[]];
        historyIndex.value = 0;
    } catch (err) {
        const msg = err instanceof Error ? err.message : '画像の読み込みに失敗しました';
        alert(msg);
    }
};

// --- Stroke追加/削除 ------------------------------------------------------

const addStroke = (stroke: Stroke) => {
    commitStrokes([...strokes.value, stroke]);
};
const replaceStrokes = (kept: Stroke[]) => {
    commitStrokes(kept);
};

// --- Export ----------------------------------------------------------------

type CopyState = 'idle' | 'copying' | 'copied' | 'error';
const copyState = ref<CopyState>('idle');

// エクスポート用に元解像度で再レンダリングするcanvasを作る。
const buildExportCanvas = (): HTMLCanvasElement | null => {
    if (!image.value) return null;
    const canvas = document.createElement('canvas');
    canvas.width = imageWidth.value;
    canvas.height = imageHeight.value;
    renderScene(canvas, image.value, strokes.value);
    return canvas;
};

const downloadImage = async () => {
    const canvas = buildExportCanvas();
    if (!canvas) return;
    try {
        const blob = await canvasToBlob(canvas, 'image/png');
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${fileName.value}-sketch.png`;
        a.click();
        URL.revokeObjectURL(url);
    } catch (_error) {
        alert('ダウンロードに失敗しました');
    }
};

const copyImage = async () => {
    const canvas = buildExportCanvas();
    if (!canvas) return;
    copyState.value = 'copying';
    try {
        const blob = await canvasToBlob(canvas, 'image/png');
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        copyState.value = 'copied';
        setTimeout(() => {
            if (copyState.value === 'copied') copyState.value = 'idle';
        }, 1500);
    } catch (_error) {
        copyState.value = 'error';
        setTimeout(() => {
            if (copyState.value === 'error') copyState.value = 'idle';
        }, 1800);
    }
};

const copyLabel = computed(() => {
    switch (copyState.value) {
        case 'copied': return 'コピー済み！';
        case 'copying': return 'コピー中...';
        case 'error': return 'コピー失敗';
        default: return 'クリップボードへコピー';
    }
});

// --- キーボードショートカット ---------------------------------------------

const onKeyDown = (e: KeyboardEvent) => {
    // input/textareaにフォーカスがある場合は無視。
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
    }
    const mod = e.ctrlKey || e.metaKey;
    if (!mod) return;
    if (e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
    } else if ((e.key.toLowerCase() === 'z' && e.shiftKey) || e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
    }
};

onMounted(() => {
    window.addEventListener('keydown', onKeyDown);
});
onBeforeUnmount(() => {
    window.removeEventListener('keydown', onKeyDown);
});

const hasImage = computed(() => image.value !== null);
</script>

<template>
    <div class="p-4 md:p-6 max-w-6xl mx-auto font-sans text-gray-800">
        <header class="flex justify-between items-center mb-5">
            <div>
                <h1 class="text-2xl font-bold text-brand-600">picsketch</h1>
                <p class="text-xs text-gray-500 mt-0.5">画像にちょこっと注釈・落書き</p>
            </div>
            <div class="flex items-center gap-3 pr-1">
                <a
                    href="https://github.com/Alicey0719/picsketch"
                    target="_blank"
                    class="text-gray-500 hover:text-brand-600 transition"
                    aria-label="GitHub repository"
                    title="GitHub"
                >
                    <svg class="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 .5C5.73.5.67 5.56.67 11.83c0 5.02 3.26 9.27 7.78 10.78.57.1.78-.25.78-.55v-1.92c-3.17.69-3.84-1.53-3.84-1.53-.52-1.33-1.27-1.68-1.27-1.68-1.04-.71.08-.7.08-.7 1.15.08 1.75 1.18 1.75 1.18 1.02 1.75 2.68 1.24 3.33.95.1-.74.4-1.25.73-1.54-2.53-.29-5.2-1.27-5.2-5.65 0-1.25.44-2.27 1.17-3.07-.12-.29-.51-1.45.11-3.02 0 0 .96-.31 3.14 1.17a10.9 10.9 0 015.72 0c2.18-1.48 3.14-1.17 3.14-1.17.62 1.57.23 2.73.11 3.02.73.8 1.17 1.82 1.17 3.07 0 4.39-2.68 5.36-5.23 5.64.41.35.78 1.04.78 2.1v3.11c0 .3.21.66.79.55 4.52-1.51 7.78-5.76 7.78-10.78C23.33 5.56 18.27.5 12 .5z" />
                    </svg>
                </a>
            </div>
        </header>

        <!-- 隠しファイル入力 -->
        <input
            ref="fileInput"
            type="file"
            accept="image/*,.heic,.heif,.hif"
            class="hidden"
            @change="onFileInputChange"
        />

        <div class="grid grid-cols-1 lg:grid-cols-[180px_1fr_240px] gap-4 lg:gap-6">
            <!-- 左: ツールバー -->
            <aside class="bg-white p-3 rounded-lg shadow border order-2 lg:order-1">
                <Toolbar
                    :tool="toolState.tool"
                    :can-undo="canUndo"
                    :can-redo="canRedo"
                    :has-image="hasImage"
                    @select="selectTool"
                    @pick-file="triggerFilePick"
                    @undo="undo"
                    @redo="redo"
                    @clear="clearAll"
                />
            </aside>

            <!-- 中央: キャンバス -->
            <main class="order-1 lg:order-2 min-w-0">
                <SketchCanvas
                    :image="image"
                    :width="imageWidth"
                    :height="imageHeight"
                    :strokes="strokes"
                    :tool-state="toolState"
                    @add-stroke="addStroke"
                    @remove-strokes="replaceStrokes"
                    @load-file="handleLoadFile"
                />
                <!-- エクスポートアクション -->
                <div class="mt-4 flex flex-col sm:flex-row gap-2" :class="{ 'opacity-50 pointer-events-none': !hasImage }">
                    <button
                        type="button"
                        class="flex-1 bg-gray-700 hover:bg-gray-800 disabled:bg-gray-300 text-white font-bold py-3 px-4 rounded shadow transition"
                        :disabled="copyState === 'copying'"
                        @click="copyImage"
                    >
                        {{ copyLabel }}
                    </button>
                    <button
                        type="button"
                        class="flex-1 bg-brand-500 hover:bg-brand-600 text-white font-bold py-3 px-4 rounded shadow transition"
                        @click="downloadImage"
                    >
                        PNGでダウンロード
                    </button>
                </div>
            </main>

            <!-- 右: プロパティ -->
            <aside class="bg-white p-3 rounded-lg shadow border order-3" :class="{ 'opacity-50 pointer-events-none select-none': !hasImage }">
                <PropertiesPanel :tool-state="toolState" @update="updateTool" />
            </aside>
        </div>
    </div>
</template>

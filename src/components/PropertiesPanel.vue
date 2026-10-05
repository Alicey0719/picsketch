<script setup lang="ts">
import type { ToolState, PenStyle, ShapeKind } from '../types';

const props = defineProps<{
    toolState: ToolState;
}>();

const emit = defineEmits<{
    (e: 'update', patch: Partial<ToolState>): void;
}>();

const update = (patch: Partial<ToolState>) => emit('update', patch);

type PenDef = { style: PenStyle; label: string };
const pens: PenDef[] = [
    { style: 'normal', label: 'ノーマル' },
    { style: 'marker', label: 'マーカー' },
    { style: 'highlighter', label: '蛍光ペン' },
    { style: 'pencil', label: 'えんぴつ' },
    { style: 'crayon', label: 'クレヨン' },
    { style: 'sparkle', label: 'キラキラ' },
    { style: 'heart', label: 'ハート' },
    { style: 'rainbow', label: 'レインボー' },
    { style: 'fluffy', label: 'ふわふわ' },
    { style: 'dot', label: 'ドット' },
];

const shapes: { kind: ShapeKind; label: string }[] = [
    { kind: 'rect', label: '矩形' },
    { kind: 'ellipse', label: '楕円' },
    { kind: 'arrow', label: '矢印' },
    { kind: 'line', label: '直線' },
];

const presetColors = [
    '#111827', // ほぼ黒
    '#ffffff', // 白
    '#ef4444', // 赤
    '#f59e0b', // オレンジ
    '#eab308', // 黄
    '#22c55e', // 緑
    '#06b6d4', // シアン
    '#3b82f6', // 青
    '#8b5cf6', // 紫（brand）
    '#ec4899', // ピンク
    '#f472b6', // パステルピンク
    '#a78bfa', // パステル紫
];

const isSelectedColor = (c: string) => props.toolState.color.toLowerCase() === c.toLowerCase();
</script>

<template>
    <div class="flex flex-col gap-4">
        <!-- 色 - 全ツール共通で表示 -->
        <section v-if="toolState.tool !== 'eraser' && toolState.tool !== 'mosaic'">
            <h3 class="font-bold mb-2 border-b pb-1 text-sm">色</h3>
            <div class="grid grid-cols-6 gap-1.5">
                <button
                    v-for="c in presetColors"
                    :key="c"
                    type="button"
                    class="w-8 h-8 rounded-full border-2 shadow-sm transition"
                    :class="isSelectedColor(c) ? 'border-brand-500 ring-2 ring-brand-300' : 'border-gray-300 hover:border-gray-400'"
                    :style="{ backgroundColor: c }"
                    :title="c"
                    @click="update({ color: c })"
                />
            </div>
            <label class="mt-2 flex items-center gap-2 text-xs text-gray-600">
                <span>カスタム</span>
                <input
                    type="color"
                    :value="toolState.color"
                    class="w-8 h-8 rounded border"
                    @input="(e) => update({ color: (e.target as HTMLInputElement).value })"
                />
            </label>
        </section>

        <!-- ペンツール -->
        <section v-if="toolState.tool === 'pen'">
            <h3 class="font-bold mb-2 border-b pb-1 text-sm">ペンの種類</h3>
            <div class="grid grid-cols-2 gap-1.5">
                <button
                    v-for="p in pens"
                    :key="p.style"
                    type="button"
                    class="px-2 py-1.5 rounded border text-xs transition"
                    :class="toolState.penStyle === p.style
                        ? 'bg-brand-50 border-brand-500 ring-1 ring-brand-500 text-brand-700'
                        : 'bg-white border-gray-200 hover:bg-gray-50 text-gray-700'"
                    @click="update({ penStyle: p.style })"
                >
                    {{ p.label }}
                </button>
            </div>
        </section>

        <!-- 太さ -->
        <section v-if="toolState.tool === 'pen' || toolState.tool === 'eraser' || toolState.tool === 'shape'">
            <h3 class="font-bold mb-2 border-b pb-1 text-sm">
                {{ toolState.tool === 'eraser' ? '消しゴムサイズ' : '太さ' }}
            </h3>
            <div class="flex items-center gap-2">
                <input
                    type="range"
                    min="1"
                    max="80"
                    :value="toolState.size"
                    class="flex-1 accent-brand-500"
                    @input="(e) => update({ size: Number((e.target as HTMLInputElement).value) })"
                />
                <span class="w-8 text-right text-xs text-gray-600">{{ toolState.size }}</span>
            </div>
        </section>

        <!-- 不透明度 -->
        <section v-if="toolState.tool === 'pen'">
            <h3 class="font-bold mb-2 border-b pb-1 text-sm">不透明度</h3>
            <div class="flex items-center gap-2">
                <input
                    type="range"
                    min="0.1"
                    max="1"
                    step="0.05"
                    :value="toolState.opacity"
                    class="flex-1 accent-brand-500"
                    @input="(e) => update({ opacity: Number((e.target as HTMLInputElement).value) })"
                />
                <span class="w-10 text-right text-xs text-gray-600">{{ Math.round(toolState.opacity * 100) }}%</span>
            </div>
        </section>

        <!-- テキスト -->
        <section v-if="toolState.tool === 'text'">
            <h3 class="font-bold mb-2 border-b pb-1 text-sm">文字サイズ</h3>
            <div class="flex items-center gap-2">
                <input
                    type="range"
                    min="12"
                    max="128"
                    :value="toolState.textSize"
                    class="flex-1 accent-brand-500"
                    @input="(e) => update({ textSize: Number((e.target as HTMLInputElement).value) })"
                />
                <span class="w-8 text-right text-xs text-gray-600">{{ toolState.textSize }}</span>
            </div>
            <p class="mt-2 text-xs text-gray-500">キャンバスをクリックして入力。Ctrl+Enterで確定。</p>
        </section>

        <!-- 図形 -->
        <section v-if="toolState.tool === 'shape'">
            <h3 class="font-bold mb-2 border-b pb-1 text-sm">図形の種類</h3>
            <div class="grid grid-cols-2 gap-1.5">
                <button
                    v-for="s in shapes"
                    :key="s.kind"
                    type="button"
                    class="px-2 py-1.5 rounded border text-xs transition"
                    :class="toolState.shape === s.kind
                        ? 'bg-brand-50 border-brand-500 ring-1 ring-brand-500 text-brand-700'
                        : 'bg-white border-gray-200 hover:bg-gray-50 text-gray-700'"
                    @click="update({ shape: s.kind })"
                >
                    {{ s.label }}
                </button>
            </div>
            <label v-if="toolState.shape === 'rect' || toolState.shape === 'ellipse'" class="mt-2 flex items-center gap-2 text-xs text-gray-600">
                <input
                    type="checkbox"
                    :checked="toolState.shapeFilled"
                    class="accent-brand-500"
                    @change="(e) => update({ shapeFilled: (e.target as HTMLInputElement).checked })"
                />
                <span>塗りつぶし</span>
            </label>
        </section>

        <!-- モザイク -->
        <section v-if="toolState.tool === 'mosaic'">
            <h3 class="font-bold mb-2 border-b pb-1 text-sm">モザイクブロックサイズ</h3>
            <div class="flex items-center gap-2">
                <input
                    type="range"
                    min="4"
                    max="60"
                    :value="toolState.mosaicBlock"
                    class="flex-1 accent-brand-500"
                    @input="(e) => update({ mosaicBlock: Number((e.target as HTMLInputElement).value) })"
                />
                <span class="w-8 text-right text-xs text-gray-600">{{ toolState.mosaicBlock }}</span>
            </div>
            <p class="mt-2 text-xs text-gray-500">範囲をドラッグ指定するとモザイクが適用されます。</p>
        </section>
    </div>
</template>

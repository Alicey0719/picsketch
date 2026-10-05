<script setup lang="ts">
import type { ToolKind } from '../types';

defineProps<{
    tool: ToolKind;
    canUndo: boolean;
    canRedo: boolean;
    hasImage: boolean;
}>();

const emit = defineEmits<{
    (e: 'select', tool: ToolKind): void;
    (e: 'pick-file'): void;
    (e: 'undo'): void;
    (e: 'redo'): void;
    (e: 'clear'): void;
}>();

type ToolDef = { kind: ToolKind; label: string; icon: string };
const toolDefs: ToolDef[] = [
    { kind: 'pen', label: 'ペン', icon: 'pen' },
    { kind: 'eraser', label: '消しゴム', icon: 'eraser' },
    { kind: 'text', label: 'テキスト', icon: 'text' },
    { kind: 'shape', label: '図形', icon: 'shape' },
    { kind: 'mosaic', label: 'モザイク', icon: 'mosaic' },
];

const select = (t: ToolKind) => emit('select', t);
</script>

<template>
    <div class="flex flex-col gap-2">
        <button
            type="button"
            class="w-full bg-brand-500 hover:bg-brand-600 text-white font-bold py-2 px-3 rounded shadow transition text-sm"
            @click="emit('pick-file')"
        >
            画像を選ぶ
        </button>
        <div class="text-[11px] text-gray-500 text-center -mt-1">D&D / Ctrl+V も可</div>

        <hr class="border-gray-200 my-1" />

        <div class="flex flex-col gap-1" :class="{ 'opacity-50 pointer-events-none': !hasImage }">
            <button
                v-for="t in toolDefs"
                :key="t.kind"
                type="button"
                class="flex items-center gap-2 px-2 py-2 rounded border transition text-sm"
                :class="tool === t.kind
                    ? 'bg-brand-50 border-brand-500 ring-1 ring-brand-500 text-brand-700'
                    : 'bg-white border-gray-200 hover:bg-gray-50 text-gray-700'"
                @click="select(t.kind)"
            >
                <span class="w-5 h-5 inline-flex items-center justify-center" aria-hidden="true">
                    <!-- インラインSVGアイコン -->
                    <svg v-if="t.icon === 'pen'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-5 h-5">
                        <path d="M12 19l7-7 3 3-7 7-3-3z" /><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" /><path d="M2 2l7.586 7.586" /><circle cx="11" cy="11" r="2" />
                    </svg>
                    <svg v-else-if="t.icon === 'eraser'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-5 h-5">
                        <path d="M3 21h18" /><path d="M20 11.5l-7.5-7.5a1.5 1.5 0 00-2.12 0L3 11.38a1.5 1.5 0 000 2.12L7.5 18h5.88L20 11.5z" />
                    </svg>
                    <svg v-else-if="t.icon === 'text'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-5 h-5">
                        <path d="M4 7V4h16v3" /><path d="M9 20h6" /><path d="M12 4v16" />
                    </svg>
                    <svg v-else-if="t.icon === 'shape'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-5 h-5">
                        <rect x="3" y="3" width="10" height="10" rx="1" /><circle cx="17" cy="17" r="4" />
                    </svg>
                    <svg v-else-if="t.icon === 'mosaic'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="w-5 h-5">
                        <rect x="3" y="3" width="5" height="5" /><rect x="10" y="3" width="5" height="5" /><rect x="17" y="3" width="4" height="5" />
                        <rect x="3" y="10" width="5" height="5" /><rect x="10" y="10" width="5" height="5" /><rect x="17" y="10" width="4" height="5" />
                        <rect x="3" y="17" width="5" height="4" /><rect x="10" y="17" width="5" height="4" /><rect x="17" y="17" width="4" height="4" />
                    </svg>
                </span>
                <span>{{ t.label }}</span>
            </button>
        </div>

        <hr class="border-gray-200 my-1" />

        <div class="flex flex-col gap-1" :class="{ 'opacity-50 pointer-events-none': !hasImage }">
            <button
                type="button"
                class="px-2 py-1.5 rounded border bg-white hover:bg-gray-50 disabled:opacity-40 text-sm text-gray-700"
                :disabled="!canUndo"
                @click="emit('undo')"
                title="元に戻す (Ctrl+Z)"
            >
                ↶ 戻る
            </button>
            <button
                type="button"
                class="px-2 py-1.5 rounded border bg-white hover:bg-gray-50 disabled:opacity-40 text-sm text-gray-700"
                :disabled="!canRedo"
                @click="emit('redo')"
                title="やり直す (Ctrl+Shift+Z)"
            >
                ↷ 進む
            </button>
            <button
                type="button"
                class="px-2 py-1.5 rounded border bg-white hover:bg-gray-50 text-sm text-gray-700"
                @click="emit('clear')"
            >
                全消去
            </button>
        </div>
    </div>
</template>

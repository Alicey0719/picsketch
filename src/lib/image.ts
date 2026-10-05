import heic2any from 'heic2any';
import libheif from 'libheif-js/wasm-bundle';

export const isHeicType = (type: string) => /heic|heif/i.test(type);
export const isHeicFileName = (name: string) => /\.(heic|heif|hif)$/i.test(name);
export const isSupportedImage = (file: File) =>
    file.type.startsWith('image/') || isHeicType(file.type) || isHeicFileName(file.name);

// libheif(WASM)でHEIFをCanvasに描いてからJPEG化する。heic2anyが落ちた時のフォールバック。
const decodeHeifWithLibheif = async (file: File): Promise<File> => {
    const data = new Uint8Array(await file.arrayBuffer());
    const decoder = new libheif.HeifDecoder();
    const images = decoder.decode(data);

    if (!images || images.length === 0) throw new Error('no image');

    const image = images[0];
    const width = image.get_width();
    const height = image.get_height();

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('no context');

    const imageData = ctx.createImageData(width, height);
    await new Promise<void>((resolve, reject) => {
        image.display(imageData, (displayData: unknown) => {
            if (!displayData) {
                reject(new Error('heif display failed'));
                return;
            }
            resolve();
        });
    });

    ctx.putImageData(imageData, 0, 0);

    const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
            (b) => {
                if (!b) {
                    reject(new Error('blob failed'));
                    return;
                }
                resolve(b);
            },
            'image/jpeg',
            0.92,
        );
    });

    const name = file.name.replace(/\.(heic|heif|hif)$/i, '.jpg');
    return new File([blob], name, { type: 'image/jpeg' });
};

export const convertHeicToJpeg = async (file: File): Promise<File> => {
    try {
        const converted = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.92 });
        const blob = Array.isArray(converted) ? converted[0] : converted;
        const name = file.name.replace(/\.(heic|heif|hif)$/i, '.jpg');
        return new File([blob], name, { type: 'image/jpeg' });
    } catch (_error) {
        return decodeHeifWithLibheif(file);
    }
};

export const readAsDataUrl = (file: File): Promise<string> =>
    new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error('read failed'));
        reader.readAsDataURL(file);
    });

export const loadImageElement = (src: string): Promise<HTMLImageElement> =>
    new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('image load failed'));
        img.src = src;
    });

export const canvasToBlob = (canvas: HTMLCanvasElement, type = 'image/png'): Promise<Blob> =>
    new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
            (b) => {
                if (!b) {
                    reject(new Error('toBlob failed'));
                    return;
                }
                resolve(b);
            },
            type,
            0.95,
        );
    });

export type LoadedImage = {
    file: File;
    src: string;
    image: HTMLImageElement;
    width: number;
    height: number;
};

// 3系統の入力（ファイル選択/D&D/paste）を一つの経路に合流させる。
export const loadImageFromFile = async (file: File): Promise<LoadedImage> => {
    if (!isSupportedImage(file)) {
        throw new Error('画像ファイルのみ対応しています');
    }

    let sourceFile = file;
    const isHeic = isHeicType(file.type) || isHeicFileName(file.name);

    if (isHeic) {
        try {
            sourceFile = await convertHeicToJpeg(file);
        } catch (_error) {
            // 変換失敗。ブラウザが元ファイルを直接読めるか試す。
            try {
                const fallbackUrl = await readAsDataUrl(file);
                await loadImageElement(fallbackUrl);
                sourceFile = file;
            } catch (_fallbackError) {
                throw new Error('HEIC/HEIFの変換に失敗しました');
            }
        }
    }

    const src = await readAsDataUrl(sourceFile);
    const image = await loadImageElement(src);
    return {
        file: sourceFile,
        src,
        image,
        width: image.naturalWidth,
        height: image.naturalHeight,
    };
};

// pasteイベントから画像を取り出す。スクショ即貼り付け用途が主。
export const extractImageFromClipboard = (e: ClipboardEvent): File | null => {
    const items = e.clipboardData?.items;
    if (!items) return null;
    for (const item of items) {
        if (item.kind === 'file' && item.type.startsWith('image/')) {
            const file = item.getAsFile();
            if (file) return file;
        }
    }
    return null;
};

export const baseNameWithoutExt = (name: string): string => {
    const idx = name.lastIndexOf('.');
    return idx > 0 ? name.slice(0, idx) : name;
};

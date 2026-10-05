export type Point = { x: number; y: number; p: number };

export type PenStyle =
    | 'normal'
    | 'marker'
    | 'highlighter'
    | 'pencil'
    | 'crayon'
    | 'sparkle'
    | 'heart'
    | 'rainbow'
    | 'fluffy'
    | 'dot';

export type ShapeKind = 'rect' | 'ellipse' | 'arrow' | 'line';

export type Stroke =
    | {
        kind: 'pen';
        style: PenStyle;
        color: string;
        size: number;
        opacity: number;
        points: Point[];
        seed: number;
    }
    | {
        kind: 'text';
        x: number;
        y: number;
        text: string;
        size: number;
        color: string;
    }
    | {
        kind: 'shape';
        shape: ShapeKind;
        x1: number;
        y1: number;
        x2: number;
        y2: number;
        color: string;
        size: number;
        filled: boolean;
    }
    | {
        kind: 'mosaic';
        x1: number;
        y1: number;
        x2: number;
        y2: number;
        block: number;
    };

export type ToolKind = 'pen' | 'eraser' | 'text' | 'shape' | 'mosaic';

export type ToolState = {
    tool: ToolKind;
    penStyle: PenStyle;
    color: string;
    size: number;
    opacity: number;
    shape: ShapeKind;
    shapeFilled: boolean;
    textSize: number;
    mosaicBlock: number;
};

export type ImageMeta = {
    width: number;
    height: number;
};

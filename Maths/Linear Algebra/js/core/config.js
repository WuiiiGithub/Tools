(function (global) {
    'use strict';

    const Visuo = global.Visuo = global.Visuo || {};

    Visuo.Config = {
        INITIAL_SCALE: 50,
        MIN_SCALE: 1e-6,
        MAX_SCALE: 1e7,
        COMFORTABLE_SCALE_DIVISOR: 20,
        TARGET_GRID_SPACING: 110,
        MIN_GRID_SCREEN_SPACING: 12,
        MAX_GRID_LINES: 20,
        DESIRED_TICK_COUNT: 6,
        DEFAULT_GRID_THICKNESS: 0.6,
        MIN_GRID_THICKNESS: 0.1,
        MAX_GRID_THICKNESS: 4,
        DEFAULT_GRID_DENSITY: 1,
        MIN_GRID_DENSITY: 0.5,
        MAX_GRID_DENSITY: 2.5,
        DEFAULT_RENDER_SCOPE: 1,
        MIN_ADAPTIVE_DEPTH: 2,
        MAX_ADAPTIVE_DEPTH: 8,
        LAZY_RENDER_TOLERANCE: 3,
        FULL_RENDER_TOLERANCE: 0.15,
        VECTOR_LABEL_BASE_FONT_SIZE: 14,
        AXIS_LABEL_BASE_FONT_SIZE: 18,
        TICK_LABEL_BASE_FONT_SIZE: 12,
        MIN_FONT_SIZE: 8,
        MAX_FONT_SIZE: 36,
        PERSPECTIVE_BLUE_CLASSES: ['bg-blue-500', 'hover:bg-blue-600'],
        PERSPECTIVE_RED_CLASSES: ['bg-red-500', 'hover:bg-red-600']
    };
})(window);

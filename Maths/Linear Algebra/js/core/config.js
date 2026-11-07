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
        VECTOR_LABEL_BASE_FONT_SIZE: 14,
        AXIS_LABEL_BASE_FONT_SIZE: 18,
        TICK_LABEL_BASE_FONT_SIZE: 12,
        PERSPECTIVE_BLUE_CLASSES: ['bg-blue-500', 'hover:bg-blue-600'],
        PERSPECTIVE_RED_CLASSES: ['bg-red-500', 'hover:bg-red-600']
    };
})(window);

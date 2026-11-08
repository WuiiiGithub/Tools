(function (global) {
    'use strict';

    const Visuo = global.Visuo = global.Visuo || {};

    Visuo.State = {
        centerX: 0,
        centerY: 0,
        scale: Visuo.Config.INITIAL_SCALE,
        offsetX: 0,
        offsetY: 0,
        originalGridThickness: Visuo.Config.DEFAULT_GRID_THICKNESS,
        transformedGridThickness: Visuo.Config.DEFAULT_GRID_THICKNESS,
        originalGridDensity: Visuo.Config.DEFAULT_GRID_DENSITY,
        transformedGridDensity: Visuo.Config.DEFAULT_GRID_DENSITY,
        renderScope: Visuo.Config.DEFAULT_RENDER_SCOPE,
        tickFontSize: Visuo.Config.TICK_LABEL_BASE_FONT_SIZE,
        axisFontSize: Visuo.Config.AXIS_LABEL_BASE_FONT_SIZE,
        vectorFontSize: Visuo.Config.VECTOR_LABEL_BASE_FONT_SIZE,
        isDragging: false,
        lastMouseX: 0,
        lastMouseY: 0,
        hoveredVector: null,

        activeActivationName: 'linear',

        matrixCascade: [],
        editingMatrixId: null,

        dataset: {
            fileName: '',
            headers: [],
            rows: [],
            problemType: null,
            outputColumn: '',
            xFeature: '',
            yFeature: '',
            outputClasses: [],
            selectedClasses: [],
            labelMapping: [],
            labelEncodingRequired: false,
            encodedRows: null,
            valid: false,
            ready: false
        },

        currentEditorMatrixOriginalValues: [[1, 0], [0, 1]],
        currentEditorBias: [0, 0],
        currentEditorIsInverse: false,

        perspectiveMode: 'original',

        transformModeActive: false,
        customVectorInputCoords: [1, 1],

        draggedItem: null,
        draggedActivation: null,
        lastFocusedElement: null
    };
})(window);

(function (global) {
    'use strict';

    const Visuo = global.Visuo = global.Visuo || {};

    Visuo.State = {
        centerX: 0,
        centerY: 0,
        scale: Visuo.Config.INITIAL_SCALE,
        offsetX: 0,
        offsetY: 0,
        isDragging: false,
        lastMouseX: 0,
        lastMouseY: 0,
        hoveredVector: null,

        activeActivationName: 'linear',

        matrixCascade: [],
        editingMatrixId: null,

        currentEditorMatrixOriginalValues: [[1, 0], [0, 1]],
        currentEditorIsInverse: false,

        perspectiveMode: 'original',

        transformModeActive: false,
        customVectorInputCoords: [1, 1],

        draggedItem: null,
        lastFocusedElement: null
    };
})(window);

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
            targetXFeature: '',
            targetYFeature: '',
            outputClasses: [],
            selectedClasses: [],
            labelMapping: [],
            labelEncodingRequired: false,
            encodedRows: null,
            classColors: Visuo.Config.DEFAULT_CLASS_COLORS.slice(),
            plotPoints: [],
            loaded: false,
            loading: false,
            loadToken: 0,
            valid: false,
            ready: false
        },

        currentEditorMatrixOriginalValues: [[1, 0], [0, 1]],
        currentEditorBias: [0, 0],
        currentEditorIsInverse: false,

        perspectiveMode: 'original',
        settingsTab: 'view',

        transformModeActive: false,
        customVectorInputCoords: [1, 1],

        pointTrace: {
            active: false,
            playing: false,
            paused: false,
            finished: false,
            inputPoint: [3, 1.5],
            steps: [],
            stages: [],
            stepIndex: 0,
            stepDurationMs: Visuo.Config.POINT_TRACE_STEP_MS,
            animate: true,
            animationT: 1
        },

        selectedPointInfo: null,

        lab: {
            step: 'datahub',
            search: '',
            activeDatasetName: '',
            pendingDataset: null,
            training: {
                active: false,
                playing: false,
                complete: false,
                epoch: 0,
                epochs: 50,
                epochDurationMs: 55,
                history: [],
                model: null,
                scaler: null,
                validationSplit: 0.2,
                learningRate: 0.03,
                predictions: [],
                metrics: null,
                showPredictions: false,
                reportOpen: false,
                timer: null
            }
        },

        draggedItem: null,
        draggedActivation: null,
        lastFocusedElement: null
    };
})(window);

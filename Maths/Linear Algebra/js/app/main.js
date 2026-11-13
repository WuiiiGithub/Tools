(function (global) {
    'use strict';

    const Visuo = global.Visuo;
    const App = Visuo.App;
    const { DOM, State, Math: MathCore } = Visuo;

    function boot() {
        App.initializeCanvas();
        App.initInteractions();
        if (App.initDataSection) {
            App.initDataSection();
        }
        if (App.initLab) {
            App.initLab();
        }
        if (App.initPointTrace) {
            App.initPointTrace();
        }
        State.matrixCascade.push({
            id: MathCore.generateUniqueId(),
            type: 'matrix',
            values: [[1, 0], [0, 1]],
            bias: [0, 0],
            isInverse: false,
            enabled: true
        });
        App.renderMatrixCascade();
        App.applyPerspectiveButtonStyle();
        App.fitViewToScene();
        App.drawScene();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot, { once: true });
    } else {
        boot();
    }

    const handleCanvasResize = function () {
        const width = DOM.canvas.offsetWidth;
        const height = DOM.canvas.offsetHeight;
        if (width === DOM.canvas.width && height === DOM.canvas.height) {
            return;
        }
        App.initializeCanvas();
        if (!State.cameraInteracted) {
            App.fitViewToScene();
        }
        App.drawScene();
    };

    window.addEventListener('resize', handleCanvasResize);

    if (typeof global.ResizeObserver === 'function') {
        const canvasObserver = new global.ResizeObserver(handleCanvasResize);
        canvasObserver.observe(DOM.canvas);
    }
})(window);

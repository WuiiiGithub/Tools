(function (global) {
    'use strict';

    const Visuo = global.Visuo;
    const App = Visuo.App;
    const { State, Math: MathCore } = Visuo;

    function boot() {
        App.initializeCanvas();
        App.initInteractions();
        if (App.initDataSection) {
            App.initDataSection();
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

    window.addEventListener('resize', () => {
        App.initializeCanvas();
        App.drawScene();
    });
})(window);

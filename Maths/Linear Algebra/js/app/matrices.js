(function (global) {
    'use strict';

    const Visuo = global.Visuo = global.Visuo || {};
    const App = Visuo.App = Visuo.App || {};
    const { multiplyMatrices, calculateInverse } = Visuo.Math;

    const isActivationLayer = layer => layer && layer.type === 'activation';
    const isMatrixLayer = layer => layer && layer.type !== 'activation';

    App.isActivationLayer = isActivationLayer;
    App.isMatrixLayer = isMatrixLayer;

    App.getMatrixLayers = function () {
        return Visuo.State.matrixCascade.filter(isMatrixLayer);
    };

    App.getActivationLayers = function () {
        return Visuo.State.matrixCascade.filter(isActivationLayer);
    };

    App.hasExplicitActivationLayers = function () {
        return Visuo.State.matrixCascade.some(isActivationLayer);
    };

    const getVisualCascadeLength = function () {
        return Visuo.State.matrixCascade.length;
    };

    App.getVisualCascadeLength = getVisualCascadeLength;

    App.getLastNonlinearActivationLayer = function () {
        const cascade = Visuo.State.matrixCascade;
        const endIndex = getVisualCascadeLength();
        let result = null;

        for (let index = 0; index < endIndex; index++) {
            const layer = cascade[index];
            if (layer.enabled !== false && isActivationLayer(layer) && layer.name && layer.name !== 'linear') {
                result = layer;
            }
        }

        return result;
    };

    App.getLastNonlinearActivationName = function () {
        const layer = App.getLastNonlinearActivationLayer();
        if (layer) {
            return layer.name;
        }

        if (!App.hasExplicitActivationLayers()) {
            const legacy = Visuo.State.activeActivationName || 'linear';
            if (legacy !== 'linear') {
                return legacy;
            }
        }

        return 'linear';
    };

    const applyLayerForward = (current, layer) => {
        if (isActivationLayer(layer)) {
            if (layer.name && layer.name !== 'linear' && Visuo.Activation) {
                return Visuo.Activation.applyPoint(current, layer.name);
            }
            return current;
        }

        let currentMatrix = layer.values;
        const bias = layer.bias || [0, 0];

        if (layer.isInverse) {
            const inverse = calculateInverse(currentMatrix);
            if (!inverse) {
                return current;
            }
            currentMatrix = inverse;
        }

        const transformed = Visuo.Math.multiplyMatrixVector(currentMatrix, current);
        return [transformed[0] + bias[0], transformed[1] + bias[1]];
    };

    App.applyLayerForward = applyLayerForward;

    App.hasActivation = function (name) {
        if (App.getActivationLayers().some(layer => layer.enabled !== false && layer.name === name)) {
            return true;
        }

        return !App.hasExplicitActivationLayers() && Visuo.State.activeActivationName === name;
    };

    App.computeCumulativeMatrix = function () {
        let cumulativeMatrix = [
            [1, 0],
            [0, 1]
        ];

        Visuo.State.matrixCascade.forEach(layer => {
            if (layer.enabled === false || !isMatrixLayer(layer)) {
                return;
            }

            let currentMatrix = layer.values;
            if (layer.isInverse) {
                const inverse = calculateInverse(currentMatrix);
                if (!inverse) {
                    return;
                }
                currentMatrix = inverse;
            }

            cumulativeMatrix = multiplyMatrices(currentMatrix, cumulativeMatrix);
        });

        return cumulativeMatrix;
    };

    App.hasNonlinearActivation = function () {
        return App.getLastNonlinearActivationName() !== 'linear';
    };

    App.transformPointThroughCascade = function (point) {
        let current = [point[0], point[1]];
        const hasExplicitActivations = App.hasExplicitActivationLayers();
        const cascade = Visuo.State.matrixCascade;
        const endIndex = getVisualCascadeLength();

        for (let index = 0; index < endIndex; index++) {
            const layer = cascade[index];
            if (layer.enabled === false) {
                continue;
            }

            current = applyLayerForward(current, layer);
        }

        if (!hasExplicitActivations) {
            const cascadeActivation = Visuo.State.activeActivationName || 'linear';
            if (cascadeActivation !== 'linear' && Visuo.Activation) {
                current = Visuo.Activation.applyPoint(current, cascadeActivation);
            }
        }

        return current;
    };

    App.transformPointThroughLayersFrom = function (point, startIndex, endIndex = getVisualCascadeLength()) {
        let current = [point[0], point[1]];
        const cascade = Visuo.State.matrixCascade;
        const firstIndex = Math.max(0, startIndex || 0);

        for (let i = firstIndex; i < endIndex; i++) {
            const layer = cascade[i];
            if (layer.enabled === false) {
                continue;
            }
            current = applyLayerForward(current, layer);
        }

        return current;
    };

    App.invertPointThroughCascade = function (point) {
        let current = [point[0], point[1]];
        const hasExplicitActivations = App.hasExplicitActivationLayers();

        if (!hasExplicitActivations) {
            const cascadeActivation = Visuo.State.activeActivationName || 'linear';
            if (cascadeActivation !== 'linear' && Visuo.Activation) {
                current = Visuo.Activation.inversePoint(current, cascadeActivation);
            }
        }

        const cascade = Visuo.State.matrixCascade;
        const endIndex = getVisualCascadeLength();
        for (let i = endIndex - 1; i >= 0; i--) {
            const layer = cascade[i];
            if (layer.enabled === false) {
                continue;
            }

            if (isActivationLayer(layer)) {
                if (layer.name && layer.name !== 'linear' && Visuo.Activation) {
                    current = Visuo.Activation.inversePoint(current, layer.name);
                }
                continue;
            }

            let mat = layer.values;
            if (layer.isInverse) {
                if (!calculateInverse(mat)) {
                    continue;
                }
            } else {
                const inv = calculateInverse(mat);
                if (!inv) {
                    return null;
                }
                mat = inv;
            }

            const bias = layer.bias || [0, 0];
            current = [current[0] - bias[0], current[1] - bias[1]];
            current = Visuo.Math.multiplyMatrixVector(mat, current);
        }

        return current;
    };

    App.getCascadeJacobianDeterminant = function (point) {
        const h = 1e-5 * Math.max(1, Math.abs(point[0]), Math.abs(point[1]));
        const origin = App.transformPointThroughCascade(point);
        const alongX = App.transformPointThroughCascade([point[0] + h, point[1]]);
        const alongY = App.transformPointThroughCascade([point[0], point[1] + h]);

        const a = (alongX[0] - origin[0]) / h;
        const b = (alongY[0] - origin[0]) / h;
        const c = (alongX[1] - origin[1]) / h;
        const d = (alongY[1] - origin[1]) / h;

        return Math.abs(a * d - b * c);
    };
})(window);

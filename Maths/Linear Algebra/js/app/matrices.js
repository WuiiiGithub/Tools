(function (global) {
    'use strict';

    const Visuo = global.Visuo = global.Visuo || {};
    const App = Visuo.App = Visuo.App || {};
    const { multiplyMatrices, calculateInverse } = Visuo.Math;

    App.computeCumulativeMatrix = function () {
        let cumulativeMatrix = [
            [1, 0],
            [0, 1]
        ];

        Visuo.State.matrixCascade.forEach(matrixObj => {
            if (!matrixObj.enabled) {
                return;
            }

            let currentMatrix = matrixObj.values;
            if (matrixObj.isInverse) {
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
        return Visuo.State.activeActivationName && Visuo.State.activeActivationName !== 'linear';
    };

    App.transformPointThroughCascade = function (point) {
        let current = [point[0], point[1]];

        Visuo.State.matrixCascade.forEach(matrixObj => {
            if (!matrixObj.enabled) {
                return;
            }

            let currentMatrix = matrixObj.values;
            const bias = matrixObj.bias || [0, 0];

            if (matrixObj.isInverse) {
                const inverse = calculateInverse(currentMatrix);
                if (!inverse) {
                    return;
                }
                currentMatrix = inverse;
            }

            // 1. Weight matrix transformation: W * x
            current = Visuo.Math.multiplyMatrixVector(currentMatrix, current);

            // 2. Add bias: W * x + b
            current = [current[0] + bias[0], current[1] + bias[1]];
        });

        // 3. Activation layer applied to the entire current cascade
        const cascadeActivation = Visuo.State.activeActivationName || 'linear';
        if (cascadeActivation !== 'linear' && Visuo.Activation) {
            current = Visuo.Activation.applyPoint(current, cascadeActivation);
        }

        return current;
    };

    App.invertPointThroughCascade = function (point) {
        let current = [point[0], point[1]];

        // 1. Invert activation of the entire cascade first
        const cascadeActivation = Visuo.State.activeActivationName || 'linear';
        if (cascadeActivation !== 'linear' && Visuo.Activation) {
            current = Visuo.Activation.inversePoint(current, cascadeActivation);
        }

        // 2. Invert each layer in reverse order: x = W^-1 * (z - b)
        const cascade = Visuo.State.matrixCascade;
        for (let i = cascade.length - 1; i >= 0; i--) {
            const matrixObj = cascade[i];
            if (!matrixObj.enabled) {
                continue;
            }

            const bias = matrixObj.bias || [0, 0];

            // Subtract bias
            current = [current[0] - bias[0], current[1] - bias[1]];

            // Invert matrix
            let mat = matrixObj.values;
            if (!matrixObj.isInverse) {
                const inv = calculateInverse(mat);
                if (!inv) {
                    return null;
                }
                mat = inv;
            }
            current = Visuo.Math.multiplyMatrixVector(mat, current);
        }

        return current;
    };
})(window);

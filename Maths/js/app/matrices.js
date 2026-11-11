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
})(window);

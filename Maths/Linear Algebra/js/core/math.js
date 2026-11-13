(function (global) {
    'use strict';

    const Visuo = global.Visuo = global.Visuo || {};

    Visuo.Math = {
        clamp(value, min, max) {
            return Math.max(min, Math.min(max, value));
        },

        multiplyMatrixVector(matrix, vector) {
            return [
                matrix[0][0] * vector[0] + matrix[0][1] * vector[1],
                matrix[1][0] * vector[0] + matrix[1][1] * vector[1]
            ];
        },

        multiplyMatrices(m1, m2) {
            return [
                [
                    m1[0][0] * m2[0][0] + m1[0][1] * m2[1][0],
                    m1[0][0] * m2[0][1] + m1[0][1] * m2[1][1]
                ],
                [
                    m1[1][0] * m2[0][0] + m1[1][1] * m2[1][0],
                    m1[1][0] * m2[0][1] + m1[1][1] * m2[1][1]
                ]
            ];
        },

        calculateInverse(matrix) {
            const a = matrix[0][0];
            const b = matrix[0][1];
            const c = matrix[1][0];
            const d = matrix[1][1];
            if (![a, b, c, d].every(Number.isFinite)) {
                return null;
            }

            const determinant = a * d - b * c;
            const matrixScale = Math.max(Math.abs(a), Math.abs(b), Math.abs(c), Math.abs(d));
            const determinantThreshold = 1e-12 * matrixScale * matrixScale;

            if (matrixScale === 0 || Math.abs(determinant) < determinantThreshold || !Number.isFinite(determinant)) {
                return null;
            }

            const invDet = 1 / determinant;
            const inverse = [
                [d * invDet, -b * invDet],
                [-c * invDet, a * invDet]
            ];
            return inverse.every(row => row.every(Number.isFinite)) ? inverse : null;
        },

        getNiceStep(step) {
            if (!isFinite(step) || step <= 0) {
                return 1;
            }

            const powerOfTen = Math.pow(10, Math.floor(Math.log10(step)));
            const normalizedStep = step / powerOfTen;

            if (normalizedStep < 1.5) {
                return 1 * powerOfTen;
            }
            if (normalizedStep < 3.5) {
                return 2 * powerOfTen;
            }
            if (normalizedStep < 7.5) {
                return 5 * powerOfTen;
            }
            return 10 * powerOfTen;
        },

        isMultiple(value, step) {
            if (!isFinite(value) || !isFinite(step) || step === 0) {
                return false;
            }
            const quotient = value / step;
            return Math.abs(quotient - Math.round(quotient)) < 1e-7;
        },

        getGridStep(tickStep, targetStep) {
            if (!isFinite(tickStep) || tickStep <= 0) {
                return 1;
            }

            const candidates = [];
            const minimumCandidate = tickStep / 10;
            const maximumExponent = Math.floor(Math.log10(tickStep));

            for (let exponent = maximumExponent; exponent >= maximumExponent - 4; exponent--) {
                const powerOfTen = Math.pow(10, exponent);
                [1, 2, 5].forEach(multiplier => {
                    const candidate = multiplier * powerOfTen;
                    if (candidate < minimumCandidate * (1 - 1e-12) || candidate > tickStep * (1 + 1e-12)) {
                        return;
                    }
                    if (!Visuo.Math.isMultiple(tickStep, candidate)) {
                        return;
                    }
                    if (!candidates.some(existing => Math.abs(existing - candidate) < candidate * 1e-9)) {
                        candidates.push(candidate);
                    }
                });
            }

            if (candidates.length === 0) {
                return tickStep;
            }

            const target = isFinite(targetStep) && targetStep > 0 ? targetStep : tickStep;
            let bestCandidate = candidates[0];
            let bestDistance = Infinity;

            candidates.forEach(candidate => {
                const distance = Math.abs(Math.log(candidate / target));
                if (distance < bestDistance) {
                    bestDistance = distance;
                    bestCandidate = candidate;
                }
            });

            return bestCandidate;
        },

        formatTickLabel(value, step) {
            const decimals = Math.max(0, Math.min(8, Math.ceil(-Math.log10(step)) + 1));
            const fixed = value.toFixed(decimals);
            return fixed.includes('.') ? fixed.replace(/0+$/, '').replace(/\.$/, '') : fixed;
        },

        generateUniqueId() {
            return '_' + Math.random().toString(36).substr(2, 9);
        }
    };
})(window);

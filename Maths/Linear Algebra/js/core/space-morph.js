(function (global) {
    'use strict';

    const Visuo = global.Visuo = global.Visuo || {};
    const SpaceMorph = Visuo.SpaceMorph = Visuo.SpaceMorph || {};

    const IDENTITY_MATRIX = [
        [1, 0],
        [0, 1]
    ];

    const clampProgress = value => Visuo.Math.clamp(Number.isFinite(value) ? value : 1, 0, 1);

    const interpolatePoint = (start, end, progress) => {
        const t = clampProgress(progress);
        return [
            start[0] + (end[0] - start[0]) * t,
            start[1] + (end[1] - start[1]) * t
        ];
    };

    const interpolateMatrix = (start, end, progress) => {
        const t = clampProgress(progress);
        return [
            [
                start[0][0] + (end[0][0] - start[0][0]) * t,
                start[0][1] + (end[0][1] - start[0][1]) * t
            ],
            [
                start[1][0] + (end[1][0] - start[1][0]) * t,
                start[1][1] + (end[1][1] - start[1][1]) * t
            ]
        ];
    };

    const identityTransition = () => ({
        kind: 'identity',
        isLinear: true,
        apply(point) {
            return [point[0], point[1]];
        }
    });

    const matrixWithBiasTransition = (matrix, bias) => {
        const offset = Array.isArray(bias) ? bias : [0, 0];

        return {
            kind: 'matrix',
            isLinear: true,
            apply(point, progress) {
                const t = clampProgress(progress);
                const interpolatedMatrix = interpolateMatrix(IDENTITY_MATRIX, matrix, t);
                const transformed = Visuo.Math.multiplyMatrixVector(interpolatedMatrix, point);
                return [
                    transformed[0] + offset[0] * t,
                    transformed[1] + offset[1] * t
                ];
            }
        };
    };

    const activationTransition = name => ({
        kind: 'activation',
        isLinear: false,
        name,
        apply(point, progress) {
            if (!name || name === 'linear') {
                return [point[0], point[1]];
            }

            const activated = Visuo.Activation.applyPoint(point, name);
            return interpolatePoint(point, activated, progress);
        }
    });

    const resolveMatrix = layer => {
        if (!layer.isInverse) {
            return layer.values;
        }

        return Visuo.Math.calculateInverse(layer.values);
    };

    const createLayerTransition = layer => {
        if (!layer || layer.enabled === false) {
            return identityTransition();
        }

        if (layer.type === 'activation') {
            return activationTransition(layer.name || 'linear');
        }

        const matrix = resolveMatrix(layer);
        if (!matrix) {
            return identityTransition();
        }

        return matrixWithBiasTransition(matrix, layer.bias || [0, 0]);
    };

    const appendStage = (stages, transition, metadata = {}) => {
        const previousStage = stages[stages.length - 1];
        const stage = {
            index: stages.length,
            previousStage,
            transition,
            kind: transition.kind,
            name: transition.name || null,
            isLinear: previousStage ? previousStage.isLinear && transition.isLinear : transition.isLinear,
            label: metadata.label || 'Space',
            layer: metadata.layer || null,
            layerIndex: metadata.layerIndex ?? null
        };

        stage.mapAt = (point, progress) => {
            const previousPoint = previousStage ? previousStage.mapAt(point, 1) : point;
            return transition.apply(previousPoint, progress);
        };

        stage.map = point => stage.mapAt(point, 1);

        stages.push(stage);
        return stage;
    };

    SpaceMorph.clampProgress = clampProgress;
    SpaceMorph.interpolatePoint = interpolatePoint;
    SpaceMorph.interpolateMatrix = interpolateMatrix;

    SpaceMorph.buildStages = function (cascade, options = {}) {
        const layers = Array.isArray(cascade) ? cascade : (Visuo.State.matrixCascade || []);
        const hasExplicitActivationLayers = options.hasExplicitActivationLayers ?? (
            Visuo.App && typeof Visuo.App.hasExplicitActivationLayers === 'function'
                ? Visuo.App.hasExplicitActivationLayers()
                : layers.some(layer => layer.type === 'activation')
        );
        const activationName = options.activationName || Visuo.State.activeActivationName || 'linear';
        const stages = [];

        appendStage(stages, identityTransition(), {
            label: 'Blue input'
        });

        layers.forEach((layer, layerIndex) => {
            appendStage(stages, createLayerTransition(layer), {
                label: `Layer ${layerIndex + 1}`,
                layer,
                layerIndex
            });
        });

        if (!hasExplicitActivationLayers && activationName !== 'linear') {
            appendStage(stages, activationTransition(activationName), {
                label: `Activation: ${activationName}`
            });
        }

        return stages;
    };

    SpaceMorph.createMap = function (stage, progress) {
        if (!stage || typeof stage.mapAt !== 'function') {
            return point => [point[0], point[1]];
        }

        return point => stage.mapAt(point, progress);
    };
})(window);

(function (global) {
    'use strict';

    const Visuo = global.Visuo = global.Visuo || {};
    const App = Visuo.App = Visuo.App || {};
    const { DOM, State, Config, Math: MathCore, Activation } = Visuo;

    App.initializeCanvas = function () {
        DOM.canvas.width = DOM.canvas.offsetWidth;
        DOM.canvas.height = DOM.canvas.offsetHeight;
        State.centerX = DOM.canvas.width / 2;
        State.centerY = DOM.canvas.height / 2;
        State.scale = MathCore.clamp(State.scale, Config.MIN_SCALE, Config.MAX_SCALE);
    };

    App.applyActivationPoint = function (point, activationName = 'linear') {
        return Activation.applyPoint(point, activationName);
    };

    App.mapScenePoint = function (point, cumulativeMatrix = null, viewTransformMatrix = null) {
        let vMatrix = [
            [1, 0],
            [0, 1]
        ];
        if (Array.isArray(viewTransformMatrix)) {
            vMatrix = viewTransformMatrix;
        } else if (Array.isArray(cumulativeMatrix)) {
            vMatrix = cumulativeMatrix;
        }

        const transformed = App.transformPointThroughCascade(point);
        return MathCore.multiplyMatrixVector(vMatrix, transformed);
    };

    App.getViewTransformMatrix = function () {
        if (State.perspectiveMode !== 'transformed') {
            return [
                [1, 0],
                [0, 1]
            ];
        }

        const transformedOrigin = App.transformPointThroughCascade([0, 0]);
        const transformedIHat = App.transformPointThroughCascade([1, 0]);
        const deltaX = transformedIHat[0] - transformedOrigin[0];
        const deltaY = transformedIHat[1] - transformedOrigin[1];
        const angleOfTransformedIHat = Math.atan2(deltaY, deltaX);
        const cosTheta = Math.cos(-angleOfTransformedIHat);
        const sinTheta = Math.sin(-angleOfTransformedIHat);

        return [
            [cosTheta, -sinTheta],
            [sinTheta, cosTheta]
        ];
    };

    App.toCanvasCoords = function (x, y) {
        return {
            cx: State.centerX + x * State.scale + State.offsetX,
            cy: State.centerY - y * State.scale + State.offsetY
        };
    };

    App.toCartesianCoords = function (cx, cy) {
        return [
            (cx - State.centerX - State.offsetX) / State.scale,
            (State.centerY - cy + State.offsetY) / State.scale
        ];
    };

    App.getVisibleBounds = function (transformMatrix = null) {
        const matrix = transformMatrix || [
            [1, 0],
            [0, 1]
        ];
        const inverse = MathCore.calculateInverse(matrix);
        const corners = [
            App.toCartesianCoords(0, 0),
            App.toCartesianCoords(DOM.canvas.width, 0),
            App.toCartesianCoords(0, DOM.canvas.height),
            App.toCartesianCoords(DOM.canvas.width, DOM.canvas.height)
        ];
        const points = inverse ? corners.map(point => MathCore.multiplyMatrixVector(inverse, point)) : corners;

        return {
            minX: Math.min(...points.map(point => point[0])),
            maxX: Math.max(...points.map(point => point[0])),
            minY: Math.min(...points.map(point => point[1])),
            maxY: Math.max(...points.map(point => point[1]))
        };
    };

    App.getActiveVisibleBounds = function (cumulativeMatrix = null, viewTransformMatrix = null) {
        let vMatrix = [
            [1, 0],
            [0, 1]
        ];
        if (Array.isArray(viewTransformMatrix)) {
            vMatrix = viewTransformMatrix;
        } else if (Array.isArray(cumulativeMatrix)) {
            vMatrix = cumulativeMatrix;
        }

        const viewInverse = MathCore.calculateInverse(vMatrix);
        if (!viewInverse) {
            return App.getVisibleBounds(vMatrix);
        }

        const corners = [
            App.toCartesianCoords(0, 0),
            App.toCartesianCoords(DOM.canvas.width, 0),
            App.toCartesianCoords(0, DOM.canvas.height),
            App.toCartesianCoords(DOM.canvas.width, DOM.canvas.height)
        ];

        let canInvert = true;

        const points = corners.map(corner => {
            const current = MathCore.multiplyMatrixVector(viewInverse, corner);
            const inverted = App.invertPointThroughCascade(current);
            if (!inverted) {
                canInvert = false;
                return corner;
            }
            return inverted;
        });

        if (!canInvert) {
            return App.getVisibleBounds(vMatrix);
        }

        let bounds = {
            minX: Math.min(...points.map(point => point[0])),
            maxX: Math.max(...points.map(point => point[0])),
            minY: Math.min(...points.map(point => point[1])),
            maxY: Math.max(...points.map(point => point[1]))
        };

        if (App.hasActivation('relu')) {
            const reachX = Math.max(Math.abs(bounds.minX), Math.abs(bounds.maxX));
            const reachY = Math.max(Math.abs(bounds.minY), Math.abs(bounds.maxY));
            bounds = {
                minX: Math.min(bounds.minX, -reachX),
                maxX: Math.max(bounds.maxX, reachX),
                minY: Math.min(bounds.minY, -reachY),
                maxY: Math.max(bounds.maxY, reachY)
            };
        }

        return bounds;
    };

    App.fitViewToScene = function () {
        const datasetInputPoints = State.dataset && State.dataset.loaded && Array.isArray(State.dataset.plotPoints)
            ? State.dataset.plotPoints.map(item => item.point)
            : [];
        const inputPoints = [
            [0, 0],
            [1, 0],
            [0, 1],
            [1, 1],
            [-1, 0],
            [0, -1],
            [-1, -1]
        ].concat(datasetInputPoints);
        const transformedPoints = inputPoints.map(point => {
            return App.transformPointThroughCascade(point);
        });
        let points = transformedPoints;
        if (State.perspectiveMode === 'transformed') {
            const enabledLayers = State.matrixCascade.filter(layer => layer.enabled !== false);
            const terminalLayer = enabledLayers[enabledLayers.length - 1];
            const outputLimits = terminalLayer && App.isActivationLayer(terminalLayer)
                ? Activation.getOutputLimits(terminalLayer.name)
                : null;
            const rangePoints = outputLimits
                && Number.isFinite(outputLimits.min)
                && Number.isFinite(outputLimits.max)
                ? [
                    [outputLimits.min, outputLimits.min],
                    [outputLimits.min, outputLimits.max],
                    [outputLimits.max, outputLimits.min],
                    [outputLimits.max, outputLimits.max]
                ]
                : [];
            points = transformedPoints.concat(
                datasetInputPoints.map(point => App.transformPointThroughCascade(point)),
                rangePoints
            );
        } else if (DOM.showOriginalCheckbox && DOM.showOriginalCheckbox.checked) {
            points = (DOM.showTransformedCheckbox && DOM.showTransformedCheckbox.checked)
                ? inputPoints.concat(transformedPoints)
                : inputPoints;
        }

        if (State.perspectiveMode !== 'transformed' && App.hasActivation('relu')) {
            points = points.concat(inputPoints);
        }

        const minX = Math.min(...points.map(point => point[0]));
        const maxX = Math.max(...points.map(point => point[0]));
        const minY = Math.min(...points.map(point => point[1]));
        const maxY = Math.max(...points.map(point => point[1]));

        const centerPointX = (minX + maxX) / 2;
        const centerPointY = (minY + maxY) / 2;
        const halfSpanX = Math.max((maxX - minX) / 2, 1e-6);
        const halfSpanY = Math.max((maxY - minY) / 2, 1e-6);

        const margin = 1.25;
        const fitScaleX = (DOM.canvas.width / 2) / (halfSpanX * margin);
        const fitScaleY = (DOM.canvas.height / 2) / (halfSpanY * margin);
        const comfortableScale = Math.min(DOM.canvas.width, DOM.canvas.height) / Config.COMFORTABLE_SCALE_DIVISOR;
        const scaleLimit = !App.hasNonlinearActivation()
            ? comfortableScale * 2
            : comfortableScale * 4;
        const targetScale = Math.min(fitScaleX, fitScaleY, scaleLimit);

        State.scale = MathCore.clamp(targetScale, Config.MIN_SCALE, Config.MAX_SCALE);
        State.offsetX = -centerPointX * State.scale;
        State.offsetY = centerPointY * State.scale;
    };

    App.ensureDatasetVisible = function () {
        if (State.cameraInteracted) {
            return false;
        }
        const dataset = State.dataset;
        if (!dataset || !dataset.loaded || !Array.isArray(dataset.plotPoints) || dataset.plotPoints.length === 0) {
            return false;
        }

        const viewTransformMatrix = App.getViewTransformMatrix();
        const showOriginal = State.perspectiveMode !== 'transformed'
            && DOM.showOriginalCheckbox
            && DOM.showOriginalCheckbox.checked;
        const showTransformed = DOM.showTransformedCheckbox && DOM.showTransformedCheckbox.checked;
        if (!showOriginal && !showTransformed) {
            return false;
        }

        let visible = true;
        dataset.plotPoints.some(item => {
            const points = [];
            if (showOriginal) {
                points.push(MathCore.multiplyMatrixVector(viewTransformMatrix, item.point));
            }
            if (showTransformed) {
                points.push(MathCore.multiplyMatrixVector(
                    viewTransformMatrix,
                    App.transformPointThroughCascade(item.point)
                ));
            }

            return points.some(point => {
                const canvasPoint = App.toCanvasCoords(point[0], point[1]);
                if (!Number.isFinite(canvasPoint.cx) || !Number.isFinite(canvasPoint.cy)) {
                    return true;
                }
                if (canvasPoint.cx < 0 || canvasPoint.cx > DOM.canvas.width
                    || canvasPoint.cy < 0 || canvasPoint.cy > DOM.canvas.height) {
                    visible = false;
                    return true;
                }
                return false;
            });
        });

        if (!visible) {
            App.fitViewToScene();
        }

        return !visible;
    };

    App.getDynamicFontSize = function (baseFontSize) {
        return Math.max(baseFontSize * 0.9, Math.min(baseFontSize * 1.1, baseFontSize));
    };
})(window);

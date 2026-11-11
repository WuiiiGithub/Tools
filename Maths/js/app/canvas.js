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

    App.applyActivationPoint = function (point, activationName = State.activeActivationName) {
        return Activation.applyPoint(point, activationName);
    };

    App.mapScenePoint = function (point, cumulativeMatrix, viewTransformMatrix, activationName = State.activeActivationName) {
        const transformed = MathCore.multiplyMatrixVector(cumulativeMatrix, point);
        const activated = App.applyActivationPoint(transformed, activationName);
        return MathCore.multiplyMatrixVector(viewTransformMatrix, activated);
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

    App.getActiveVisibleBounds = function (cumulativeMatrix, viewTransformMatrix, activationName = State.activeActivationName) {
        const viewInverse = MathCore.calculateInverse(viewTransformMatrix);
        const cumulativeInverse = MathCore.calculateInverse(cumulativeMatrix);

        if (!viewInverse || !cumulativeInverse) {
            return App.getVisibleBounds(viewTransformMatrix);
        }

        const corners = [
            App.toCartesianCoords(0, 0),
            App.toCartesianCoords(DOM.canvas.width, 0),
            App.toCartesianCoords(0, DOM.canvas.height),
            App.toCartesianCoords(DOM.canvas.width, DOM.canvas.height)
        ];

        const points = corners.map(corner => {
            const activatedWorld = MathCore.multiplyMatrixVector(viewInverse, corner);
            const preActivation = activationName === 'relu'
                ? Activation.inverseCoupling(activatedWorld)
                : Activation.inversePoint(activatedWorld, activationName);
            return MathCore.multiplyMatrixVector(cumulativeInverse, preActivation);
        });

        return {
            minX: Math.min(...points.map(point => point[0])),
            maxX: Math.max(...points.map(point => point[0])),
            minY: Math.min(...points.map(point => point[1])),
            maxY: Math.max(...points.map(point => point[1]))
        };
    };

    App.fitViewToScene = function () {
        const cumulativeMatrix = App.computeCumulativeMatrix();
        const inputPoints = [
            [0, 0],
            [1, 0],
            [0, 1],
            [1, 1],
            [-1, 0],
            [0, -1],
            [-1, -1]
        ];
        const transformedPoints = inputPoints.map(point => {
            const transformed = MathCore.multiplyMatrixVector(cumulativeMatrix, point);
            return App.applyActivationPoint(transformed);
        });
        const points = State.activeActivationName === 'linear'
            ? transformedPoints
            : inputPoints.concat(transformedPoints);

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
        const scaleLimit = State.activeActivationName === 'linear'
            ? comfortableScale
            : comfortableScale * 40;
        const targetScale = Math.min(fitScaleX, fitScaleY, scaleLimit);

        State.scale = MathCore.clamp(targetScale, Config.MIN_SCALE, Config.MAX_SCALE);
        State.offsetX = -centerPointX * State.scale;
        State.offsetY = centerPointY * State.scale;
    };

    App.getDynamicFontSize = function (baseFontSize) {
        return Math.max(baseFontSize * 0.9, Math.min(baseFontSize * 1.1, baseFontSize));
    };
})(window);

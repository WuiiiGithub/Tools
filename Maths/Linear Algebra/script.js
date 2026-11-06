// Canvas and rendering context
const canvas = document.getElementById('transformationCanvas');
const ctx = canvas.getContext('2d');

// Matrix editor elements
const m00Input = document.getElementById('m00');
const m01Input = document.getElementById('m01');
const m10Input = document.getElementById('m10');
const m11Input = document.getElementById('m11');
const computeInverseBtn = document.getElementById('computeInverseBtn');
const actionButton = document.getElementById('actionButton');
const cancelEditButton = document.getElementById('cancelEditButton');
const editorTitle = document.getElementById('editorTitle');
const matrixCascadePills = document.getElementById('matrixCascadePills');
const messageBox = document.getElementById('messageBox');
const messageBoxText = messageBox.querySelector('span');
const messageBoxCloseBtn = messageBox.querySelector('.close-btn');

// Visibility checkboxes
const showOriginalCheckbox = document.getElementById('showOriginal');
const showTransformedCheckbox = document.getElementById('showTransformed');

// Modal and view controls
const appShell = document.getElementById('appShell');
const controlsModal = document.getElementById('controlsModal');
const controlsPanel = document.getElementById('controlsPanel');
const controlsBody = document.getElementById('controlsBody');
const controlsBackdrop = document.getElementById('controlsBackdrop');
const openControlsBtn = document.getElementById('openControlsBtn');
const closeControlsBtn = document.getElementById('closeControlsBtn');
const doneControlsBtn = document.getElementById('doneControlsBtn');
const perspectiveToggleBtn = document.getElementById('perspectiveToggleBtn');

// Mobile restriction
const mobileNotice = document.getElementById('mobileNotice');
const mobileMediaQuery = window.matchMedia('(max-width: 767px)');

// Transform mode elements
const transformModeToggle = document.getElementById('transformModeToggle');
const customVectorInputsDiv = document.getElementById('customVectorInputs');
const customVectorXInput = document.getElementById('customVectorX');
const customVectorYInput = document.getElementById('customVectorY');
const vectorInfoBox = document.getElementById('vectorInfoBox');

// Canvas view state
let centerX, centerY;
const INITIAL_SCALE = 50;
let scale = INITIAL_SCALE;
let offsetX = 0;
let offsetY = 0;
let isDragging = false;
let lastMouseX, lastMouseY;
let hoveredVector = null;

const MIN_SCALE = 1e-6;
const MAX_SCALE = 1e7;
const COMFORTABLE_SCALE_DIVISOR = 20;
const TARGET_GRID_SPACING = 80;
const MAX_GRID_LINES = 240;
const DESIRED_TICK_COUNT = 6;

const VECTOR_LABEL_BASE_FONT_SIZE = 14;
const AXIS_LABEL_BASE_FONT_SIZE = 18;
const TICK_LABEL_BASE_FONT_SIZE = 12;

// Cascade state
let matrixCascade = [];
let editingMatrixId = null;

// Editor state
let currentEditorMatrixOriginalValues = [[1, 0], [0, 1]];
let currentEditorIsInverse = false;

// View mode state
let perspectiveMode = 'original';
const PERSPECTIVE_BLUE_CLASSES = ['bg-blue-500', 'hover:bg-blue-600'];
const PERSPECTIVE_RED_CLASSES = ['bg-red-500', 'hover:bg-red-600'];

// Transform mode state
let transformModeActive = false;
let customVectorInputCoords = [1, 1];

// Drag and drop state
let draggedItem = null;

/**
 * Displays a message in the message box.
 * @param {string} message - The message to display.
 * @param {string} type - 'error' or 'info'.
 */
function showMessage(message, type = 'info') {
    messageBoxText.textContent = message;
    messageBox.classList.remove(
        'hidden',
        'bg-red-50', 'border-red-500', 'text-red-700',
        'bg-blue-50', 'border-blue-500', 'text-blue-700'
    );
    messageBox.classList.add('flex');

    if (type === 'error') {
        messageBox.classList.add('bg-red-50', 'border-red-500', 'text-red-700');
    } else {
        messageBox.classList.add('bg-blue-50', 'border-blue-500', 'text-blue-700');
    }

    messageBoxCloseBtn.onclick = hideMessage;
}

/**
 * Hides the message box.
 */
function hideMessage() {
    messageBox.classList.add('hidden');
    messageBox.classList.remove('flex');
}

/**
 * Shows the vector info box with the provided markup and position.
 * @param {string} html - Markup to display.
 * @param {number} left - Left offset in pixels.
 * @param {number} top - Top offset in pixels.
 */
function showVectorInfoBox(html, left, top) {
    vectorInfoBox.innerHTML = html;
    vectorInfoBox.style.left = `${left}px`;
    vectorInfoBox.style.top = `${top}px`;
    vectorInfoBox.classList.remove('hidden');
    vectorInfoBox.classList.add('flex');
}

/**
 * Hides the vector info box.
 */
function hideVectorInfoBox() {
    vectorInfoBox.classList.add('hidden');
    vectorInfoBox.classList.remove('flex');
}

/**
 * Resolves a vector's coordinates in the basis matching the active perspective.
 * @param {number[]} vectorInXY - The vector expressed in the standard (X, Y) basis.
 * @param {number[][]} cumulativeMatrix - The cumulative transform from (X, Y) to (X1, X2).
 * @returns {{basis: string, coordinates: number[]|null}} The active basis and coordinates.
 */
function getPerspectiveCoordinates(vectorInXY, cumulativeMatrix) {
    if (perspectiveMode === 'original') {
        return { basis: 'X, Y', coordinates: vectorInXY };
    }

    const inverseCumulative = calculateInverse(cumulativeMatrix);
    if (!inverseCumulative) {
        return { basis: 'X1, X2', coordinates: null };
    }

    return { basis: 'X1, X2', coordinates: multiplyMatrixVector(inverseCumulative, vectorInXY) };
}

/**
 * Builds the markup shown when hovering a vector arrow tip.
 * @param {string} label - The vector's display label.
 * @param {string} colorClass - Tailwind text color class for the coordinates.
 * @param {number[]} vectorInXY - The vector expressed in the standard (X, Y) basis.
 * @param {number[][]} cumulativeMatrix - The cumulative transform from (X, Y) to (X1, X2).
 * @returns {string} The info box markup.
 */
function buildVectorInfoMarkup(label, colorClass, vectorInXY, cumulativeMatrix) {
    const { basis, coordinates } = getPerspectiveCoordinates(vectorInXY, cumulativeMatrix);
    const coordinatesLine = coordinates
        ? `<span class="font-bold ${colorClass}">(${basis}) = (${coordinates[0].toFixed(2)}, ${coordinates[1].toFixed(2)})</span>`
        : `<span class="font-bold text-gray-500">(${basis}) unavailable (singular transform)</span>`;

    return `<span class="font-semibold text-gray-700">Vector ${label}</span>${coordinatesLine}`;
}

/**
 * Generates a unique ID for matrix pills.
 * @returns {string} A unique ID string.
 */
function generateUniqueId() {
    return '_' + Math.random().toString(36).substr(2, 9);
}

/**
 * Calculates a dynamic font size based on the current scale.
 * @param {number} baseFontSize - The base font size for scaling.
 * @returns {number} - The dynamically calculated font size.
 */
function getDynamicFontSize(baseFontSize) {
    return Math.max(baseFontSize * 0.9, Math.min(baseFontSize * 1.1, baseFontSize));
}

/**
 * Initializes canvas dimensions and drawing parameters.
 */
function initializeCanvas() {
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
    centerX = canvas.width / 2;
    centerY = canvas.height / 2;
    scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, scale));
}

/**
 * Computes the cumulative transformation matrix from all enabled matrices.
 * @returns {number[][]} The cumulative 2x2 matrix.
 */
function computeCumulativeMatrix() {
    let cumulativeMatrix = [
        [1, 0],
        [0, 1]
    ];

    matrixCascade.forEach(matrixObj => {
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
}

/**
 * Frames the original and transformed basis vectors within the canvas.
 */
function fitViewToScene() {
    const cumulativeMatrix = computeCumulativeMatrix();
    const transformedIHat = multiplyMatrixVector(cumulativeMatrix, [1, 0]);
    const transformedJHat = multiplyMatrixVector(cumulativeMatrix, [0, 1]);
    const points = [
        [1, 0],
        [0, 1],
        [1, 1],
        transformedIHat,
        transformedJHat,
        [transformedIHat[0] + transformedJHat[0], transformedIHat[1] + transformedJHat[1]]
    ];

    let extentX = 1;
    let extentY = 1;
    points.forEach(point => {
        extentX = Math.max(extentX, Math.abs(point[0]));
        extentY = Math.max(extentY, Math.abs(point[1]));
    });

    const margin = 1.25;
    const fitScaleX = (canvas.width / 2) / (extentX * margin);
    const fitScaleY = (canvas.height / 2) / (extentY * margin);
    const comfortableScale = Math.min(canvas.width, canvas.height) / COMFORTABLE_SCALE_DIVISOR;
    const targetScale = Math.min(fitScaleX, fitScaleY, comfortableScale);

    scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, targetScale));
    offsetX = 0;
    offsetY = 0;
}

/**
 * Converts Cartesian coordinates to canvas coordinates.
 * @param {number} x - Cartesian X coordinate.
 * @param {number} y - Cartesian Y coordinate.
 * @returns {object} - Object with cx and cy.
 */
function toCanvasCoords(x, y) {
    return {
        cx: centerX + x * scale + offsetX,
        cy: centerY - y * scale + offsetY
    };
}

/**
 * Converts canvas coordinates to Cartesian coordinates.
 * @param {number} cx - Canvas X coordinate.
 * @param {number} cy - Canvas Y coordinate.
 * @returns {number[]} - Array with Cartesian [x, y].
 */
function toCartesianCoords(cx, cy) {
    const x = (cx - centerX - offsetX) / scale;
    const y = (centerY - cy + offsetY) / scale;
    return [x, y];
}

/**
 * Multiplies a 2x2 matrix by a 2D vector.
 * @param {number[][]} matrix - The 2x2 matrix [[a, b], [c, d]].
 * @param {number[]} vector - The 2D vector [x, y].
 * @returns {number[]} - The transformed vector [x', y'].
 */
function multiplyMatrixVector(matrix, vector) {
    const x = vector[0];
    const y = vector[1];
    const m00 = matrix[0][0];
    const m01 = matrix[0][1];
    const m10 = matrix[1][0];
    const m11 = matrix[1][1];

    const transformedX = m00 * x + m01 * y;
    const transformedY = m10 * x + m11 * y;
    return [transformedX, transformedY];
}

/**
 * Multiplies two 2x2 matrices.
 * @param {number[][]} m1 - The first 2x2 matrix.
 * @param {number[][]} m2 - The second 2x2 matrix.
 * @returns {number[][]} The resulting 2x2 matrix (m1 * m2).
 */
function multiplyMatrices(m1, m2) {
    const result = [
        [0, 0],
        [0, 0]
    ];
    result[0][0] = m1[0][0] * m2[0][0] + m1[0][1] * m2[1][0];
    result[0][1] = m1[0][0] * m2[0][1] + m1[0][1] * m2[1][1];
    result[1][0] = m1[1][0] * m2[0][0] + m1[1][1] * m2[1][0];
    result[1][1] = m1[1][0] * m2[0][1] + m1[1][1] * m2[1][1];
    return result;
}

/**
 * Calculates the inverse of a 2x2 matrix.
 * @param {number[][]} matrix - The 2x2 matrix [[a, b], [c, d]].
 * @returns {number[][]|null} The inverse matrix or null if singular.
 */
function calculateInverse(matrix) {
    const a = matrix[0][0];
    const b = matrix[0][1];
    const c = matrix[1][0];
    const d = matrix[1][1];

    const determinant = a * d - b * c;
    const matrixScale = Math.max(Math.abs(a), Math.abs(b), Math.abs(c), Math.abs(d));

    if (matrixScale === 0 || Math.abs(determinant) < 1e-12 * matrixScale * matrixScale) {
        return null;
    }

    const invDet = 1 / determinant;

    return [
        [d * invDet, -b * invDet],
        [-c * invDet, a * invDet]
    ];
}

/**
 * Draws a vector from the origin to a given point on the canvas.
 */
function drawVector(context, vector, color, lineWidth = 3, label = null) {
    const startCartesian = [0, 0];
    const endCartesian = [vector[0], vector[1]];

    const startCanvas = toCanvasCoords(startCartesian[0], startCartesian[1]);
    const endCanvas = toCanvasCoords(endCartesian[0], endCartesian[1]);

    context.beginPath();
    context.moveTo(startCanvas.cx, startCanvas.cy);
    context.lineTo(endCanvas.cx, endCanvas.cy);
    context.strokeStyle = color;
    context.lineWidth = lineWidth;
    context.stroke();

    const angle = Math.atan2(vector[1], vector[0]);
    const dynamicArrowSize = Math.max(4, Math.min(16, 8 * (scale / INITIAL_SCALE)));
    const arrowAngleOffset = Math.PI / 6;

    context.beginPath();
    context.moveTo(endCanvas.cx, endCanvas.cy);
    context.lineTo(endCanvas.cx - dynamicArrowSize * Math.cos(angle - arrowAngleOffset), endCanvas.cy + dynamicArrowSize * Math.sin(angle - arrowAngleOffset));
    context.moveTo(endCanvas.cx, endCanvas.cy);
    context.lineTo(endCanvas.cx - dynamicArrowSize * Math.cos(angle + arrowAngleOffset), endCanvas.cy + dynamicArrowSize * Math.sin(angle + arrowAngleOffset));
    context.strokeStyle = color;
    context.lineWidth = lineWidth;
    context.stroke();

    if (label) {
        const dynamicFontSize = getDynamicFontSize(VECTOR_LABEL_BASE_FONT_SIZE);
        context.fillStyle = color;
        context.font = `bold ${dynamicFontSize}px Inter`;

        const labelOffsetDist = dynamicFontSize * 1.5;
        let labelX = endCanvas.cx;
        let labelY = endCanvas.cy;

        context.textAlign = 'center';
        context.textBaseline = 'middle';

        switch (label) {
            case 'X':
                labelX = endCanvas.cx;
                labelY = endCanvas.cy + labelOffsetDist;
                break;
            case 'Y':
                labelX = endCanvas.cx - labelOffsetDist;
                labelY = endCanvas.cy;
                context.textAlign = 'right';
                break;
            case 'X1':
                labelX = endCanvas.cx + labelOffsetDist * Math.cos(angle);
                labelY = endCanvas.cy + labelOffsetDist * Math.sin(angle);

                if (angle > -Math.PI / 4 && angle <= Math.PI / 4) {
                    context.textAlign = 'left';
                } else if (angle > Math.PI / 4 && angle <= 3 * Math.PI / 4) {
                    context.textBaseline = 'bottom';
                } else if (angle > 3 * Math.PI / 4 || angle <= -3 * Math.PI / 4) {
                    context.textAlign = 'right';
                } else {
                    context.textBaseline = 'top';
                }
                break;
            case 'X2':
                const perpendicularOffset = dynamicFontSize * 0.8;
                const offsetAngle = angle + Math.PI / 2;
                labelX = endCanvas.cx + perpendicularOffset * Math.cos(offsetAngle);
                labelY = endCanvas.cy + perpendicularOffset * Math.sin(offsetAngle);

                if (labelX > endCanvas.cx) {
                    context.textAlign = 'left';
                } else {
                    context.textAlign = 'right';
                }
                if (labelY > endCanvas.cy) {
                    context.textBaseline = 'top';
                } else {
                    context.textBaseline = 'bottom';
                }
                break;
            default:
                labelX = endCanvas.cx + labelOffsetDist * Math.cos(angle);
                labelY = endCanvas.cy + labelOffsetDist * Math.sin(angle);
                break;
        }
        context.fillText(label, labelX, labelY);
    }
}

/**
 * Calculates a "nice" step (1, 2, 5 × 10^n) for a raw step value.
 * @param {number} step - The raw step value.
 * @returns {number} - The rounded nice step.
 */
function getNiceStep(step) {
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
}

/**
 * Chooses a grid step that divides the tick step and stays near the target spacing.
 * @param {number} tickStep - The step between labelled ticks.
 * @param {number} targetStep - The ideal unlabelled grid step.
 * @returns {number} The grid step.
 */
function getGridStep(tickStep, targetStep) {
    const subdivisions = Math.max(1, Math.min(10, Math.round(tickStep / targetStep)));
    return tickStep / subdivisions;
}

/**
 * Computes the visible bounds in the input coordinate space of a transform.
 * @param {number[][]} [transformMatrix=null] - Matrix mapping input space to view space.
 * @returns {{minX: number, maxX: number, minY: number, maxY: number}} Visible bounds.
 */
function getVisibleBounds(transformMatrix = null) {
    const matrix = transformMatrix || [
        [1, 0],
        [0, 1]
    ];
    const inverse = calculateInverse(matrix);
    const corners = [
        toCartesianCoords(0, 0),
        toCartesianCoords(canvas.width, 0),
        toCartesianCoords(0, canvas.height),
        toCartesianCoords(canvas.width, canvas.height)
    ];
    const points = inverse ? corners.map(point => multiplyMatrixVector(inverse, point)) : corners;

    return {
        minX: Math.min(...points.map(point => point[0])),
        maxX: Math.max(...points.map(point => point[0])),
        minY: Math.min(...points.map(point => point[1])),
        maxY: Math.max(...points.map(point => point[1]))
    };
}

/**
 * Draws an adaptive grid on the canvas.
 * @param {CanvasRenderingContext2D} context - The 2D rendering context.
 * @param {string} color - The color of the grid lines.
 * @param {number} lineWidth - The width of the grid lines.
 * @param {number[][]} [transformMatrix=null] - Matrix mapping input space to view space.
 */
function drawGrid(context, color, lineWidth, transformMatrix = null) {
    context.strokeStyle = color;
    context.lineWidth = lineWidth;

    const matrix = transformMatrix || [
        [1, 0],
        [0, 1]
    ];
    const xDirection = multiplyMatrixVector(matrix, [1, 0]);
    const yDirection = multiplyMatrixVector(matrix, [0, 1]);
    const xLength = Math.hypot(xDirection[0], xDirection[1]) || 1e-9;
    const yLength = Math.hypot(yDirection[0], yDirection[1]) || 1e-9;

    const bounds = getVisibleBounds(transformMatrix);
    const spanX = bounds.maxX - bounds.minX;
    const spanY = bounds.maxY - bounds.minY;
    const tickStepX = getNiceStep(spanX / DESIRED_TICK_COUNT);
    const tickStepY = getNiceStep(spanY / DESIRED_TICK_COUNT);

    let stepX = getGridStep(tickStepX, TARGET_GRID_SPACING / (scale * xLength));
    let stepY = getGridStep(tickStepY, TARGET_GRID_SPACING / (scale * yLength));

    if (spanX / stepX > MAX_GRID_LINES) {
        stepX = getNiceStep(spanX / MAX_GRID_LINES);
    }
    if (spanY / stepY > MAX_GRID_LINES) {
        stepY = getNiceStep(spanY / MAX_GRID_LINES);
    }

    const startX = Math.floor(bounds.minX / stepX) * stepX;
    const endX = Math.ceil(bounds.maxX / stepX) * stepX;
    const startY = Math.floor(bounds.minY / stepY) * stepY;
    const endY = Math.ceil(bounds.maxY / stepY) * stepY;

    for (let x = startX; x <= endX; x += stepX) {
        const p1 = multiplyMatrixVector(matrix, [x, bounds.minY]);
        const p2 = multiplyMatrixVector(matrix, [x, bounds.maxY]);
        const start = toCanvasCoords(p1[0], p1[1]);
        const end = toCanvasCoords(p2[0], p2[1]);
        context.beginPath();
        context.moveTo(start.cx, start.cy);
        context.lineTo(end.cx, end.cy);
        context.stroke();
    }

    for (let y = startY; y <= endY; y += stepY) {
        const p1 = multiplyMatrixVector(matrix, [bounds.minX, y]);
        const p2 = multiplyMatrixVector(matrix, [bounds.maxX, y]);
        const start = toCanvasCoords(p1[0], p1[1]);
        const end = toCanvasCoords(p2[0], p2[1]);
        context.beginPath();
        context.moveTo(start.cx, start.cy);
        context.lineTo(end.cx, end.cy);
        context.stroke();
    }
}

/**
 * Draws the X and Y axes (or their transformed versions).
 */
function drawAxes(context, color, lineWidth, transformMatrix = null, drawXYLabels = false) {
    context.strokeStyle = color;
    context.lineWidth = lineWidth;

    const matrix = transformMatrix || [
        [1, 0],
        [0, 1]
    ];
    const bounds = getVisibleBounds(transformMatrix);
    const margin = Math.max(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY) * 0.05 + 1;

    const xStart = multiplyMatrixVector(matrix, [bounds.minX - margin, 0]);
    const xEnd = multiplyMatrixVector(matrix, [bounds.maxX + margin, 0]);
    const yStart = multiplyMatrixVector(matrix, [0, bounds.minY - margin]);
    const yEnd = multiplyMatrixVector(matrix, [0, bounds.maxY + margin]);

    let start = toCanvasCoords(xStart[0], xStart[1]);
    let end = toCanvasCoords(xEnd[0], xEnd[1]);
    context.beginPath();
    context.moveTo(start.cx, start.cy);
    context.lineTo(end.cx, end.cy);
    context.stroke();

    start = toCanvasCoords(yStart[0], yStart[1]);
    end = toCanvasCoords(yEnd[0], yEnd[1]);
    context.beginPath();
    context.moveTo(start.cx, start.cy);
    context.lineTo(end.cx, end.cy);
    context.stroke();

    if (drawXYLabels) {
        const dynamicFontSize = getDynamicFontSize(AXIS_LABEL_BASE_FONT_SIZE);
        context.fillStyle = '#4a5568';
        context.font = `bold ${dynamicFontSize}px Inter`;
        context.textAlign = 'center';
        context.textBaseline = 'middle';

        const xDirection = multiplyMatrixVector(matrix, [1, 0]);
        const yDirection = multiplyMatrixVector(matrix, [0, 1]);
        const xLength = Math.hypot(xDirection[0], xDirection[1]) || 1e-9;
        const yLength = Math.hypot(yDirection[0], yDirection[1]) || 1e-9;
        const pad = dynamicFontSize;

        const xLabelView = multiplyMatrixVector(matrix, [bounds.maxX - dynamicFontSize / (scale * xLength), 0]);
        const xLabelCanvas = toCanvasCoords(xLabelView[0], xLabelView[1]);
        context.fillText(
            'X',
            Math.min(canvas.width - pad, Math.max(pad, xLabelCanvas.cx)),
            Math.min(canvas.height - pad, Math.max(pad, xLabelCanvas.cy))
        );

        const yLabelView = multiplyMatrixVector(matrix, [0, bounds.maxY - dynamicFontSize / (scale * yLength)]);
        const yLabelCanvas = toCanvasCoords(yLabelView[0], yLabelView[1]);
        context.fillText(
            'Y',
            Math.min(canvas.width - pad, Math.max(pad, yLabelCanvas.cx)),
            Math.min(canvas.height - pad, Math.max(pad, yLabelCanvas.cy))
        );
    }
}

/**
 * Formats a tick value with enough precision for the given step.
 * @param {number} value - The tick value.
 * @param {number} step - The tick step.
 * @returns {string} The formatted label.
 */
function formatTickLabel(value, step) {
    const decimals = Math.max(0, Math.min(8, Math.ceil(-Math.log10(step)) + 1));
    const fixed = value.toFixed(decimals);
    return fixed.includes('.') ? fixed.replace(/0+$/, '').replace(/\.$/, '') : fixed;
}

/**
 * Draws numerical tick marks and their labels along the axes.
 */
function drawTicksAndLabels(context, color, transformMatrix = null) {
    const dynamicFontSize = getDynamicFontSize(TICK_LABEL_BASE_FONT_SIZE);
    context.fillStyle = color;
    context.font = `${dynamicFontSize}px Inter`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    const tickLength = 4;
    const labelOffset = dynamicFontSize * 1.5;

    const matrix = transformMatrix || [
        [1, 0],
        [0, 1]
    ];
    const originCanvasCoords = toCanvasCoords(0, 0);
    const minDistanceForLabel = dynamicFontSize * 1.5;

    const bounds = getVisibleBounds(transformMatrix);
    const tickStepX = getNiceStep((bounds.maxX - bounds.minX) / DESIRED_TICK_COUNT);
    const tickStepY = getNiceStep((bounds.maxY - bounds.minY) / DESIRED_TICK_COUNT);

    const firstTickX = Math.floor(bounds.minX / tickStepX);
    const lastTickX = Math.ceil(bounds.maxX / tickStepX);
    const firstTickY = Math.floor(bounds.minY / tickStepY);
    const lastTickY = Math.ceil(bounds.maxY / tickStepY);

    for (let k = firstTickX; k <= lastTickX; k++) {
        const i = k * tickStepX;
        if (Math.abs(i) < tickStepX * 1e-6) continue;

        const transformedPointX = multiplyMatrixVector(matrix, [i, 0]);
        const pX = toCanvasCoords(transformedPointX[0], transformedPointX[1]);

        if (pX.cx > 0 && pX.cx < canvas.width && pX.cy > 0 && pX.cy < canvas.height) {
            context.beginPath();
            context.moveTo(pX.cx, pX.cy - tickLength);
            context.lineTo(pX.cx, pX.cy + tickLength);
            context.strokeStyle = color;
            context.lineWidth = 1;
            context.stroke();

            if (Math.sqrt(Math.pow(pX.cx - originCanvasCoords.cx, 2) + Math.pow(pX.cy - originCanvasCoords.cy, 2)) > minDistanceForLabel) {
                context.fillText(formatTickLabel(i, tickStepX), pX.cx, pX.cy + labelOffset);
            }
        }
    }

    for (let k = firstTickY; k <= lastTickY; k++) {
        const i = k * tickStepY;
        if (Math.abs(i) < tickStepY * 1e-6) continue;

        const transformedPointY = multiplyMatrixVector(matrix, [0, i]);
        const pY = toCanvasCoords(transformedPointY[0], transformedPointY[1]);

        if (pY.cx > 0 && pY.cx < canvas.width && pY.cy > 0 && pY.cy < canvas.height) {
            context.beginPath();
            context.moveTo(pY.cx - tickLength, pY.cy);
            context.lineTo(pY.cx + tickLength, pY.cy);
            context.strokeStyle = color;
            context.lineWidth = 1;
            context.stroke();

            if (Math.sqrt(Math.pow(pY.cx - originCanvasCoords.cx, 2) + Math.pow(pY.cy - originCanvasCoords.cy, 2)) > minDistanceForLabel) {
                context.fillText(formatTickLabel(i, tickStepY), pY.cx - labelOffset, pY.cy);
            }
        }
    }
}

/**
 * Draws projection lines from a vector's tip to the standard X and Y axes.
 */
function drawProjectionLines(context, vector, color) {
    context.strokeStyle = color;
    context.lineWidth = 1.5;
    context.setLineDash([5, 5]);

    const endPoint = toCanvasCoords(vector[0], vector[1]);
    const projXPoint = toCanvasCoords(vector[0], 0);
    const projYPoint = toCanvasCoords(0, vector[1]);

    context.beginPath();
    context.moveTo(endPoint.cx, endPoint.cy);
    context.lineTo(projXPoint.cx, endPoint.cy);
    context.stroke();

    context.beginPath();
    context.moveTo(endPoint.cx, endPoint.cy);
    context.lineTo(endPoint.cx, projYPoint.cy);
    context.stroke();

    context.setLineDash([]);
}

/**
 * Checks if mouse coordinates are near a given canvas point.
 */
function isNearCanvasPoint(mouseCx, mouseCy, targetCanvasCoords, pixelThreshold) {
    const dx = mouseCx - targetCanvasCoords.cx;
    const dy = mouseCy - targetCanvasCoords.cy;
    return Math.sqrt(dx * dx + dy * dy) < pixelThreshold;
}

/**
 * Draws a small black dot at the origin.
 */
function drawOriginDot(context, color) {
    const originCanvas = toCanvasCoords(0, 0);
    context.beginPath();
    context.arc(originCanvas.cx, originCanvas.cy, 5, 0, Math.PI * 2);
    context.fillStyle = color;
    context.fill();
    context.closePath();
}

/**
 * Renders the matrix pills in the cascade display area.
 */
function renderMatrixCascade() {
    matrixCascadePills.innerHTML = '';

    if (matrixCascade.length === 0) {
        matrixCascadePills.innerHTML = '<p class="text-sm text-gray-500">No matrices added yet. Start with an Identity Matrix!</p>';
    }

    matrixCascade.forEach((matrix, index) => {
        const pill = document.createElement('div');
        const pillTone = matrix.isInverse
            ? 'border-red-300 bg-pink-100 text-red-900'
            : 'border-sky-300 bg-sky-100 text-sky-900';
        pill.className = `matrix-pill group relative flex cursor-grab items-center justify-between gap-2.5 rounded-lg border px-4 py-2.5 text-sm shadow-sm ${pillTone}`;
        pill.dataset.id = matrix.id;
        pill.dataset.index = index;
        pill.draggable = true;

        const matrixValues = matrix.values;
        const editButtonTone = matrix.isInverse
            ? 'bg-orange-400 hover:bg-orange-500'
            : 'bg-blue-500 hover:bg-blue-600';

        pill.innerHTML = `
            <input type="checkbox" class="enable-toggle absolute left-2 top-2 z-[5] h-[18px] w-[18px] cursor-pointer accent-emerald-500" data-id="${matrix.id}" ${matrix.enabled ? 'checked' : ''} title="${matrix.enabled ? 'Disable Matrix' : 'Enable Matrix'}">
            <div class="flex grow flex-col pl-6">
                <p class="font-semibold text-gray-700">M<sub>${index + 1}</sub>${matrix.isInverse ? ' (Inverse)' : ''}</p>
                <div class="grid grid-cols-[repeat(2,auto)] gap-x-2.5 gap-y-1 font-mono font-bold">
                    <span>[${matrixValues[0][0].toFixed(3)}</span><span>${matrixValues[0][1].toFixed(3)}]</span>
                    <span>[${matrixValues[1][0].toFixed(3)}</span><span>${matrixValues[1][1].toFixed(3)}]</span>
                </div>
            </div>
            <div class="pointer-events-none absolute right-2.5 top-1/2 flex -translate-y-1/2 flex-col gap-1 opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100 focus-within:pointer-events-auto focus-within:opacity-100">
                <button class="duplicate-btn flex items-center justify-center rounded-md bg-blue-500 p-1 leading-none text-white transition-colors hover:bg-blue-600" data-id="${matrix.id}" title="Duplicate Matrix">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                        <path d="M4 1.5H14a.5.5 0 0 1 .5.5v10a.5.5 0 0 1-.5.5h-10A.5.5 0 0 1 3.5 12V2a.5.5 0 0 1 .5-.5zM14 2H4v10h10V2z"/>
                        <path d="M2 3.5a.5.5 0 0 1 .5-.5H12a.5.5 0 0 1 .5.5V13a.5.5 0 0 1-.5.5H2.5a.5.5 0 0 1-.5-.5V3.5zM2.5 4H12v9H2.5V4z"/>
                    </svg>
                </button>
                <button class="edit-btn flex items-center justify-center rounded-md p-1 leading-none text-white transition-colors ${editButtonTone}" data-id="${matrix.id}" title="Edit Matrix">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                        <path d="M15.502 1.94a.5.5 0 0 1 0 .706L14.459 3.69l-2-2L13.502.646a.5.5 0 0 1 .707 0l1.293 1.293zm-1.75 2.456-2-2L4.939 9.21a.5.5 0 0 0-.121.196l-.805 2.414a.25.25 0 0 0 .316.316l2.414-.805a.5.5 0 0 0 .196-.121l6.04-6.04zm-2.76-3.695L13.19 1.714l-1.01-1.01-.757.757-.707-.707.707-.707 1.01-1.01z"/>
                        <path fill-rule="evenodd" d="M1 13.5A1.5 1.5 0 0 0 2.5 15h11a1.5 1.5 0 0 0 1.5-1.5v-6a.5.5 0 0 0-1 0v6a.5.5 0 0 1-.5.5h-11a.5.5 0 0 1-.5-.5v-11a.5.5 0 0 1 .5-.5H9a.5.5 0 0 0 0-1H2.5A1.5 1.5 0 0 0 1 2.5v11z"/>
                    </svg>
                </button>
                <button class="delete-btn flex items-center justify-center rounded-md bg-red-500 p-1 leading-none text-white transition-colors hover:bg-red-600" data-id="${matrix.id}" title="Delete Matrix">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                        <path d="M6.5 1h3a.5.5 0 0 1 .5.5v1H6v-1a.5.5 0 0 1 .5-.5ZM11 2.5v-1A1.5 1.5 0 0 0 9.5 0h-3A1.5 1.5 0 0 0 5 1.5v1H2.5a.5.5 0 0 0 0 1h.5V14a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V3.5h.5a.5.5 0 0 0 0-1H11ZM4.5 3h7A.5.5 0 0 1 12 3.5v10.5a1 1 0 0 1-1 1h-7a1 1 0 0 1-1-1V3.5a.5.5 0 0 1 .5-.5Z"/>
                    </svg>
                </button>
            </div>
        `;
        matrixCascadePills.appendChild(pill);
    });

    matrixCascadePills.querySelectorAll('.duplicate-btn').forEach(button => {
        button.addEventListener('click', (e) => duplicateMatrix(e.currentTarget.dataset.id));
    });
    matrixCascadePills.querySelectorAll('.edit-btn').forEach(button => {
        button.addEventListener('click', (e) => editMatrix(e.currentTarget.dataset.id));
    });
    matrixCascadePills.querySelectorAll('.delete-btn').forEach(button => {
        button.addEventListener('click', (e) => deleteMatrix(e.currentTarget.dataset.id));
    });
    matrixCascadePills.querySelectorAll('.enable-toggle').forEach(checkbox => {
        checkbox.addEventListener('change', (e) => toggleMatrixEnabled(e.currentTarget.dataset.id, e.currentTarget.checked));
    });
}

/**
 * Toggles the enabled state of a matrix in the cascade and redraws.
 */
function toggleMatrixEnabled(id, enabled) {
    const matrix = matrixCascade.find(m => m.id === id);
    if (matrix) {
        matrix.enabled = enabled;
        fitViewToScene();
        drawScene();
    }
}

/**
 * Updates the editor input fields based on the current editor state.
 */
function updateEditorInputsFromState() {
    hideMessage();
    if (currentEditorIsInverse) {
        const inverse = calculateInverse(currentEditorMatrixOriginalValues);
        if (inverse) {
            m00Input.value = inverse[0][0].toFixed(3);
            m01Input.value = inverse[0][1].toFixed(3);
            m10Input.value = inverse[1][0].toFixed(3);
            m11Input.value = inverse[1][1].toFixed(3);
        } else {
            currentEditorIsInverse = false;
            m00Input.value = currentEditorMatrixOriginalValues[0][0].toFixed(3);
            m01Input.value = currentEditorMatrixOriginalValues[0][1].toFixed(3);
            m10Input.value = currentEditorMatrixOriginalValues[1][0].toFixed(3);
            m11Input.value = currentEditorMatrixOriginalValues[1][1].toFixed(3);
            showMessage("Cannot compute inverse: Matrix is singular (determinant is zero or near zero). Displaying original values.", "error");
        }
    } else {
        m00Input.value = currentEditorMatrixOriginalValues[0][0].toFixed(3);
        m01Input.value = currentEditorMatrixOriginalValues[0][1].toFixed(3);
        m10Input.value = currentEditorMatrixOriginalValues[1][0].toFixed(3);
        m11Input.value = currentEditorMatrixOriginalValues[1][1].toFixed(3);
    }
}

/**
 * Resets the matrix editor to "Add New Matrix" mode.
 */
function resetEditor() {
    editingMatrixId = null;
    editorTitle.innerHTML = 'Define New Matrix M<sub>i</sub>:';
    actionButton.textContent = 'Add Matrix to Cascade';
    actionButton.removeEventListener('click', updateMatrix);
    actionButton.addEventListener('click', addMatrix);
    cancelEditButton.classList.add('hidden');

    currentEditorMatrixOriginalValues = [[1, 0], [0, 1]];
    currentEditorIsInverse = false;
    updateEditorInputsFromState();
    hideMessage();
}

/**
 * Adds a new matrix to the cascade from the current editor values.
 */
function addMatrix() {
    const m00 = parseFloat(m00Input.value);
    const m01 = parseFloat(m01Input.value);
    const m10 = parseFloat(m10Input.value);
    const m11 = parseFloat(m11Input.value);

    const newMatrix = {
        id: generateUniqueId(),
        values: [[m00, m01], [m10, m11]],
        isInverse: currentEditorIsInverse,
        enabled: true
    };

    matrixCascade.push(newMatrix);
    renderMatrixCascade();
    fitViewToScene();
    drawScene();
    resetEditor();
}

/**
 * Populates the editor with values of a matrix selected for editing.
 */
function editMatrix(id) {
    const matrixToEdit = matrixCascade.find(m => m.id === id);
    if (matrixToEdit) {
        editingMatrixId = id;
        editorTitle.innerHTML = `Edit Matrix M<sub>${matrixCascade.indexOf(matrixToEdit) + 1}</sub>:`;
        actionButton.textContent = 'Update Matrix in Cascade';
        actionButton.removeEventListener('click', addMatrix);
        actionButton.addEventListener('click', updateMatrix);
        cancelEditButton.classList.remove('hidden');

        currentEditorMatrixOriginalValues = JSON.parse(JSON.stringify(matrixToEdit.values));
        currentEditorIsInverse = matrixToEdit.isInverse;
        updateEditorInputsFromState();
        hideMessage();
    }
}

/**
 * Updates the matrix currently being edited in the cascade.
 */
function updateMatrix() {
    const matrixIndex = matrixCascade.findIndex(m => m.id === editingMatrixId);
    if (matrixIndex !== -1) {
        const m00 = parseFloat(m00Input.value);
        const m01 = parseFloat(m01Input.value);
        const m10 = parseFloat(m10Input.value);
        const m11 = parseFloat(m11Input.value);

        if (currentEditorIsInverse) {
            const inverseOfCurrentInput = calculateInverse([[m00, m01], [m10, m11]]);
            if (inverseOfCurrentInput) {
                matrixCascade[matrixIndex].values = inverseOfCurrentInput;
            } else {
                showMessage("Cannot update: Current values in editor are singular, cannot revert to original. Please adjust values.", "error");
                return;
            }
        } else {
            matrixCascade[matrixIndex].values = [[m00, m01], [m10, m11]];
        }

        matrixCascade[matrixIndex].isInverse = currentEditorIsInverse;

        renderMatrixCascade();
        fitViewToScene();
        drawScene();
        resetEditor();
    }
}

/**
 * Deletes a matrix from the cascade.
 */
function deleteMatrix(id) {
    matrixCascade = matrixCascade.filter(m => m.id !== id);
    renderMatrixCascade();
    fitViewToScene();
    drawScene();
    if (editingMatrixId === id) {
        resetEditor();
    }
}

/**
 * Duplicates a matrix and adds it to the cascade.
 */
function duplicateMatrix(id) {
    const matrixToDuplicate = matrixCascade.find(m => m.id === id);
    if (matrixToDuplicate) {
        const newMatrix = {
            id: generateUniqueId(),
            values: JSON.parse(JSON.stringify(matrixToDuplicate.values)),
            isInverse: matrixToDuplicate.isInverse,
            enabled: matrixToDuplicate.enabled
        };
        matrixCascade.push(newMatrix);
        renderMatrixCascade();
        fitViewToScene();
        drawScene();
        showMessage("Matrix duplicated!", "info");
    }
}

/**
 * Computes the inverse of the current matrix in the input fields and displays it.
 */
function computeAndDisplayInverse() {
    const potentialInverse = calculateInverse(currentEditorMatrixOriginalValues);

    if (potentialInverse) {
        currentEditorIsInverse = !currentEditorIsInverse;
        updateEditorInputsFromState();
        showMessage(currentEditorIsInverse ? "Inverse computed and displayed." : "Displaying original matrix.", "info");
    } else {
        showMessage("Cannot compute inverse: Matrix is singular (determinant is zero or near zero).", "error");
    }
    drawScene();
}

/**
 * Draws the entire scene: original grid/vectors and transformed grid/vectors.
 */
function drawScene() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const cumulativeMatrix = computeCumulativeMatrix();

    let viewTransformMatrix = [
        [1, 0],
        [0, 1]
    ];

    const transformedIHatGlobal = multiplyMatrixVector(cumulativeMatrix, [1, 0]);

    if (perspectiveMode === 'transformed') {
        const angleOfTransformedIHat = Math.atan2(transformedIHatGlobal[1], transformedIHatGlobal[0]);
        const cosTheta = Math.cos(-angleOfTransformedIHat);
        const sinTheta = Math.sin(-angleOfTransformedIHat);
        viewTransformMatrix = [
            [cosTheta, -sinTheta],
            [sinTheta, cosTheta]
        ];
    }

    const iHat = [1, 0];
    const jHat = [0, 1];

    const iHatView = multiplyMatrixVector(viewTransformMatrix, iHat);
    const jHatView = multiplyMatrixVector(viewTransformMatrix, jHat);

    const transformedJHatGlobal = multiplyMatrixVector(cumulativeMatrix, jHat);
    const transformedIHatView = multiplyMatrixVector(viewTransformMatrix, transformedIHatGlobal);
    const transformedJHatView = multiplyMatrixVector(viewTransformMatrix, transformedJHatGlobal);

    if (showOriginalCheckbox.checked) {
        drawGrid(ctx, '#93c5fd', 0.75, viewTransformMatrix);
        drawAxes(ctx, '#60a5fa', 2, viewTransformMatrix, true);
        drawTicksAndLabels(ctx, '#60a5fa', viewTransformMatrix);
        drawVector(ctx, iHatView, '#3b82f6', 4, 'X');
        drawVector(ctx, jHatView, '#3b82f6', 4, 'Y');

        if (hoveredVector === 'X') {
            drawProjectionLines(ctx, iHatView, '#3b82f6');
        } else if (hoveredVector === 'Y') {
            drawProjectionLines(ctx, jHatView, '#3b82f6');
        }
    }

    if (showTransformedCheckbox.checked) {
        const combinedTransformMatrix = multiplyMatrices(viewTransformMatrix, cumulativeMatrix);
        drawGrid(ctx, '#f87171', 0.5, combinedTransformMatrix);
        drawAxes(ctx, '#f87171', 1.5, combinedTransformMatrix);
        drawTicksAndLabels(ctx, '#f87171', combinedTransformMatrix);
        drawVector(ctx, transformedIHatView, '#dc2626', 4, 'X1');
        drawVector(ctx, transformedJHatView, '#dc2626', 4, 'X2');

        if (hoveredVector === 'X1') {
            drawProjectionLines(ctx, transformedIHatView, '#dc2626');
        } else if (hoveredVector === 'X2') {
            drawProjectionLines(ctx, transformedJHatView, '#dc2626');
        }
    }

    let customVectorInOriginalBasis = null;
    let customVectorInOriginalBasisView = null;

    if (transformModeActive) {
        const customVecInTransformedBasis = [
            parseFloat(customVectorXInput.value) || 0,
            parseFloat(customVectorYInput.value) || 0
        ];

        customVectorInOriginalBasis = multiplyMatrixVector(cumulativeMatrix, customVecInTransformedBasis);
        customVectorInOriginalBasisView = multiplyMatrixVector(viewTransformMatrix, customVectorInOriginalBasis);

        drawVector(ctx, customVectorInOriginalBasisView, '#8b5cf6', 4, null);
    }

    let hoveredVectorDetails = null;

    if (hoveredVector === 'X' && showOriginalCheckbox.checked) {
        hoveredVectorDetails = { label: 'X', color: 'text-blue-600', view: iHatView, basisVector: iHat };
    } else if (hoveredVector === 'Y' && showOriginalCheckbox.checked) {
        hoveredVectorDetails = { label: 'Y', color: 'text-blue-600', view: jHatView, basisVector: jHat };
    } else if (hoveredVector === 'X1' && showTransformedCheckbox.checked) {
        hoveredVectorDetails = { label: 'X1', color: 'text-red-600', view: transformedIHatView, basisVector: transformedIHatGlobal };
    } else if (hoveredVector === 'X2' && showTransformedCheckbox.checked) {
        hoveredVectorDetails = { label: 'X2', color: 'text-red-600', view: transformedJHatView, basisVector: transformedJHatGlobal };
    } else if (hoveredVector === 'custom' && transformModeActive && customVectorInOriginalBasisView) {
        hoveredVectorDetails = { label: 'Custom', color: 'text-purple-600', view: customVectorInOriginalBasisView, basisVector: customVectorInOriginalBasis };
    }

    if (hoveredVectorDetails) {
        const endPointCanvas = toCanvasCoords(hoveredVectorDetails.view[0], hoveredVectorDetails.view[1]);
        showVectorInfoBox(
            buildVectorInfoMarkup(hoveredVectorDetails.label, hoveredVectorDetails.color, hoveredVectorDetails.basisVector, cumulativeMatrix),
            endPointCanvas.cx + 10,
            endPointCanvas.cy + 10
        );
    } else {
        hideVectorInfoBox();
    }

    drawOriginDot(ctx, '#000000');
}

/**
 * Applies the active perspective mode styling to the perspective toggle button.
 */
function applyPerspectiveButtonStyle() {
    if (perspectiveMode === 'transformed') {
        perspectiveToggleBtn.classList.remove(...PERSPECTIVE_BLUE_CLASSES);
        perspectiveToggleBtn.classList.add(...PERSPECTIVE_RED_CLASSES);
        perspectiveToggleBtn.title = 'Current View: Transformed X1 Basis';
    } else {
        perspectiveToggleBtn.classList.remove(...PERSPECTIVE_RED_CLASSES);
        perspectiveToggleBtn.classList.add(...PERSPECTIVE_BLUE_CLASSES);
        perspectiveToggleBtn.title = 'Current View: Original XY Basis';
    }
}

// Editor controls
actionButton.addEventListener('click', addMatrix);
cancelEditButton.addEventListener('click', resetEditor);
computeInverseBtn.addEventListener('click', computeAndDisplayInverse);

// Visibility controls
showOriginalCheckbox.addEventListener('change', drawScene);
showTransformedCheckbox.addEventListener('change', drawScene);

// Perspective control
perspectiveToggleBtn.addEventListener('click', () => {
    perspectiveMode = perspectiveMode === 'original' ? 'transformed' : 'original';
    applyPerspectiveButtonStyle();
    drawScene();
});

// Transform mode controls
transformModeToggle.addEventListener('change', () => {
    transformModeActive = transformModeToggle.checked;
    if (transformModeActive) {
        customVectorInputsDiv.classList.remove('hidden');
        customVectorInputsDiv.classList.add('flex');
    } else {
        customVectorInputsDiv.classList.add('hidden');
        customVectorInputsDiv.classList.remove('flex');
        hoveredVector = null;
    }
    drawScene();
});

customVectorXInput.addEventListener('input', () => {
    customVectorInputCoords[0] = parseFloat(customVectorXInput.value) || 0;
    drawScene();
});
customVectorYInput.addEventListener('input', () => {
    customVectorInputCoords[1] = parseFloat(customVectorYInput.value) || 0;
    drawScene();
});

// Pan controls
canvas.addEventListener('mousedown', (e) => {
    isDragging = true;
    canvas.classList.remove('cursor-grab');
    canvas.classList.add('cursor-grabbing');
    lastMouseX = e.clientX;
    lastMouseY = e.clientY;
});

canvas.addEventListener('mousemove', (e) => {
    if (isDragging) {
        const deltaX = e.clientX - lastMouseX;
        const deltaY = e.clientY - lastMouseY;
        offsetX += deltaX;
        offsetY += deltaY;
        lastMouseX = e.clientX;
        lastMouseY = e.clientY;
    } else {
        const mouseCanvasX = e.clientX - canvas.getBoundingClientRect().left;
        const mouseCanvasY = e.clientY - canvas.getBoundingClientRect().top;
        let newHoveredVector = null;

        const currentCumulativeMatrix = computeCumulativeMatrix();

        let hoverViewTransformMatrix = [
            [1, 0],
            [0, 1]
        ];

        const transformedIHatGlobalForHover = multiplyMatrixVector(currentCumulativeMatrix, [1, 0]);

        if (perspectiveMode === 'transformed') {
            const angleOfTransformedIHat = Math.atan2(transformedIHatGlobalForHover[1], transformedIHatGlobalForHover[0]);
            const cosTheta = Math.cos(-angleOfTransformedIHat);
            const sinTheta = Math.sin(-angleOfTransformedIHat);
            hoverViewTransformMatrix = [
                [cosTheta, -sinTheta],
                [sinTheta, cosTheta]
            ];
        }

        const iHat = [1, 0];
        const jHat = [0, 1];

        const transformedIHatGlobal = multiplyMatrixVector(currentCumulativeMatrix, iHat);
        const transformedJHatGlobal = multiplyMatrixVector(currentCumulativeMatrix, jHat);

        const iHatHover = multiplyMatrixVector(hoverViewTransformMatrix, iHat);
        const jHatHover = multiplyMatrixVector(hoverViewTransformMatrix, jHat);
        const transformedIHatHover = multiplyMatrixVector(hoverViewTransformMatrix, transformedIHatGlobal);
        const transformedJHatHover = multiplyMatrixVector(hoverViewTransformMatrix, transformedJHatGlobal);

        const customVecInTransformedBasisForHover = [
            parseFloat(customVectorXInput.value) || 0,
            parseFloat(customVectorYInput.value) || 0
        ];
        const vectorInOriginalBasisForHover = multiplyMatrixVector(currentCumulativeMatrix, customVecInTransformedBasisForHover);
        const customVectorHover = multiplyMatrixVector(hoverViewTransformMatrix, vectorInOriginalBasisForHover);

        const hoverThresholdPixels = 20;

        if (showOriginalCheckbox.checked) {
            const endIHatCanvas = toCanvasCoords(iHatHover[0], iHatHover[1]);
            const endJHatCanvas = toCanvasCoords(jHatHover[0], jHatHover[1]);
            if (isNearCanvasPoint(mouseCanvasX, mouseCanvasY, endIHatCanvas, hoverThresholdPixels)) {
                newHoveredVector = 'X';
            } else if (isNearCanvasPoint(mouseCanvasX, mouseCanvasY, endJHatCanvas, hoverThresholdPixels)) {
                newHoveredVector = 'Y';
            }
        }
        if (showTransformedCheckbox.checked && newHoveredVector === null) {
            const endTransformedIHatCanvas = toCanvasCoords(transformedIHatHover[0], transformedIHatHover[1]);
            const endTransformedJHatCanvas = toCanvasCoords(transformedJHatHover[0], transformedJHatHover[1]);
            if (isNearCanvasPoint(mouseCanvasX, mouseCanvasY, endTransformedIHatCanvas, hoverThresholdPixels)) {
                newHoveredVector = 'X1';
            } else if (isNearCanvasPoint(mouseCanvasX, mouseCanvasY, endTransformedJHatCanvas, hoverThresholdPixels)) {
                newHoveredVector = 'X2';
            }
        }
        if (transformModeActive && newHoveredVector === null) {
            const endCustomVectorCanvas = toCanvasCoords(customVectorHover[0], customVectorHover[1]);
            if (isNearCanvasPoint(mouseCanvasX, mouseCanvasY, endCustomVectorCanvas, hoverThresholdPixels)) {
                newHoveredVector = 'custom';
            }
        }

        if (newHoveredVector !== hoveredVector) {
            hoveredVector = newHoveredVector;
        }
    }
    drawScene();
});

canvas.addEventListener('mouseup', () => {
    isDragging = false;
    canvas.classList.remove('cursor-grabbing');
    canvas.classList.add('cursor-grab');
});

canvas.addEventListener('mouseleave', () => {
    isDragging = false;
    canvas.classList.remove('cursor-grabbing');
    canvas.classList.add('cursor-grab');
    if (hoveredVector !== null) {
        hoveredVector = null;
        drawScene();
    }
});

// Zoom control
canvas.addEventListener('wheel', (e) => {
    e.preventDefault();

    const mouseX = e.clientX - canvas.getBoundingClientRect().left;
    const mouseY = e.clientY - canvas.getBoundingClientRect().top;

    const mouseCartesianX = (mouseX - centerX - offsetX) / scale;
    const mouseCartesianY = (centerY - mouseY + offsetY) / scale;

    const zoomFactor = 1.1;
    let newScale = scale;

    if (e.deltaY < 0) {
        newScale *= zoomFactor;
    } else {
        newScale /= zoomFactor;
    }

    newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, newScale));

    offsetX = mouseX - mouseCartesianX * newScale - centerX;
    offsetY = mouseY - (centerY - mouseCartesianY * newScale);

    scale = newScale;
    drawScene();
});

// Controls modal
let lastFocusedElement = null;

function openControlsModal() {
    if (mobileMediaQuery.matches) return;
    lastFocusedElement = document.activeElement instanceof HTMLElement && document.activeElement !== document.body
        ? document.activeElement
        : openControlsBtn;
    appShell.inert = true;
    appShell.setAttribute('aria-hidden', 'true');
    controlsModal.inert = false;
    controlsModal.setAttribute('aria-hidden', 'false');
    controlsModal.classList.remove('opacity-0', 'pointer-events-none');
    controlsModal.classList.add('opacity-100');
    controlsPanel.classList.remove('opacity-0', 'translate-y-4', 'scale-95');
    controlsPanel.classList.add('opacity-100', 'translate-y-0', 'scale-100');
    controlsBody.scrollTop = 0;
    closeControlsBtn.focus();
}

function closeControlsModal() {
    controlsModal.setAttribute('aria-hidden', 'true');
    controlsModal.inert = true;
    controlsModal.classList.remove('opacity-100');
    controlsModal.classList.add('opacity-0', 'pointer-events-none');
    controlsPanel.classList.remove('opacity-100', 'translate-y-0', 'scale-100');
    controlsPanel.classList.add('opacity-0', 'translate-y-4', 'scale-95');
    const restricted = mobileMediaQuery.matches;
    appShell.inert = restricted;
    appShell.setAttribute('aria-hidden', restricted ? 'true' : 'false');
    const focusTarget = lastFocusedElement instanceof HTMLElement ? lastFocusedElement : openControlsBtn;
    focusTarget.focus();
}

openControlsBtn.addEventListener('click', openControlsModal);
closeControlsBtn.addEventListener('click', closeControlsModal);
doneControlsBtn.addEventListener('click', closeControlsModal);
controlsBackdrop.addEventListener('click', closeControlsModal);

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !controlsModal.inert) {
        closeControlsModal();
    }
});

// Restrict the app on small screens
function syncMobileRestriction() {
    const restricted = mobileMediaQuery.matches;
    if (restricted) {
        closeControlsModal();
    }
    const isAppHidden = restricted || !controlsModal.inert;
    appShell.inert = isAppHidden;
    appShell.setAttribute('aria-hidden', isAppHidden ? 'true' : 'false');
    mobileNotice.setAttribute('aria-hidden', restricted ? 'false' : 'true');
}

if (typeof mobileMediaQuery.addEventListener === 'function') {
    mobileMediaQuery.addEventListener('change', syncMobileRestriction);
} else {
    mobileMediaQuery.addListener(syncMobileRestriction);
}
syncMobileRestriction();

// Drag and drop ordering for matrix cascade
matrixCascadePills.addEventListener('dragstart', (e) => {
    const targetPill = e.target.closest('.matrix-pill');
    if (targetPill) {
        draggedItem = targetPill;
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', draggedItem.dataset.id);
        setTimeout(() => {
            draggedItem.classList.add('dragging');
        }, 0);
    }
});

matrixCascadePills.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const targetPill = e.target.closest('.matrix-pill');
    if (targetPill && targetPill !== draggedItem) {
        matrixCascadePills.querySelectorAll('.matrix-pill').forEach(pill => {
            pill.classList.remove('drag-over');
        });
        targetPill.classList.add('drag-over');
    }
});

matrixCascadePills.addEventListener('dragenter', (e) => {
    e.preventDefault();
});

matrixCascadePills.addEventListener('dragleave', (e) => {
    const targetPill = e.target.closest('.matrix-pill');
    if (targetPill) {
        targetPill.classList.remove('drag-over');
    }
});

matrixCascadePills.addEventListener('drop', (e) => {
    e.preventDefault();
    matrixCascadePills.querySelectorAll('.matrix-pill').forEach(pill => {
        pill.classList.remove('drag-over');
    });

    const draggedId = e.dataTransfer.getData('text/plain');
    const targetPill = e.target.closest('.matrix-pill');
    const targetId = targetPill ? targetPill.dataset.id : null;

    if (draggedId && targetId && draggedId !== targetId) {
        const draggedIndex = matrixCascade.findIndex(m => m.id === draggedId);
        const targetIndex = matrixCascade.findIndex(m => m.id === targetId);

        if (draggedIndex !== -1 && targetIndex !== -1) {
            const [removed] = matrixCascade.splice(draggedIndex, 1);
            matrixCascade.splice(targetIndex, 0, removed);
            renderMatrixCascade();
            fitViewToScene();
            drawScene();
        }
    }
});

matrixCascadePills.addEventListener('dragend', () => {
    if (draggedItem) {
        draggedItem.classList.remove('dragging');
        draggedItem = null;
    }
    matrixCascadePills.querySelectorAll('.matrix-pill').forEach(pill => {
        pill.classList.remove('drag-over');
    });
});

// Initial setup
window.addEventListener('load', () => {
    initializeCanvas();
    matrixCascade.push({ id: generateUniqueId(), values: [[1, 0], [0, 1]], isInverse: false, enabled: true });
    renderMatrixCascade();
    applyPerspectiveButtonStyle();
    fitViewToScene();
    drawScene();
});

window.addEventListener('resize', () => {
    initializeCanvas();
    drawScene();
});

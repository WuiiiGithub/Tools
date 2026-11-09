import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const appDir = resolve(scriptDir, '..');

global.window = global;

[
    'js/core/config.js',
    'js/core/math.js',
    'js/core/activation.js',
    'js/app/state.js',
    'js/app/matrices.js'
].forEach(file => {
    const fullPath = join(appDir, file);
    vm.runInThisContext(readFileSync(fullPath, 'utf8'), { filename: fullPath });
});

const { App, State, Activation, Math: MathCore } = global.Visuo;
const rl = readline.createInterface({ input, output });

const ACTIVATION_LIST = ['linear', 'sigmoid', 'tanh', 'relu'];
const ACTIVATION_FORMULAS = {
    linear: 'f(x) = x',
    sigmoid: 'f(x) = 1 / (1 + e^-x)',
    tanh: 'f(x) = tanh(x)',
    relu: 'f(x) = max(0, x)'
};
const INVERSE_FORMULAS = {
    linear: 'f^-1(x) = x',
    sigmoid: 'f^-1(x) = ln(x / (1 - x))',
    tanh: 'f^-1(x) = atanh(x)',
    relu: 'f^-1(x) = max(0, x) in the app'
};

let cascade = [
    {
        id: MathCore.generateUniqueId(),
        type: 'matrix',
        values: [[3, 4], [0.5, -2]],
        bias: [0, 0],
        isInverse: false,
        enabled: true
    },
    {
        id: MathCore.generateUniqueId(),
        type: 'activation',
        name: 'sigmoid',
        enabled: true
    }
];
let bluePoint = [3, 1.5];
let redPoint = null;

const clone = value => JSON.parse(JSON.stringify(value));

const fmt = value => {
    if (!Number.isFinite(value)) {
        return String(value);
    }
    const normalized = Math.abs(value) < 5e-11 ? 0 : value;
    return normalized
        .toFixed(10)
        .replace(/(\.\d*?[1-9])0+$/, '$1')
        .replace(/\.0+$/, '');
};

const pointText = point => `(${fmt(point[0])}, ${fmt(point[1])})`;
const matrixText = matrix => `[[${fmt(matrix[0][0])}, ${fmt(matrix[0][1])}], [${fmt(matrix[1][0])}, ${fmt(matrix[1][1])}]]`;

const syncState = () => {
    State.matrixCascade = cascade;
    State.activeActivationName = 'linear';
};

const parseNumbers = raw => {
    const matches = String(raw).match(/-?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/g);
    return matches ? matches.map(Number) : [];
};

const ask = async question => {
    const answer = await rl.question(question);
    return answer.trim();
};

const matrixNumber = index => cascade
    .slice(0, index + 1)
    .filter(layer => layer.type !== 'activation')
    .length;

const describeLayer = (layer, index) => {
    if (layer.type === 'activation') {
        return `activation ${layer.name}`;
    }
    return `W${matrixNumber(index)}${layer.isInverse ? ' (inverse)' : ''}`;
};

const effectiveMatrix = layer => {
    if (!layer.isInverse) {
        return layer.values;
    }
    return MathCore.calculateInverse(layer.values);
};

const forwardLayer = (layer, point) => {
    if (layer.type === 'activation') {
        return {
            kind: 'activation',
            result: Activation.applyPoint(point, layer.name)
        };
    }

    const matrix = effectiveMatrix(layer);
    if (!matrix) {
        return {
            kind: 'matrix',
            singular: true,
            result: point
        };
    }

    const linear = MathCore.multiplyMatrixVector(matrix, point);
    const bias = layer.bias || [0, 0];

    return {
        kind: 'matrix',
        matrix,
        linear,
        bias,
        result: [linear[0] + bias[0], linear[1] + bias[1]]
    };
};

const inverseLayer = (layer, point) => {
    if (layer.type === 'activation') {
        return {
            kind: 'activation',
            result: Activation.inversePoint(point, layer.name)
        };
    }

    const bias = layer.bias || [0, 0];
    const shifted = [point[0] - bias[0], point[1] - bias[1]];
    const matrix = layer.isInverse
        ? layer.values
        : MathCore.calculateInverse(layer.values);

    if (!matrix) {
        return {
            kind: 'matrix',
            singular: true,
            result: null
        };
    }

    return {
        kind: 'matrix',
        matrix,
        shifted,
        bias,
        result: MathCore.multiplyMatrixVector(matrix, shifted)
    };
};

const showCascade = () => {
    if (cascade.length === 0) {
        console.log('  (empty cascade)');
        return;
    }

    cascade.forEach((layer, index) => {
        if (layer.type === 'activation') {
            const enabled = layer.enabled === false ? ' disabled' : '';
            console.log(`  ${index + 1}. ${describeLayer(layer, index)}${enabled}  ${ACTIVATION_FORMULAS[layer.name] || ''}`);
            return;
        }

        const applied = effectiveMatrix(layer);
        const bias = layer.bias || [0, 0];
        console.log(`  ${index + 1}. ${describeLayer(layer, index)} = ${applied ? matrixText(applied) : 'singular'}, b = ${pointText(bias)}`);
        if (layer.isInverse) {
            console.log(`     original W = ${matrixText(layer.values)}`);
        }
    });
};

const showStatus = () => {
    console.log('\nVisuoMatrix cascade probe');
    console.log('Cascade:');
    showCascade();
    console.log(`Blue point: ${pointText(bluePoint)}`);
    if (redPoint) {
        console.log(`Red point : ${pointText(redPoint)}`);
    }
};

const printMenu = () => {
    console.log('\nMenu');
    console.log('  1. Set blue-space point');
    console.log('  2. Set red-space point');
    console.log('  3. Forward trace: blue -> red, step by step');
    console.log('  4. Inverse trace: red -> blue, step by step');
    console.log('  5. Edit cascade');
    console.log('  6. Show axis/frame samples');
    console.log('  7. Load sample: W=[[3,4],[.5,-2]] then sigmoid, blue=(3,1.5)');
    console.log('  0. Exit');
};

const traceForward = start => {
    syncState();
    let current = [start[0], start[1]];

    console.log('\nForward trace: blue -> red');
    console.log(`  p0 = ${pointText(current)}  (blue-space input)`);

    cascade.forEach((layer, index) => {
        if (layer.enabled === false) {
            console.log(`\n  Step ${index + 1}: ${describeLayer(layer, index)} [disabled, skipped]`);
            return;
        }

        console.log(`\n  Step ${index + 1}: ${describeLayer(layer, index)}`);
        const step = forwardLayer(layer, current);

        if (step.kind === 'activation') {
            console.log(`    formula: ${ACTIVATION_FORMULAS[layer.name] || layer.name}`);
            console.log(`    p_next = (${layer.name}(${fmt(current[0])}), ${layer.name}(${fmt(current[1])}))`);
            console.log(`           = ${pointText(step.result)}`);
        } else if (step.singular) {
            console.log('    matrix is singular; the app skips this layer');
            console.log(`    p_next = ${pointText(step.result)}`);
        } else {
            console.log(`    W = ${matrixText(step.matrix)}`);
            console.log(`    b = ${pointText(step.bias)}`);
            console.log(`    W p = ${pointText(step.linear)}`);
            console.log(`    p_next = W p + b = ${pointText(step.result)}`);
        }

        current = step.result;
        console.log(`    p${index + 1} = ${pointText(current)}`);
    });

    const appResult = App.transformPointThroughCascade(start);
    const matches = Math.abs(current[0] - appResult[0]) < 1e-12
        && Math.abs(current[1] - appResult[1]) < 1e-12;

    console.log(`\nFinal red-space point: ${pointText(current)}`);
    console.log(`App check             : ${pointText(appResult)}  ${matches ? 'MATCH' : 'MISMATCH'}`);
    console.log('\nPerspective summary');
    console.log(`  Blue space sees input  : ${pointText(start)}`);
    console.log(`  Red space sees result  : ${pointText(current)}`);
    console.log(`  Red-basis label of input: ${pointText(start)}  (same coordinates before the cascade)`);

    if (!matches) {
        console.log('  Warning: the script trace differs from the app transform.');
    }

    return current;
};

const traceInverse = start => {
    syncState();
    let current = [start[0], start[1]];
    const steps = [];

    console.log('\nInverse trace: red -> blue');
    console.log(`  r0 = ${pointText(current)}  (red-space input)`);

    for (let index = cascade.length - 1; index >= 0; index--) {
        const layer = cascade[index];
        if (layer.enabled === false) {
            console.log(`\n  Reverse step from layer ${index + 1}: ${describeLayer(layer, index)} [disabled, skipped]`);
            continue;
        }

        console.log(`\n  Reverse step from layer ${index + 1}: ${describeLayer(layer, index)}`);
        const step = inverseLayer(layer, current);

        if (step.kind === 'activation') {
            console.log(`    formula: ${INVERSE_FORMULAS[layer.name] || layer.name}`);
            console.log(`    p_prev = (${layer.name}^-1(${fmt(current[0])}), ${layer.name}^-1(${fmt(current[1])}))`);
            console.log(`           = ${pointText(step.result)}`);
        } else if (step.singular) {
            console.log('    matrix is singular; inverse is unavailable');
            console.log('\nInverse unavailable.');
            return null;
        } else {
            console.log(`    subtract b = ${pointText(step.bias)}`);
            console.log(`    r - b = ${pointText(step.shifted)}`);
            console.log(`    W^-1 = ${matrixText(step.matrix)}`);
            console.log(`    p_prev = W^-1 (r - b) = ${pointText(step.result)}`);
        }

        current = step.result;
        steps.push(current);
    }

    const appResult = App.invertPointThroughCascade(start);
    const matches = !!appResult
        && Math.abs(current[0] - appResult[0]) < 1e-12
        && Math.abs(current[1] - appResult[1]) < 1e-12;

    console.log(`\nFinal blue-space point: ${pointText(current)}`);
    console.log(`App check              : ${appResult ? pointText(appResult) : 'unavailable'}  ${matches ? 'MATCH' : 'MISMATCH'}`);
    console.log('\nPerspective summary');
    console.log(`  Red space input      : ${pointText(start)}`);
    console.log(`  Blue space preimage  : ${pointText(current)}`);

    if (!matches) {
        console.log('  Warning: the script inverse differs from the app inverse.');
    }

    return current;
};

const showAxisSamples = () => {
    syncState();
    const cumulative = App.computeCumulativeMatrix();

    console.log('\nLinear part and axis images');
    console.log(`  cumulative matrix M = ${matrixText(cumulative)}`);
    console.log(`  M e1 = ${pointText(MathCore.multiplyMatrixVector(cumulative, [1, 0]))}`);
    console.log(`  M e2 = ${pointText(MathCore.multiplyMatrixVector(cumulative, [0, 1]))}`);
    console.log(`  M (0,0) = ${pointText(MathCore.multiplyMatrixVector(cumulative, [0, 0]))}`);

    const samples = [-2, -1, 0, 1, 2, 3, 4];
    console.log('\n  Blue x-axis image: (t, 0) -> full cascade');
    samples.forEach(t => {
        console.log(`    t=${fmt(t)} -> ${pointText(App.transformPointThroughCascade([t, 0]))}`);
    });

    console.log('\n  Blue y-axis image: (0, t) -> full cascade');
    samples.forEach(t => {
        console.log(`    t=${fmt(t)} -> ${pointText(App.transformPointThroughCascade([0, t]))}`);
    });

    console.log('\n  Straight axes are guaranteed only when the matrix part does not mix x and y.');
    console.log('  A non-diagonal matrix rotates/shears the axis before the activation, so the');
    console.log('  image of that axis becomes curved in the standard red coordinates.');
};

const readPoint = async (label, current) => {
    const raw = await ask(`${label} [${pointText(current)}]: `);
    if (!raw) {
        return current;
    }
    const numbers = parseNumbers(raw);
    if (numbers.length < 2) {
        console.log('Enter two numbers, for example: 3 1.5 or 3, 1.5');
        return current;
    }
    return [numbers[0], numbers[1]];
};

const addMatrix = async inverse => {
    const raw = await ask('Enter m00 m01 m10 m11 [bx by]: ');
    const numbers = parseNumbers(raw);

    if (numbers.length !== 4 && numbers.length !== 6) {
        console.log('Enter 4 matrix numbers, optionally followed by 2 bias numbers.');
        return;
    }

    const bias = numbers.length === 6 ? [numbers[4], numbers[5]] : [0, 0];
    cascade.push({
        id: MathCore.generateUniqueId(),
        type: 'matrix',
        values: [[numbers[0], numbers[1]], [numbers[2], numbers[3]]],
        bias,
        isInverse: inverse,
        enabled: true
    });
    console.log(`Added ${inverse ? 'inverse matrix' : 'matrix'}.`);
};

const addActivation = async () => {
    const raw = await ask('Activation: 1 linear, 2 sigmoid, 3 tanh, 4 relu: ');
    const index = Math.round(Number(raw)) - 1;

    if (!Number.isInteger(index) || index < 0 || index >= ACTIVATION_LIST.length) {
        console.log('Choose 1, 2, 3, or 4.');
        return;
    }

    cascade.push({
        id: MathCore.generateUniqueId(),
        type: 'activation',
        name: ACTIVATION_LIST[index],
        enabled: true
    });
    console.log(`Added activation ${ACTIVATION_LIST[index]}.`);
};

const removeLayer = async () => {
    const raw = await ask('Layer number to remove: ');
    const index = Math.round(Number(raw)) - 1;

    if (!Number.isInteger(index) || index < 0 || index >= cascade.length) {
        console.log('Invalid layer number.');
        return;
    }

    const [removed] = cascade.splice(index, 1);
    console.log(`Removed ${removed.type === 'activation' ? removed.name : 'matrix'}.`);
};

const moveLayer = async direction => {
    const raw = await ask('Layer number to move: ');
    const index = Math.round(Number(raw)) - 1;

    if (!Number.isInteger(index) || index < 0 || index >= cascade.length) {
        console.log('Invalid layer number.');
        return;
    }

    const target = index + direction;
    if (target < 0 || target >= cascade.length) {
        console.log('Layer is already at the edge.');
        return;
    }

    const [layer] = cascade.splice(index, 1);
    cascade.splice(target, 0, layer);
    console.log('Layer moved.');
};

const editCascade = async () => {
    while (true) {
        console.log('\nCascade editor');
        showCascade();
        console.log('  1. Add matrix');
        console.log('  2. Add inverse matrix');
        console.log('  3. Add activation');
        console.log('  4. Remove layer');
        console.log('  5. Move layer up');
        console.log('  6. Move layer down');
        console.log('  7. Clear cascade');
        console.log('  0. Back');

        const choice = await ask('Choice: ');

        if (choice === '0') {
            return;
        }
        if (choice === '1') {
            await addMatrix(false);
        } else if (choice === '2') {
            await addMatrix(true);
        } else if (choice === '3') {
            await addActivation();
        } else if (choice === '4') {
            await removeLayer();
        } else if (choice === '5') {
            await moveLayer(-1);
        } else if (choice === '6') {
            await moveLayer(1);
        } else if (choice === '7') {
            cascade = [];
            redPoint = null;
            console.log('Cascade cleared.');
        } else {
            console.log('Invalid choice.');
        }
    }
};

const loadSample = () => {
    cascade = [
        {
            id: MathCore.generateUniqueId(),
            type: 'matrix',
            values: [[3, 4], [0.5, -2]],
            bias: [0, 0],
            isInverse: false,
            enabled: true
        },
        {
            id: MathCore.generateUniqueId(),
            type: 'activation',
            name: 'sigmoid',
            enabled: true
        }
    ];
    bluePoint = [3, 1.5];
    redPoint = null;
    console.log('Loaded sample.');
};

const main = async () => {
    console.log('VisuoMatrix cascade probe');
    console.log('This uses the app activation and matrix code, not a separate formula copy.');

    while (true) {
        showStatus();
        printMenu();

        let choice;
        try {
            choice = await ask('Choice: ');
        } catch (error) {
            break;
        }

        if (choice === '0') {
            break;
        }

        if (choice === '1') {
            bluePoint = await readPoint('Blue point (x y)', bluePoint);
        } else if (choice === '2') {
            redPoint = await readPoint('Red point (x y)', redPoint || [0, 0]);
        } else if (choice === '3') {
            const result = traceForward(bluePoint);
            redPoint = result;
        } else if (choice === '4') {
            const point = redPoint || bluePoint;
            const result = traceInverse(point);
            if (result) {
                bluePoint = result;
            }
        } else if (choice === '5') {
            await editCascade();
        } else if (choice === '6') {
            showAxisSamples();
        } else if (choice === '7') {
            loadSample();
        } else {
            console.log('Invalid choice.');
        }
    }

    rl.close();
};

main().catch(error => {
    console.error(error);
    rl.close();
    process.exitCode = 1;
});

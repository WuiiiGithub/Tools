(function (global) {
    'use strict';

    const Visuo = global.Visuo = global.Visuo || {};

    const sigmoid = value => {
        if (value >= 0) {
            const z = Math.exp(-value);
            return 1 / (1 + z);
        }
        const z = Math.exp(value);
        return z / (1 + z);
    };

    const DEFINITIONS = {
        linear: {
            forward: value => value,
            inverse: value => value,
            derivative: () => 1,
            limits: null
        },
        sigmoid: {
            forward: sigmoid,
            inverse: value => {
                const clamped = Math.min(1 - 1e-4, Math.max(1e-4, value));
                return Math.log(clamped / (1 - clamped));
            },
            derivative: value => {
                const s = sigmoid(value);
                return s * (1 - s);
            },
            limits: { min: 0, max: 1 }
        },
        tanh: {
            forward: Math.tanh,
            inverse: value => {
                const clamped = Math.min(1 - 1e-4, Math.max(-1 + 1e-4, value));
                return Math.atanh ? Math.atanh(clamped) : 0.5 * Math.log((1 + clamped) / (1 - clamped));
            },
            derivative: value => {
                const t = Math.tanh(value);
                return 1 - t * t;
            },
            limits: { min: -1, max: 1 }
        },
        relu: {
            forward: value => Math.max(0, value),
            inverse: value => Math.max(0, value),
            derivative: value => value > 0 ? 1 : (value === 0 ? 0.5 : 0),
            limits: { min: 0, max: Infinity }
        }
    };

    function getDefinition(name) {
        return DEFINITIONS[name] || DEFINITIONS.linear;
    }

    function applyValue(definition, value) {
        return definition.forward(value);
    }

    function inverseValue(definition, value) {
        return definition.inverse(value);
    }

    function isPositiveDomain(point) {
        return point[0] >= -1e-9 && point[1] >= -1e-9;
    }

    function clipToPositiveDomain(startPoint, endPoint) {
        const dx = endPoint[0] - startPoint[0];
        const dy = endPoint[1] - startPoint[1];
        let t0 = 0;
        let t1 = 1;

        const constrain = (value, delta) => {
            if (Math.abs(delta) < 1e-12) {
                return value >= -1e-9;
            }

            const crossing = -value / delta;
            if (delta > 0) {
                t0 = Math.max(t0, crossing);
            } else {
                t1 = Math.min(t1, crossing);
            }

            return t0 <= t1 + 1e-9;
        };

        if (!constrain(startPoint[0], dx) || !constrain(startPoint[1], dy) || t0 > t1 + 1e-9) {
            return null;
        }

        t0 = Math.max(0, Math.min(1, t0));
        t1 = Math.max(0, Math.min(1, t1));

        if (t0 > t1 + 1e-9) {
            return null;
        }

        return {
            start: [
                startPoint[0] + dx * t0,
                startPoint[1] + dy * t0
            ],
            end: [
                startPoint[0] + dx * t1,
                startPoint[1] + dy * t1
            ]
        };
    }

    Visuo.Activation = {
        names: Object.keys(DEFINITIONS),

        definitions: DEFINITIONS,

        coupling: {
            ux: 1,
            uy: 0,
            vx: 0,
            vy: 1,
            determinant: 1
        },

        getDefinition,

        applyValue(name, value) {
            return applyValue(getDefinition(name), value);
        },

        inverseValue(name, value) {
            return inverseValue(getDefinition(name), value);
        },

        getOutputLimits(name = 'linear') {
            return getDefinition(name).limits;
        },

        isPositiveDomain,

        clipToPositiveDomain,

        applyPoint(point, name = 'linear') {
            const definition = getDefinition(name);
            return [definition.forward(point[0]), definition.forward(point[1])];
        },

        inversePoint(point, name = 'linear') {
            const definition = getDefinition(name);
            return [definition.inverse(point[0]), definition.inverse(point[1])];
        },

        inverseCoupling(point) {
            return [point[0], point[1]];
        },

        jacobian(point, name = 'linear') {
            const definition = getDefinition(name);
            return [
                [definition.derivative(point[0]), 0],
                [0, definition.derivative(point[1])]
            ];
        },

        localBasis(point, name = 'linear') {
            const jacobian = this.jacobian(point, name);
            return {
                e1: [jacobian[0][0], jacobian[1][0]],
                e2: [jacobian[0][1], jacobian[1][1]]
            };
        }
    };
})(window);

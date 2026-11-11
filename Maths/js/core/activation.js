(function (global) {
    'use strict';

    const Visuo = global.Visuo = global.Visuo || {};

    const COUPLING = {
        ux: 1,
        uy: 0.6,
        vx: -0.5,
        vy: 1,
        determinant: 1.3
    };

    const sigmoid = value => 1 / (1 + Math.exp(-value));

    const DEFINITIONS = {
        linear: {
            forward: value => value,
            inverse: value => value,
            derivative: () => 1,
            scale: 1,
            offset: 0,
            coupled: false,
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
            scale: 6,
            offset: 0.5,
            coupled: true,
            limits: { min: -3, max: 3 }
        },
        tanh: {
            forward: Math.tanh,
            inverse: value => {
                const clamped = Math.min(1 - 1e-4, Math.max(-1 + 1e-4, value));
                return 0.5 * Math.log((1 + clamped) / (1 - clamped));
            },
            derivative: value => 1 - Math.tanh(value) ** 2,
            scale: 3,
            offset: 0,
            coupled: true,
            limits: { min: -3, max: 3 }
        },
        relu: {
            forward: value => Math.max(0, value),
            inverse: value => Math.max(0, value),
            derivative: value => value > 0 ? 1 : (value === 0 ? 0.5 : 0),
            scale: 1,
            offset: 0,
            coupled: true,
            limits: { min: 0, max: Infinity }
        }
    };

    function getDefinition(name) {
        return DEFINITIONS[name] || DEFINITIONS.linear;
    }

    function applyValue(definition, value) {
        return (definition.forward(value) - definition.offset) * definition.scale;
    }

    function inverseValue(definition, value) {
        return definition.inverse(value / definition.scale + definition.offset);
    }

    function couplingCoordinates(point) {
        return [
            COUPLING.ux * point[0] + COUPLING.uy * point[1],
            COUPLING.vx * point[0] + COUPLING.vy * point[1]
        ];
    }

    function isPositiveDomain(point) {
        const [u, v] = couplingCoordinates(point);
        return u >= -1e-9 && v >= -1e-9;
    }

    function inverseCoupling(point) {
        return [
            (point[0] - COUPLING.uy * point[1]) / COUPLING.determinant,
            (-COUPLING.vx * point[0] + point[1]) / COUPLING.determinant
        ];
    }

    function clipToPositiveDomain(startPoint, endPoint) {
        const [u0, v0] = couplingCoordinates(startPoint);
        const [u1, v1] = couplingCoordinates(endPoint);
        const du = u1 - u0;
        const dv = v1 - v0;
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

        if (!constrain(u0, du) || !constrain(v0, dv) || t0 > t1 + 1e-9) {
            return null;
        }

        t0 = Math.max(0, Math.min(1, t0));
        t1 = Math.max(0, Math.min(1, t1));

        if (t0 > t1 + 1e-9) {
            return null;
        }

        return {
            start: [
                startPoint[0] + (endPoint[0] - startPoint[0]) * t0,
                startPoint[1] + (endPoint[1] - startPoint[1]) * t0
            ],
            end: [
                startPoint[0] + (endPoint[0] - startPoint[0]) * t1,
                startPoint[1] + (endPoint[1] - startPoint[1]) * t1
            ]
        };
    }

    Visuo.Activation = {
        names: Object.keys(DEFINITIONS),

        coupling: COUPLING,

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

            if (!definition.coupled) {
                return [definition.forward(point[0]), definition.forward(point[1])];
            }

            const u = COUPLING.ux * point[0] + COUPLING.uy * point[1];
            const v = COUPLING.vx * point[0] + COUPLING.vy * point[1];

            return [applyValue(definition, u), applyValue(definition, v)];
        },

        inversePoint(point, name = 'linear') {
            const definition = getDefinition(name);

            if (!definition.coupled) {
                return [definition.inverse(point[0]), definition.inverse(point[1])];
            }

            const u = inverseValue(definition, point[0]);
            const v = inverseValue(definition, point[1]);
            return inverseCoupling([u, v]);
        },

        inverseCoupling,

        jacobian(point, name = 'linear') {
            const definition = getDefinition(name);

            if (!definition.coupled) {
                return [
                    [definition.derivative(point[0]), 0],
                    [0, definition.derivative(point[1])]
                ];
            }

            const u = COUPLING.ux * point[0] + COUPLING.uy * point[1];
            const v = COUPLING.vx * point[0] + COUPLING.vy * point[1];
            const du = definition.derivative(u) * definition.scale;
            const dv = definition.derivative(v) * definition.scale;

            return [
                [du * COUPLING.ux, du * COUPLING.uy],
                [dv * COUPLING.vx, dv * COUPLING.vy]
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

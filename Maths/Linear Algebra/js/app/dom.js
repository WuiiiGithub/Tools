(function (global) {
    'use strict';

    const Visuo = global.Visuo = global.Visuo || {};

    const canvas = document.getElementById('transformationCanvas');
    const messageBox = document.getElementById('messageBox');

    Visuo.DOM = {
        canvas,
        ctx: canvas.getContext('2d'),

        m00Input: document.getElementById('m00'),
        m01Input: document.getElementById('m01'),
        m10Input: document.getElementById('m10'),
        m11Input: document.getElementById('m11'),
        bxInput: document.getElementById('bx'),
        byInput: document.getElementById('by'),
        computeInverseBtn: document.getElementById('computeInverseBtn'),
        actionButton: document.getElementById('actionButton'),
        cancelEditButton: document.getElementById('cancelEditButton'),
        editorTitle: document.getElementById('editorTitle'),
        matrixCascadeSection: document.getElementById('matrixCascadeSection'),
        matrixCascadePills: document.getElementById('matrixCascadePills'),
        cascadeActivationSlot: document.getElementById('cascadeActivationSlot'),
        cascadeActivationLabel: document.getElementById('cascadeActivationLabel'),
        clearCascadeActivationBtn: document.getElementById('clearCascadeActivationBtn'),

        messageBox,
        messageBoxText: messageBox.querySelector('span'),
        messageBoxCloseBtn: messageBox.querySelector('.close-btn'),

        showOriginalCheckbox: document.getElementById('showOriginal'),
        showTransformedCheckbox: document.getElementById('showTransformed'),

        appShell: document.getElementById('appShell'),
        controlsDrawer: document.getElementById('controlsDrawer'),
        controlsPanel: document.getElementById('controlsPanel'),
        controlsBody: document.getElementById('controlsBody'),
        controlsBackdrop: document.getElementById('controlsBackdrop'),
        toggleControlsBtn: document.getElementById('toggleControlsBtn'),
        controlsMenuIcon: document.getElementById('controlsMenuIcon'),
        controlsCloseIcon: document.getElementById('controlsCloseIcon'),
        closeControlsBtn: document.getElementById('closeControlsBtn'),
        doneControlsBtn: document.getElementById('doneControlsBtn'),
        perspectiveToggleBtn: document.getElementById('perspectiveToggleBtn'),
        settingsToggleBtn: document.getElementById('settingsToggleBtn'),
        settingsPanel: document.getElementById('settingsPanel'),
        closeSettingsBtn: document.getElementById('closeSettingsBtn'),
        activationRadios: document.querySelectorAll('input[name="activationFunction"]'),
        activationDraggables: document.querySelectorAll('.activation-draggable'),

        mobileNotice: document.getElementById('mobileNotice'),
        mobileMediaQuery: window.matchMedia('(max-width: 767px)'),

        transformModeToggle: document.getElementById('transformModeToggle'),
        customVectorInputsDiv: document.getElementById('customVectorInputs'),
        customVectorXInput: document.getElementById('customVectorX'),
        customVectorYInput: document.getElementById('customVectorY'),
        vectorInfoBox: document.getElementById('vectorInfoBox')
    };
})(window);

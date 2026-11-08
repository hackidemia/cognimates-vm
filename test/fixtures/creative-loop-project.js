/**
 * A tiny sb3 project for the Cognimates creative-loop tests: one sprite
 * ("Creature") with a green-flag script and a "when this sprite clicked"
 * script, plus one variable. Costumes reference the scratch-storage built-in
 * default vector asset so tests run fully offline.
 * @param {string} vectorAssetId - storage.getDefaultAssetId(AssetType.ImageVector)
 * @return {object} sb3 project JSON
 */
module.exports = function makeCreativeLoopProject (vectorAssetId) {
    const costume = name => ({
        assetId: vectorAssetId,
        name: name,
        md5ext: `${vectorAssetId}.svg`,
        dataFormat: 'svg',
        bitmapResolution: 1,
        rotationCenterX: 0,
        rotationCenterY: 0
    });
    return {
        targets: [
            {
                isStage: true,
                name: 'Stage',
                variables: {},
                lists: {},
                broadcasts: {},
                blocks: {},
                comments: {},
                currentCostume: 0,
                costumes: [costume('backdrop1')],
                sounds: [],
                volume: 100,
                layerOrder: 0,
                tempo: 60,
                videoTransparency: 50,
                videoState: 'off',
                textToSpeechLanguage: null
            },
            {
                isStage: false,
                name: 'Creature',
                variables: {
                    surpriseVar: ['surprise', 0]
                },
                lists: {},
                broadcasts: {},
                blocks: {
                    flagHat: {
                        opcode: 'event_whenflagclicked',
                        next: 'moveBlock',
                        parent: null,
                        inputs: {},
                        fields: {},
                        shadow: false,
                        topLevel: true,
                        x: 0,
                        y: 0
                    },
                    moveBlock: {
                        opcode: 'motion_movesteps',
                        next: 'turnBlock',
                        parent: 'flagHat',
                        inputs: {STEPS: [1, [4, '10']]},
                        fields: {},
                        shadow: false,
                        topLevel: false
                    },
                    turnBlock: {
                        opcode: 'motion_turnright',
                        next: null,
                        parent: 'moveBlock',
                        inputs: {DEGREES: [1, [4, '15']]},
                        fields: {},
                        shadow: false,
                        topLevel: false
                    },
                    clickHat: {
                        opcode: 'event_whenthisspriteclicked',
                        next: 'sayBlock',
                        parent: null,
                        inputs: {},
                        fields: {},
                        shadow: false,
                        topLevel: true,
                        x: 0,
                        y: 240
                    },
                    sayBlock: {
                        opcode: 'looks_say',
                        next: null,
                        parent: 'clickHat',
                        inputs: {MESSAGE: [1, [10, 'Boo!']]},
                        fields: {},
                        shadow: false,
                        topLevel: false
                    }
                },
                comments: {},
                currentCostume: 0,
                costumes: [costume('creature1')],
                sounds: [],
                volume: 100,
                layerOrder: 1,
                visible: true,
                x: 0,
                y: 0,
                size: 100,
                direction: 90,
                draggable: false,
                rotationStyle: 'all around'
            }
        ],
        monitors: [],
        extensions: [],
        meta: {semver: '3.0.0', vm: '0.2.0', agent: ''}
    };
};

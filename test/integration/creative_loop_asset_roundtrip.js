/**
 * The creative loop imports a child's drawing (or a generated creature) as a
 * new sprite, an extra costume or a backdrop, then saves the project as sb3
 * and later continues it. This test drives the real VM APIs used by the
 * editor bridge and checks that the imported bitmap survives export + reload
 * byte-for-byte with its rotation centre and resolution.
 */
const test = require('tap').test;
const PNG = require('pngjs').PNG;
const ScratchStorage = require('scratch-storage');
const VirtualMachine = require('../../src/index');
const makeCreativeLoopProject = require('../fixtures/creative-loop-project');

const makePng = (width, height) => {
    const png = new PNG({width, height});
    for (let i = 0; i < png.data.length; i += 4) {
        png.data[i] = 200;
        png.data[i + 1] = (i / 4) % 255;
        png.data[i + 2] = 40;
        png.data[i + 3] = 255;
    }
    return new Uint8Array(PNG.sync.write(png));
};

const makeCostume = (storage, name, bytes, width, height) => {
    const asset = storage.createAsset(storage.AssetType.ImageBitmap, storage.DataFormat.PNG, bytes, null, true);
    return {
        name,
        dataFormat: 'png',
        asset,
        assetId: asset.assetId,
        md5: `${asset.assetId}.png`,
        bitmapResolution: 2,
        rotationCenterX: width / 2,
        rotationCenterY: height / 2
    };
};

const freshVm = () => {
    const storage = new ScratchStorage();
    const vm = new VirtualMachine();
    vm.attachStorage(storage);
    return {vm, storage};
};

test('an in-flight sprite import cannot cross a project replacement', async t => {
    const {vm, storage} = freshVm();
    const project = makeCreativeLoopProject(storage.getDefaultAssetId(storage.AssetType.ImageVector));
    await vm.loadProject(project);
    const pending = vm.addSprite(JSON.stringify(project.targets[1]));
    vm.clear();
    await t.rejects(pending);
    t.equal(vm.runtime.targets.length, 0, 'late import did not repopulate the cleared project');
});

test('imported sprite, costume and backdrop survive sb3 export and reload', t => {
    const {vm, storage} = freshVm();
    const project = makeCreativeLoopProject(storage.getDefaultAssetId(storage.AssetType.ImageVector));
    const drawing = makePng(64, 48);
    const extra = makePng(30, 20);
    const backdrop = makePng(120, 90);
    let drawingAssetId;

    return vm.loadProject(project)
        .then(() => {
            // New sprite, same JSON shape the GUI file uploader produces.
            const costume = makeCostume(storage, 'my drawing', drawing, 64, 48);
            drawingAssetId = costume.assetId;
            return vm.addSprite(JSON.stringify({
                name: 'My Drawing',
                isStage: false,
                x: 0,
                y: 0,
                visible: true,
                size: 100,
                rotationStyle: 'all around',
                direction: 90,
                draggable: false,
                currentCostume: 0,
                blocks: {},
                variables: {},
                costumes: [costume],
                sounds: []
            }));
        })
        .then(() => {
            const creature = vm.runtime.getSpriteTargetByName('Creature');
            const costume = makeCostume(storage, 'surprise face', extra, 30, 20);
            return vm.addCostume(costume.md5, costume, creature.id);
        })
        .then(() => {
            const costume = makeCostume(storage, 'my world', backdrop, 120, 90);
            return vm.addBackdrop(costume.md5, costume);
        })
        .then(() => vm.saveProjectSb3('arraybuffer'))
        .then(sb3 => {
            t.ok(sb3 instanceof ArrayBuffer, 'export produced an ArrayBuffer');
            const bytes = new Uint8Array(sb3);
            t.same(Array.from(bytes.slice(0, 4)), [0x50, 0x4b, 0x03, 0x04], 'export is a zip');
            const reloaded = freshVm();
            return reloaded.vm.loadProject(sb3).then(() => reloaded);
        })
        .then(({vm: vm2}) => {
            const sprite = vm2.runtime.getSpriteTargetByName('My Drawing');
            t.ok(sprite, 'imported sprite is present after reload');
            const [costume] = sprite.getCostumes();
            t.equal(costume.dataFormat, 'png');
            t.equal(costume.assetId, drawingAssetId, 'asset id (md5) is stable');
            t.equal(costume.bitmapResolution, 2);
            t.equal(costume.rotationCenterX, 32);
            t.equal(costume.rotationCenterY, 24);
            t.same(Array.from(costume.asset.data), Array.from(drawing), 'pixels are byte-identical');

            const creature = vm2.runtime.getSpriteTargetByName('Creature');
            const names = creature.getCostumes().map(c => c.name);
            t.same(names, ['creature1', 'surprise face'], 'extra costume kept on the existing sprite');
            t.ok(creature.blocks.getBlock('flagHat'), 'child-authored blocks are preserved');
            t.equal(creature.blocks.getBlock('moveBlock').opcode, 'motion_movesteps');

            const stage = vm2.runtime.getTargetForStage();
            t.same(stage.getCostumes().map(c => c.name), ['backdrop1', 'my world']);
            t.end();
        });
});

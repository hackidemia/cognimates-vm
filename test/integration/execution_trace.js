const test = require('tap').test;
const ScratchStorage = require('scratch-storage');
const VirtualMachine = require('../../src/index');
const ExecutionTrace = require('../../src/engine/execution-trace');
const makeCreativeLoopProject = require('../fixtures/creative-loop-project');

const loadVm = () => {
    const storage = new ScratchStorage(); // no web sources: fully offline
    const vm = new VirtualMachine();
    vm.attachStorage(storage);
    const project = makeCreativeLoopProject(storage.getDefaultAssetId(storage.AssetType.ImageVector));
    return vm.loadProject(project).then(() => vm);
};

// Step frames deterministically instead of using runtime.start()'s interval.
// currentStepTime is what start() would set in 30fps compatibility mode.
const stepFrames = (vm, n) => {
    vm.runtime.currentStepTime = 1000 / 30;
    for (let i = 0; i < n; i++) vm.runtime._step();
};

test('nothing is recorded unless a trace is started', t => loadVm().then(vm => {
    t.equal(vm.getExecutionTraceSummary(), null);
    vm.greenFlag();
    stepFrames(vm, 3);
    t.equal(vm.getExecutionTraceSummary(), null, 'no trace exists without opt-in');
    t.equal(vm.stopExecutionTrace(), null);
    t.end();
}));

test('trace records the scripts and blocks that actually ran', t => loadVm().then(vm => {
    vm.startExecutionTrace({maxDurationMs: 10000});
    vm.greenFlag();
    stepFrames(vm, 3);
    const summary = vm.stopExecutionTrace();
    t.equal(summary.source, 'vm-execution-trace');
    t.equal(summary.active, false);
    t.equal(summary.stoppedReason, 'stopped');

    const starts = summary.events.filter(e => e.type === 'script_start');
    t.ok(starts.some(e => e.topBlockId === 'flagHat' && e.targetName === 'Creature' &&
        e.topOpcode === 'event_whenflagclicked'), 'green flag script start recorded');
    t.ok(summary.events.some(e => e.type === 'script_end' && e.topBlockId === 'flagHat'),
        'green flag script end recorded');

    const ran = summary.executedBlocks.map(b => b.blockId);
    t.ok(ran.includes('moveBlock'), 'move block executed');
    t.ok(ran.includes('turnBlock'), 'turn block executed');
    t.notOk(ran.includes('sayBlock'), 'click script did not run and is not reported');
    const creature = vm.runtime.getSpriteTargetByName('Creature');
    summary.executedBlocks.forEach(b => {
        t.equal(b.targetId, creature.id);
        t.ok(creature.blocks.getBlock(b.blockId), `${b.blockId} exists in the project`);
    });
    t.equal(creature.direction, 105, 'the VM really executed the turn');

    // After stopping, further runs are not recorded.
    vm.greenFlag();
    stepFrames(vm, 3);
    t.equal(vm.getExecutionTraceSummary(), null);
    t.end();
}));

test('trace is bounded by block and event limits', t => loadVm().then(vm => {
    vm.startExecutionTrace({maxBlocks: 1, maxEvents: 1});
    vm.greenFlag();
    stepFrames(vm, 3);
    const summary = vm.stopExecutionTrace();
    t.equal(summary.executedBlocks.length, 1);
    t.ok(summary.droppedBlocks > 0, 'extra blocks were dropped, not stored');
    t.equal(summary.events.length, 1);
    t.ok(summary.droppedEvents > 0);
    t.end();
}));

test('trace stops itself at the time limit', t => loadVm().then(vm => {
    let now = 1000;
    const trace = new ExecutionTrace({maxDurationMs: 500, now: () => now});
    vm.runtime._executionTrace = trace;
    vm.greenFlag();
    stepFrames(vm, 1);
    const before = trace.summary().executedBlocks.length;
    t.ok(before > 0);
    now += 600;
    vm.greenFlag();
    stepFrames(vm, 2);
    const summary = trace.summary();
    t.equal(summary.active, false);
    t.equal(summary.stoppedReason, 'time_limit');
    t.equal(summary.executedBlocks.length, before, 'nothing recorded after the limit');
    t.end();
}));

test('loading another project ends the trace', t => loadVm().then(vm => {
    vm.startExecutionTrace();
    const storage = vm.runtime.storage;
    const project = makeCreativeLoopProject(storage.getDefaultAssetId(storage.AssetType.ImageVector));
    return vm.loadProject(project).then(() => {
        t.equal(vm.getExecutionTraceSummary(), null);
        t.end();
    });
}));

test('trace limits are clamped to hard maximums', t => {
    const trace = new ExecutionTrace({maxEvents: 1e9, maxBlocks: -5, maxDurationMs: 'x'});
    t.equal(trace.maxEvents, 1000);
    t.equal(trace.maxBlocks, 1);
    t.equal(trace.maxDurationMs, ExecutionTrace.DEFAULT_MAX_DURATION_MS);
    t.end();
});

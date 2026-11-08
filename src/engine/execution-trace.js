/**
 * @fileoverview
 * Opt-in, bounded, local execution trace.
 *
 * When a child explicitly asks the helper to "watch my project run", the
 * editor starts a trace, the child runs their project as usual, and the trace
 * records which scripts started/finished and which blocks were actually
 * executed by the sequencer. Nothing is recorded unless a trace is started,
 * recording stops automatically at the configured limits, and the summary
 * only contains block ids, opcodes and target names that already exist in the
 * project (no variable values, no sensor/camera/microphone data).
 *
 * This is the only source the assistant may use to claim "when you ran it,
 * X happened". Anything else must be described as static inspection.
 */

const DEFAULT_MAX_EVENTS = 200;
const DEFAULT_MAX_BLOCKS = 300;
const DEFAULT_MAX_DURATION_MS = 15000;
const HARD_MAX_EVENTS = 1000;
const HARD_MAX_BLOCKS = 1000;
const HARD_MAX_DURATION_MS = 60000;

const clampInt = (value, fallback, min, max) => {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(min, Math.min(max, Math.floor(n)));
};

class ExecutionTrace {
    /**
     * @param {object} [options] trace limits
     * @param {number} [options.maxEvents] max script start/end events kept
     * @param {number} [options.maxBlocks] max distinct executed blocks kept
     * @param {number} [options.maxDurationMs] recording stops after this many ms
     * @param {function} [options.now] clock, injectable for tests
     */
    constructor (options = {}) {
        this.maxEvents = clampInt(options.maxEvents, DEFAULT_MAX_EVENTS, 1, HARD_MAX_EVENTS);
        this.maxBlocks = clampInt(options.maxBlocks, DEFAULT_MAX_BLOCKS, 1, HARD_MAX_BLOCKS);
        this.maxDurationMs = clampInt(options.maxDurationMs, DEFAULT_MAX_DURATION_MS, 100, HARD_MAX_DURATION_MS);
        this._now = typeof options.now === 'function' ? options.now : Date.now;
        this.startedAt = this._now();
        this.endedAt = null;
        this.active = true;
        this.stoppedReason = null;
        this.events = [];
        this.droppedEvents = 0;
        this.droppedBlocks = 0;
        this._blocks = new Map();
    }

    _checkTime () {
        if (this.active && this._now() - this.startedAt > this.maxDurationMs) {
            this.stop('time_limit');
        }
        return this.active;
    }

    _pushEvent (event) {
        if (this.events.length >= this.maxEvents) {
            this.droppedEvents++;
            return;
        }
        this.events.push(event);
    }

    static _describeThread (thread) {
        const target = thread.target;
        const container = thread.blockContainer || (target && target.blocks);
        const topBlock = container && thread.topBlock ? container.getBlock(thread.topBlock) : null;
        return {
            targetId: target ? target.id : null,
            targetName: target && typeof target.getName === 'function' ? target.getName() : null,
            topBlockId: thread.topBlock || null,
            topOpcode: topBlock ? topBlock.opcode : null,
            fromFlyout: !!(target && container && container !== target.blocks)
        };
    }

    /**
     * Called by the runtime when a thread is pushed.
     * @param {Thread} thread the new thread
     */
    threadStarted (thread) {
        if (!this._checkTime() || !thread || thread.updateMonitor) return;
        this._pushEvent(Object.assign({
            type: 'script_start',
            t: this._now() - this.startedAt
        }, ExecutionTrace._describeThread(thread)));
    }

    /**
     * Called by the sequencer after it executed a block.
     * @param {Thread} thread the thread that executed the block
     * @param {string} blockId the executed block id
     */
    blockExecuted (thread, blockId) {
        if (!this._checkTime() || !thread || thread.updateMonitor || !thread.target) return;
        const key = `${thread.target.id}\u0000${blockId}`;
        const existing = this._blocks.get(key);
        if (existing) {
            existing.count++;
            return;
        }
        if (this._blocks.size >= this.maxBlocks) {
            this.droppedBlocks++;
            return;
        }
        const container = thread.blockContainer || thread.target.blocks;
        const block = container.getBlock(blockId);
        this._blocks.set(key, {
            targetId: thread.target.id,
            blockId: blockId,
            opcode: block ? block.opcode : null,
            topBlockId: thread.topBlock || null,
            firstAt: this._now() - this.startedAt,
            count: 1
        });
    }

    /**
     * Called by the runtime with threads that finished during a step.
     * @param {Array.<Thread>} doneThreads finished threads
     */
    threadsFinished (doneThreads) {
        if (!this._checkTime() || !doneThreads) return;
        for (let i = 0; i < doneThreads.length; i++) {
            const thread = doneThreads[i];
            if (!thread || thread.updateMonitor) continue;
            this._pushEvent(Object.assign({
                type: 'script_end',
                t: this._now() - this.startedAt
            }, ExecutionTrace._describeThread(thread)));
        }
    }

    /**
     * Stop recording. Idempotent.
     * @param {string} [reason] why recording stopped
     */
    stop (reason) {
        if (!this.active) return;
        this.active = false;
        this.stoppedReason = reason || 'stopped';
        this.endedAt = this._now();
    }

    /**
     * @return {object} a plain, JSON-serialisable summary of what was recorded.
     */
    summary () {
        this._checkTime();
        const end = this.endedAt === null ? this._now() : this.endedAt;
        return {
            source: 'vm-execution-trace',
            active: this.active,
            stoppedReason: this.stoppedReason,
            durationMs: Math.max(0, end - this.startedAt),
            limits: {
                maxEvents: this.maxEvents,
                maxBlocks: this.maxBlocks,
                maxDurationMs: this.maxDurationMs
            },
            events: this.events.map(e => Object.assign({}, e)),
            executedBlocks: Array.from(this._blocks.values()).map(b => Object.assign({}, b)),
            droppedEvents: this.droppedEvents,
            droppedBlocks: this.droppedBlocks
        };
    }
}

ExecutionTrace.DEFAULT_MAX_EVENTS = DEFAULT_MAX_EVENTS;
ExecutionTrace.DEFAULT_MAX_BLOCKS = DEFAULT_MAX_BLOCKS;
ExecutionTrace.DEFAULT_MAX_DURATION_MS = DEFAULT_MAX_DURATION_MS;
ExecutionTrace.HARD_MAX_DURATION_MS = HARD_MAX_DURATION_MS;

module.exports = ExecutionTrace;

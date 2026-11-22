import { vi } from 'vitest';
import { audioEffectSoftReverb } from '@/audio/effect/audio_effect_soft_reverb.js';
import { audioSpatialBus } from '@/audio/spatial/audio_spatial_bus.js';

/** An audio node double that records its wiring and lifetime. */
export interface PlayerKeyboardFakeNode {
  kind: string;
  outputs: PlayerKeyboardFakeNode[];
  disconnected: boolean;
  startedAt: number | null;
  stoppedAt: number | null;
  ended: (() => void)[];
  /** Output index of each connection, in the order of outputs. */
  routes: number[];
  [field: string]: unknown;
}

/** A context double with every node it made. */
export interface PlayerKeyboardFakeAudio {
  context: AudioContext;
  nodes: PlayerKeyboardFakeNode[];
  wet: PlayerKeyboardFakeNode;
  placed: { x: number; y: number; z: number }[];
  /** Ends every stopped source, as the audio thread would. */
  endStopped: () => void;
}

/**
 * Builds an AudioParam double.
 *
 * @param value Initial value.
 * @returns Param.
 */
function param(value: number): Record<string, unknown> {
  const target = { value };
  const set = (): ReturnType<typeof vi.fn> => vi.fn((next: number) => (target.value = next));
  return Object.assign(target, {
    setValueAtTime: set(),
    linearRampToValueAtTime: set(),
    setTargetAtTime: set(),
    cancelScheduledValues: vi.fn(),
  });
}

/**
 * Builds the methods of a node double.
 *
 * @param made Node.
 * @returns Wiring and lifetime methods.
 */
function nodeMethods(made: PlayerKeyboardFakeNode): Record<string, unknown> {
  return {
    connect: (next: PlayerKeyboardFakeNode, output = 0) => (made.outputs.push(next), made.routes.push(output), next),
    disconnect: () => (made.disconnected = true),
    start: (at = 0) => (made.startedAt = at),
    stop: (at: number) => (made.stoppedAt = at),
    addEventListener: (_name: string, listener: () => void) => made.ended.push(listener),
    setPeriodicWave: (wave: unknown) => (made['wave'] = wave),
  };
}

/**
 * Builds a node double.
 *
 * @param kind Node kind.
 * @param nodes Registry.
 * @param context Owning context.
 * @returns Node.
 */
function node(kind: string, nodes: PlayerKeyboardFakeNode[], context: unknown): PlayerKeyboardFakeNode {
  const made: PlayerKeyboardFakeNode = {
    kind,
    outputs: [],
    disconnected: false,
    startedAt: null,
    stoppedAt: null,
    ended: [],
    routes: [],
  };
  const params = ['gain', 'frequency', 'detune', 'Q', 'playbackRate', 'positionX', 'positionY', 'positionZ'];
  const limiter = ['threshold', 'knee', 'ratio', 'attack', 'release'];
  [...params, ...limiter].forEach((name) => (made[name] = param(name === 'gain' ? 1 : 0)));
  made['context'] = context;
  Object.assign(made, nodeMethods(made));
  nodes.push(made);
  return made;
}

/**
 * Builds an AudioBuffer double holding its channels.
 *
 * @param channels Channel count.
 * @param length Frames.
 * @param sampleRate Sample rate.
 * @returns Buffer.
 */
function buffer(channels: number, length: number, sampleRate: number): AudioBuffer {
  const data = Array.from({ length: channels }, () => new Float32Array(length));
  return {
    numberOfChannels: channels,
    length,
    sampleRate,
    duration: length / sampleRate,
    getChannelData: (channel: number) => data[channel],
    copyToChannel: (source: Float32Array, channel: number) => data[channel]?.set(source),
  } as unknown as AudioBuffer;
}

/**
 * Builds an audio context double and routes the shared reverb send and the
 * spatial placement of lasting sources to recorders.
 *
 * @param clock Audio time in seconds.
 * @returns Fake audio.
 */
export function playerKeyboardFakeAudio(clock: () => number = () => 0): PlayerKeyboardFakeAudio {
  const nodes: PlayerKeyboardFakeNode[] = [];
  const context: Record<string, unknown> = {};
  Object.defineProperty(context, 'currentTime', { get: clock });
  context['createPeriodicWave'] = (real: Float32Array, imag: Float32Array) => ({ real, imag });
  context['sampleRate'] = 48000;
  context['createBuffer'] = buffer;
  context['destination'] = node('destination', nodes, context);
  ['Gain', 'Oscillator', 'BufferSource', 'Panner', 'DynamicsCompressor', 'ChannelSplitter'].forEach((kind) => {
    context[`create${kind}`] = () => node(kind.toLowerCase(), nodes, context);
  });
  const wet = node('wet', nodes, context);
  const placed: PlayerKeyboardFakeAudio['placed'] = [];
  vi.spyOn(audioEffectSoftReverb, 'getWetSendInput').mockReturnValue(wet as unknown as AudioNode);
  vi.spyOn(audioSpatialBus, 'placeSourcePanner').mockImplementation((_context, _panner, pose) => {
    placed.push({ ...pose.sourcePosition });
  });
  const endStopped = (): void =>
    nodes.filter((made) => made.stoppedAt !== null).forEach((made) => made.ended.splice(0).forEach((end) => end()));
  return { context: context as unknown as AudioContext, nodes, wet, placed, endStopped };
}

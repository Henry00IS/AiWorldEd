import type { AudioContextHost } from '@/audio/context/audio_context_host.js';
import { vi, type Mock } from 'vitest';

/** Mutable AudioContext stand-in for playback scheduling tests. */
export interface PlaybackTestContext {
  state: AudioContextState;
  currentTime: number;
  sampleRate: number;
  destination: Record<string, never>;
  listener: PlaybackTestListener;
  stateListeners: Array<() => void>;
  bufferSource: PlaybackTestSource;
  oscillator: PlaybackTestSource;
  resume: Mock<() => Promise<void>>;
  createBuffer: Mock<() => AudioBuffer>;
  createBufferSource: Mock<() => PlaybackTestSource>;
  createOscillator: Mock<() => PlaybackTestSource>;
  createBiquadFilter: Mock<() => PlaybackTestFilter>;
  createGain: Mock<() => PlaybackTestGain>;
  createDelay: Mock<() => PlaybackTestDelay>;
  createConvolver: Mock<() => PlaybackTestConvolver>;
  createPanner: Mock<() => PlaybackTestPanner>;
  decodeAudioData: Mock<() => Promise<AudioBuffer>>;
  addEventListener: Mock<(eventName: string, listener: () => void) => void>;
  audioWorklet: { addModule: Mock<() => Promise<void>> };
}

/** Clock and node fields of a playback test context. */
type PlaybackTestClockFields = Pick<
  PlaybackTestContext,
  'state' | 'currentTime' | 'sampleRate' | 'destination' | 'listener' | 'stateListeners' | 'bufferSource' | 'oscillator'
>;

/** Factory fields of a playback test context. */
type PlaybackTestFactoryFields = Omit<PlaybackTestContext, keyof PlaybackTestClockFields>;

/**
 * Builds a running or suspended context double with graph factories.
 *
 * @param state Initial context state.
 * @returns Mutable context double.
 */
export function createPlaybackTestContext(state: 'running' | 'suspended' = 'running'): PlaybackTestContext {
  const graph = createPlaybackTestGraph();
  const context = createPlaybackTestShell(state, graph);
  bindPlaybackTestFactories(context, graph);
  return context;
}

/**
 * Samples the host gate twice with a changed currentTime so one-shots may
 * start.
 *
 * @param host Host whose output-clock gate is sampled.
 * @param context Context whose currentTime advances between the two samples.
 */
export function latchPlaybackTestClock(host: AudioContextHost, context: PlaybackTestContext): void {
  const audioContext = asPlaybackAudioContext(context);
  host.canScheduleOneShot(audioContext);
  context.currentTime += 0.05;
  host.canScheduleOneShot(audioContext);
}

/**
 * Presents the test double as an AudioContext.
 *
 * @param context Playback test double.
 * @returns The same object typed as AudioContext.
 */
export function asPlaybackAudioContext(context: PlaybackTestContext): AudioContext {
  return context as unknown as AudioContext;
}

/** Installs a minimal AudioWorkletNode so reverb graph setup can construct one. */
export function stubPlaybackAudioWorklet(): void {
  vi.stubGlobal(
    'AudioWorkletNode',
    class {
      port = { postMessage: vi.fn() };
      connect = vi.fn();
    },
  );
}

/**
 * Builds buffer, source, and oscillator doubles used by the test context.
 *
 * @returns Graph nodes shared by factory methods.
 */
function createPlaybackTestGraph(): PlaybackTestGraph {
  return {
    buffer: createPlaybackTestBuffer(),
    bufferSource: createPlaybackTestSource(),
    oscillator: createPlaybackTestSource(),
    panner: createPlaybackTestPanner(),
  };
}

/**
 * Builds the shell fields of a playback test context.
 *
 * @param state Initial context state.
 * @param graph Shared graph nodes.
 * @returns Context shell without factory methods assigned yet.
 */
function createPlaybackTestShell(state: 'running' | 'suspended', graph: PlaybackTestGraph): PlaybackTestContext {
  return {
    ...createPlaybackTestClockFields(state, graph),
    ...createPlaybackTestFactoryPlaceholders(),
  };
}

/**
 * Builds clock and node fields for a playback test context.
 *
 * @param state Initial context state.
 * @param graph Shared graph nodes.
 * @returns Clock fields and the shared source nodes.
 */
function createPlaybackTestClockFields(
  state: 'running' | 'suspended',
  graph: PlaybackTestGraph,
): PlaybackTestClockFields {
  return {
    state,
    currentTime: 0,
    sampleRate: 48000,
    destination: {},
    listener: createPlaybackTestListener(),
    stateListeners: [],
    bufferSource: graph.bufferSource,
    oscillator: graph.oscillator,
  };
}

/**
 * Builds unused factory placeholders replaced by bindPlaybackTestFactories.
 *
 * @returns Factory fields required on the context shell.
 */
function createPlaybackTestFactoryPlaceholders(): PlaybackTestFactoryFields {
  return {
    resume: vi.fn(async () => undefined),
    createBuffer: vi.fn(),
    createBufferSource: vi.fn(),
    createOscillator: vi.fn(),
    createBiquadFilter: vi.fn(),
    createGain: vi.fn(),
    createDelay: vi.fn(),
    createConvolver: vi.fn(),
    createPanner: vi.fn(),
    decodeAudioData: vi.fn(),
    addEventListener: vi.fn(),
    audioWorklet: createPlaybackTestWorklet(),
  };
}

/**
 * Builds the audioWorklet double.
 *
 * @returns Worklet with an addModule spy.
 */
function createPlaybackTestWorklet(): PlaybackTestContext['audioWorklet'] {
  return { addModule: vi.fn(async () => undefined) };
}

/**
 * Attaches factory methods that return the shared graph nodes.
 *
 * @param context Context shell to fill.
 * @param graph Shared graph nodes.
 */
function bindPlaybackTestFactories(context: PlaybackTestContext, graph: PlaybackTestGraph): void {
  context.resume = vi.fn(async () => {
    context.state = 'running';
  });
  bindSourceFactories(context, graph);
  bindMixFactories(context, graph);
  context.decodeAudioData = vi.fn(async () => graph.buffer);
  context.addEventListener = vi.fn((_eventName: string, listener: () => void) => {
    context.stateListeners.push(listener);
  });
}

/**
 * Attaches buffer and oscillator factories.
 *
 * @param context Context shell to fill.
 * @param graph Shared graph nodes.
 */
function bindSourceFactories(context: PlaybackTestContext, graph: PlaybackTestGraph): void {
  context.createBuffer = vi.fn(() => graph.buffer);
  context.createBufferSource = vi.fn(() => graph.bufferSource);
  context.createOscillator = vi.fn(() => graph.oscillator);
  context.createBiquadFilter = vi.fn(() => createPlaybackTestFilter());
}

/**
 * Attaches gain, delay, convolver, and panner factories.
 *
 * @param context Context shell to fill.
 * @param graph Shared graph nodes.
 */
function bindMixFactories(context: PlaybackTestContext, graph: PlaybackTestGraph): void {
  context.createGain = vi.fn(() => createPlaybackTestGain());
  context.createDelay = vi.fn(() => ({ delayTime: createPlaybackTestParam(0), connect: vi.fn() }));
  context.createConvolver = vi.fn(() => ({ buffer: null, normalize: false, connect: vi.fn() }));
  context.createPanner = vi.fn(() => graph.panner);
}

/**
 * Builds a short AudioBuffer double.
 *
 * @returns Buffer accepted as AudioBuffer.
 */
function createPlaybackTestBuffer(): AudioBuffer {
  const samples = new Float32Array(8);
  return {
    getChannelData: vi.fn(() => samples),
    length: 8,
    sampleRate: 48000,
    numberOfChannels: 1,
    duration: 8 / 48000,
    copyFromChannel: vi.fn(),
    copyToChannel: vi.fn(),
  } as unknown as AudioBuffer;
}

/**
 * Builds a source node double.
 *
 * @returns Source with connect, start, and stop spies.
 */
function createPlaybackTestSource(): PlaybackTestSource {
  return {
    buffer: null,
    playbackRate: { value: 1 },
    type: 'sine',
    frequency: createPlaybackTestParam(0),
    connect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    onended: null,
  };
}

/**
 * Builds a biquad filter double.
 *
 * @returns Filter with frequency and Q params.
 */
function createPlaybackTestFilter(): PlaybackTestFilter {
  return {
    type: 'lowpass',
    frequency: createPlaybackTestParam(0),
    Q: createPlaybackTestParam(0),
    connect: vi.fn(),
  };
}

/**
 * Builds a gain node double.
 *
 * @returns Gain node with a param spy.
 */
function createPlaybackTestGain(): PlaybackTestGain {
  return { gain: createPlaybackTestParam(1), connect: vi.fn() };
}

/**
 * Builds a panner double with the fields the spatial bus writes.
 *
 * @returns Panner node double.
 */
function createPlaybackTestPanner(): PlaybackTestPanner {
  return {
    panningModel: 'equalpower',
    distanceModel: 'inverse',
    refDistance: 1,
    maxDistance: 10000,
    rolloffFactor: 1,
    coneInnerAngle: 360,
    coneOuterAngle: 360,
    coneOuterGain: 0,
    positionX: createPlaybackTestParam(0),
    positionY: createPlaybackTestParam(0),
    positionZ: createPlaybackTestParam(0),
    connect: vi.fn(),
  };
}

/**
 * Builds a listener double.
 *
 * @returns Listener params the spatial bus writes.
 */
function createPlaybackTestListener(): PlaybackTestListener {
  return {
    positionX: { value: 0 },
    positionY: { value: 0 },
    positionZ: { value: 0 },
    forwardX: { value: 0 },
    forwardY: { value: 0 },
    forwardZ: { value: -1 },
    upX: { value: 0 },
    upY: { value: 1 },
    upZ: { value: 0 },
  };
}

/**
 * Builds an AudioParam double.
 *
 * @param value Initial param value.
 * @returns Param with automation spies.
 */
function createPlaybackTestParam(value: number): PlaybackTestParam {
  return {
    value,
    setTargetAtTime: vi.fn(),
    setValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
    cancelScheduledValues: vi.fn(),
  };
}

/** Nodes shared by a playback test context. */
interface PlaybackTestGraph {
  buffer: AudioBuffer;
  bufferSource: PlaybackTestSource;
  oscillator: PlaybackTestSource;
  panner: PlaybackTestPanner;
}

/** Source node fields read by playback tests. */
interface PlaybackTestSource {
  buffer: AudioBuffer | null;
  playbackRate: { value: number };
  type: string;
  frequency: PlaybackTestParam;
  connect: Mock;
  start: Mock;
  stop: Mock;
  onended: (() => void) | null;
}

/** Filter fields used while building a one-shot graph. */
interface PlaybackTestFilter {
  type: string;
  frequency: PlaybackTestParam;
  Q: PlaybackTestParam;
  connect: Mock;
}

/** Gain node fields used while building a one-shot graph. */
interface PlaybackTestGain {
  gain: PlaybackTestParam;
  connect: Mock;
}

/** Delay node fields used by the reverb graph. */
interface PlaybackTestDelay {
  delayTime: PlaybackTestParam;
  connect: Mock;
}

/** Convolver fields used by the reverb graph. */
interface PlaybackTestConvolver {
  buffer: AudioBuffer | null;
  normalize: boolean;
  connect: Mock;
}

/** Panner fields written by the spatial bus. */
interface PlaybackTestPanner {
  panningModel: string;
  distanceModel: string;
  refDistance: number;
  maxDistance: number;
  rolloffFactor: number;
  coneInnerAngle: number;
  coneOuterAngle: number;
  coneOuterGain: number;
  positionX: PlaybackTestParam;
  positionY: PlaybackTestParam;
  positionZ: PlaybackTestParam;
  connect: Mock;
}

/** Listener fields written by the spatial bus. */
interface PlaybackTestListener {
  positionX: { value: number };
  positionY: { value: number };
  positionZ: { value: number };
  forwardX: { value: number };
  forwardY: { value: number };
  forwardZ: { value: number };
  upX: { value: number };
  upY: { value: number };
  upZ: { value: number };
}

/** AudioParam spies used by scheduling tests. */
interface PlaybackTestParam {
  value: number;
  setTargetAtTime: Mock;
  setValueAtTime: Mock;
  exponentialRampToValueAtTime: Mock;
  cancelScheduledValues: Mock;
}

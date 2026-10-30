import { MEDIA } from '@/config/constants';
import { loadTransformers } from '@/lib/ml/transformers';
import { groupTranscript, type TimedText } from './structure';
import { IngestLimitError } from './validate';

// Video/audio → transcript, entirely on this device: the browser decodes the
// audio track (Web Audio, resampled to 16 kHz mono) and Whisper runs locally
// via transformers.js. No audio is uploaded anywhere.

export class MediaTooLongError extends IngestLimitError {
  constructor(readonly minutes: number) {
    super(`That recording is about ${minutes} minutes — the limit is ${MEDIA.maxMinutes}. Trim it and try again.`);
  }
}

async function decodeMono16k(file: File): Promise<Float32Array> {
  const ctx = new OfflineAudioContext({ numberOfChannels: 1, length: 1, sampleRate: MEDIA.sampleRate });
  let audio: AudioBuffer;
  try {
    audio = await ctx.decodeAudioData(await file.arrayBuffer());
  } catch {
    throw new IngestLimitError(`Couldn't read the sound in "${file.name}". Try an mp4, webm, mp3, m4a or wav file.`);
  }
  if (audio.duration > MEDIA.maxMinutes * 60) throw new MediaTooLongError(Math.round(audio.duration / 60));
  if (audio.numberOfChannels === 1) return audio.getChannelData(0);
  const mono = new Float32Array(audio.length);
  for (let c = 0; c < audio.numberOfChannels; c++) {
    const data = audio.getChannelData(c);
    for (let i = 0; i < data.length; i++) mono[i]! += data[i]! / audio.numberOfChannels;
  }
  return mono;
}

interface AsrOutput {
  readonly text: string;
  readonly chunks?: readonly { timestamp: [number, number | null]; text: string }[];
}
type Asr = (audio: Float32Array, opts: Record<string, unknown>) => Promise<AsrOutput>;

let asrFor: { model: string; pipe: Promise<Asr> } | null = null;

function loadAsr(model: string): Promise<Asr> {
  if (asrFor?.model !== model) {
    asrFor = { model, pipe: loadTransformers().then((t) => t.pipeline('automatic-speech-recognition', model) as unknown as Promise<Asr>) };
  }
  return asrFor.pipe;
}

// Returns time-labelled pages ready for indexing.
export async function transcribeMedia(
  file: File,
  language: string,
  onProgress: (done: number, total: number) => void,
): Promise<string[]> {
  const audio = await decodeMono16k(file);
  const english = language === 'en';
  const asr = await loadAsr(english ? MEDIA.englishModel : MEDIA.multilingualModel);
  const windowSec = MEDIA.chunkSec - 2 * MEDIA.strideSec;
  const total = Math.max(1, Math.ceil(audio.length / MEDIA.sampleRate / windowSec));
  let done = 0;
  onProgress(0, total);
  const opts: Record<string, unknown> = {
    chunk_length_s: MEDIA.chunkSec,
    stride_length_s: MEDIA.strideSec,
    return_timestamps: true,
    chunk_callback: () => onProgress(Math.min(++done, total), total),
    ...(english ? {} : { language, task: 'transcribe' }),
  };
  let out: AsrOutput;
  try {
    out = await asr(audio, opts);
  } catch (err) {
    if (english) throw err;
    // Unsupported language code → let Whisper auto-detect.
    const { language: _l, ...auto } = opts;
    out = await asr(audio, auto);
  }
  onProgress(total, total);
  const segments: TimedText[] = (out.chunks ?? []).map((c) => ({ start: c.timestamp[0], end: c.timestamp[1], text: c.text }));
  return segments.length > 0 ? groupTranscript(segments) : out.text.trim() ? [out.text.trim()] : [];
}

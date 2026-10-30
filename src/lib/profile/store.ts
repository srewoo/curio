import { readEncryptedJson, writeEncryptedJson } from '@/lib/storage/encrypted-json';

// Parent-written learner note ("likes football analogies; reads slowly").
// Encrypted locally, editable only behind the Settings PIN, injected into the
// tutor prompt as preferences — never as instructions.
const NOTE_KEY = 'curio.learnerNote';
export const LEARNER_NOTE_MAX = 400;

export const loadLearnerNote = (): Promise<string> => readEncryptedJson<string>(NOTE_KEY, '');

export async function saveLearnerNote(note: string): Promise<void> {
  await writeEncryptedJson(NOTE_KEY, note.trim().slice(0, LEARNER_NOTE_MAX));
}

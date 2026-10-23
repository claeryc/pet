// The faces, in the order of the rows of every face set (top to bottom).
// A new one goes at the end, since face sets find each one by its row. Kept
// in a file of its own, free of imports, so scripts/export-art.ts can use it.
export const EXPRESSIONS = [
  'content', 'happy', 'pouting', 'sad', 'crying', 'surprised', 'inLove', 'grumpy', 'sleepy', 'hungry', 'chewing', 'sick',
] as const;
export type Expression = (typeof EXPRESSIONS)[number];

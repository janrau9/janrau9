/**
 * Embeddings stored as int8: each row scaled so its largest component is ±127, with the
 * scale kept as one float32. A quarter of the float32 size; scores move by about 0.002.
 * Layout: all rows' int8 values, then all rows' scales.
 */
export function quantize(rows: ArrayLike<number>[], dims: number): Uint8Array {
  const out = new ArrayBuffer(rows.length * dims + rows.length * 4);
  const values = new Int8Array(out, 0, rows.length * dims);
  const scales = new DataView(out, rows.length * dims);
  rows.forEach((row, r) => {
    let max = 0;
    for (let i = 0; i < dims; i++) max = Math.max(max, Math.abs(row[i] ?? 0));
    const scale = max / 127 || 1;
    for (let i = 0; i < dims; i++) values[r * dims + i] = Math.round((row[i] ?? 0) / scale);
    scales.setFloat32(r * 4, scale, true);
  });
  return new Uint8Array(out);
}

export class Vectors {
  private readonly values: Int8Array;
  private readonly scales: DataView;

  constructor(
    buffer: ArrayBuffer,
    readonly rows: number,
    readonly dims: number,
  ) {
    this.values = new Int8Array(buffer, 0, rows * dims);
    this.scales = new DataView(buffer, rows * dims, rows * 4);
  }

  /** Cosine similarity of a normalized query with every row (rows were normalized before quantizing). */
  scores(query: ArrayLike<number>): Float32Array {
    const out = new Float32Array(this.rows);
    for (let r = 0; r < this.rows; r++) {
      let sum = 0;
      const base = r * this.dims;
      for (let i = 0; i < this.dims; i++) sum += (this.values[base + i] ?? 0) * (query[i] ?? 0);
      out[r] = sum * this.scales.getFloat32(r * 4, true);
    }
    return out;
  }
}

/** Split row scores into passage, term and question maps, in index order. A question scores its closest row. */
export function scoreMaps(
  scores: Float32Array,
  passageIds: string[],
  termIds: string[],
  questions: { id: string; rows: number }[] = [],
) {
  const passages = new Map<string, number>();
  const terms = new Map<string, number>();
  const asked = new Map<string, number>();
  for (const [i, id] of passageIds.entries()) passages.set(id, scores[i] ?? 0);
  for (const [i, id] of termIds.entries()) terms.set(id, scores[passageIds.length + i] ?? 0);
  let row = passageIds.length + termIds.length;
  for (const q of questions)
    for (let r = 0; r < q.rows; r++, row++) asked.set(q.id, Math.max(asked.get(q.id) ?? -1, scores[row] ?? 0));
  return { passages, terms, questions: asked };
}

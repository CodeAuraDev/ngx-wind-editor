export interface GraphemePart {
  index: number;
  segment: string;
}

export interface GraphemeSegmenter {
  segment(input: string): Iterable<GraphemePart>;
}

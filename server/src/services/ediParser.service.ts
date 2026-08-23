export interface EdiSegment {
  tag: string;
  elements: string[];
}

export function parseEdi(raw: string): EdiSegment[] {
  return raw
    .split("~")
    .map((segment) => segment.trim())
    .filter(Boolean)
    .map((segment) => {
      const [tag, ...elements] = segment.split("*");
      return { tag, elements };
    });
}

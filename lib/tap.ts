import { Tap } from "@atproto/tap";

let _tap: Tap | null = null;

export const getTap = (): Tap => {
  if (!_tap) {
    _tap = new Tap("http://localhost:2480");
  }
  return _tap;
};

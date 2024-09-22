declare module 'opentype.js' {
    export class Path {}
    export class Glyph {
      constructor(options: any);
    }
    export class Font {
      constructor(options: any);
      toArrayBuffer(): ArrayBuffer;
    }
  }
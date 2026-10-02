declare module 'linebreak' {
  export interface Break {
    position: number;
    required: boolean;
  }
  export default class LineBreaker {
    constructor(text: string);
    nextBreak(): Break | null;
  }
}

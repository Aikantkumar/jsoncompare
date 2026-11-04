import type { JSX as PreactJSX } from 'preact';

declare global {
  namespace JSX {
    interface IntrinsicElements extends PreactJSX.IntrinsicElements {}
    interface IntrinsicSVGElements extends PreactJSX.IntrinsicSVGElements {}
    interface IntrinsicMathMLElements extends PreactJSX.IntrinsicMathMLElements {}
    interface IntrinsicHTMLElements extends PreactJSX.IntrinsicHTMLElements {}
  }
}

export {};

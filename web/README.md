# @aaaa-zhen/liquid-glass

A configurable liquid-glass renderer for a caller-owned WebGL canvas.

The package source currently lives in the main
[Liquid Glass repository](https://github.com/aaaa-zhen/liquid-glass). It has
not yet been published to npm.

```js
import { LiquidGlass } from "./src/index.js";

const glass = new LiquidGlass(canvas);
glass.resize(width, height, window.devicePixelRatio);
glass.setBackground(image);
glass.setLens(width / 2, 100, width * 0.9, 160);
glass.render();
```

Run the interactive demo locally:

```sh
npm run build
npm run demo
```

Open <http://localhost:8747/demo/>. The generated `demo/index.html` is also
self-contained and can be opened directly from disk.

Requires WebGL 1 with `OES_standard_derivatives`.

## License

MIT

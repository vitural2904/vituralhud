# React Bits Micro

Install React Bits components into this folder through the workspace-local `jsrepo` CLI.

1. Run `npm run react-bits:list` to browse the registry.
2. Pick a component in the Micro category.
3. Add its TypeScript/CSS variant with `npm run react-bits:add -- <ComponentName>-TS-CSS`.

The project includes `motion` at the version range used by React Bits. Other component dependencies are added to this workspace only. Keep component CSS beside its TSX file. Respect reduced-motion preferences and keyboard input when adapting interactions.

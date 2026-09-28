import { StateManager } from '../server/state-manager';
let armed = false;
const manager = new StateManager(process.argv[2], async stage => {
  if (armed && stage === process.argv[3]) { process.send?.({ stage }); await new Promise(() => undefined); }
});
await manager.init(); armed = true;
await manager.dispatch({ type: 'SET_MATCH', field: 'matchName', value: 'Interrupted write' });

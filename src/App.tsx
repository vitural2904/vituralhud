import { lazy, Suspense, useEffect } from 'react';
import { useBroadcastState } from './use-broadcast-state';
const DraftWorkspace = lazy(() => import('./views/Workspaces').then(module => ({ default: module.DraftWorkspace })));
const PostMatchWorkspace = lazy(() => import('./views/Workspaces').then(module => ({ default: module.PostMatchWorkspace })));
const DraftOverlay = lazy(() => import('./views/Overlays').then(module => ({ default: module.DraftOverlay })));
const PostMatchOverlay = lazy(() => import('./views/Overlays').then(module => ({ default: module.PostMatchOverlay })));
export function App() {
  const data = useBroadcastState();
  const route = location.pathname.replace(/\/$/, '') || '/control';
  useEffect(() => { document.title = route.includes('post-match') ? 'VirtualHUD · Post-match' : 'VirtualHUD'; }, [route]);
  const active = data.fresh;
  let view;
  if (route === '/overlay') view = <div className="program-output"><DraftOverlay state={data.state} visible={active && data.state.activeOutput === 'draft'} immediate={!active} /><PostMatchOverlay state={data.state} visible={active && data.state.activeOutput === 'post-match'} immediate={!active} /></div>;
  else if (route === '/overlay/post-match') view = <PostMatchOverlay state={data.state} visible={active && data.state.activeOutput === 'post-match'} immediate={!active} />;
  else if (route === '/preview/post-match') view = <PostMatchOverlay state={data.state} visible />;
  else if (route === '/preview/draft') view = <DraftOverlay state={data.state} visible />;
  else if (route === '/control/post-match') view = <PostMatchWorkspace {...data} />;
  else if (['/control', '/control/draft'].includes(route)) view = <DraftWorkspace {...data} />;
  else view = <main><h1>Không tìm thấy trang.</h1><a href='/control'>Mở dashboard</a></main>;
  return <Suspense fallback={null}>{view}</Suspense>;
}

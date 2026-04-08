import { useHandTracking } from './hooks/useHandTracking';
import { useInteraction } from './hooks/useInteraction';
import { usePresentationControls } from './hooks/usePresentationControls';
import VideoCanvas from './components/VideoCanvas';
import FaceHudOverlay from './components/FaceHudOverlay';
import Scene3D from './components/Scene3D';
import UIOverlay from './components/UIOverlay';

function App() {
  const videoRef = useHandTracking();
  useInteraction();
  usePresentationControls();

  return (
    <div id="app-stage" className="relative h-screen w-full overflow-hidden bg-bg">
      <VideoCanvas videoRef={videoRef} />
      <FaceHudOverlay videoRef={videoRef} />
      <Scene3D videoRef={videoRef} />
      <UIOverlay />
    </div>
  );
}

export default App;

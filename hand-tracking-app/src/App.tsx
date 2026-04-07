import { useHandTracking } from './hooks/useHandTracking';
import { useInteraction } from './hooks/useInteraction';
import { usePresentationControls } from './hooks/usePresentationControls';
import VideoCanvas from './components/VideoCanvas';
import Scene3D from './components/Scene3D';
import UIOverlay from './components/UIOverlay';

function App() {
  const videoRef = useHandTracking();
  useInteraction();
  usePresentationControls();

  return (
    <div className="relative w-full h-screen bg-bg overflow-hidden">
      <VideoCanvas videoRef={videoRef} />
      <Scene3D videoRef={videoRef} />
      <UIOverlay />
    </div>
  );
}

export default App;

import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Landing from './views/Landing';
import HostView from './views/HostView';
import PlayerView from './views/PlayerView';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/host" element={<HostView />} />
        <Route path="/play" element={<PlayerView />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;

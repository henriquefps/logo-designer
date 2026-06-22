import React, { useState, useEffect, useRef } from 'react';
import Header from './components/Header';
import CanvasPreview from './components/CanvasPreview';
import ControlsPanel from './components/ControlsPanel';

export default function App() {
  const svgRef = useRef(null);
  
  // Load canvas settings from local storage or use defaults
  const [canvasSettings, setCanvasSettings] = useState(() => {
    const saved = localStorage.getItem('logogo_canvas_settings');
    return saved ? JSON.parse(saved) : {
      bgType: 'gradient',
      bgColor: '#ffffff',
      bgGradientStart: '#172e37',
      bgGradientEnd: '#505f76',
      bgGradientAngle: 135
    };
  });

  // Load elements from local storage or use defaults
  const [elements, setElements] = useState(() => {
    const saved = localStorage.getItem('logogo_elements');
    return saved ? JSON.parse(saved) : [
      {
        id: 'default-bg-icon',
        type: 'icon',
        name: 'Hexagon',
        x: 256,
        y: 256,
        size: 220,
        color: '#ffffff',
        strokeWidth: 1.5,
        rotation: 0,
        opacity: 25
      },
      {
        id: 'default-main-icon',
        type: 'icon',
        name: 'PenTool',
        x: 256,
        y: 256,
        size: 100,
        color: '#ffffff',
        strokeWidth: 2.2,
        rotation: -15,
        opacity: 100
      },
      {
        id: 'default-text',
        type: 'text',
        text: 'LogoGo',
        x: 256,
        y: 410,
        size: 42,
        color: '#ffffff',
        fontFamily: 'Geist',
        fontWeight: '800',
        rotation: 0,
        opacity: 100
      }
    ];
  });

  const [selectedElementId, setSelectedElementId] = useState(null);

  // Autosave settings
  useEffect(() => {
    localStorage.setItem('logogo_canvas_settings', JSON.stringify(canvasSettings));
  }, [canvasSettings]);

  // Autosave elements
  useEffect(() => {
    localStorage.setItem('logogo_elements', JSON.stringify(elements));
  }, [elements]);

  const updateElementPosition = (id, x, y) => {
    setElements((prev) =>
      prev.map((el) => (el.id === id ? { ...el, x, y } : el))
    );
  };

  return (
    <div className="relative min-h-screen overflow-x-hidden">
      {/* Background Animated Glows */}
      <div className="bg-glow bg-glow-1"></div>
      <div className="bg-glow bg-glow-2"></div>

      <div className="app-container">
        <Header />

        <main className="app-workspace mt-4">
          {/* Controls Editor Sidebar */}
          <ControlsPanel
            canvasSettings={canvasSettings}
            setCanvasSettings={setCanvasSettings}
            elements={elements}
            setElements={setElements}
            selectedElementId={selectedElementId}
            setSelectedElementId={setSelectedElementId}
            svgRef={svgRef}
          />

          {/* Canvas Live Preview Panel */}
          <div className="preview-panel">
            <div className="sticky-preview">
              <div className="w-full flex items-center justify-between border-b border-slate-200/60 pb-3">
                <h3 className="text-sm font-bold text-slate-800">Live Preview</h3>
              </div>

              <CanvasPreview
                canvasSettings={canvasSettings}
                elements={elements}
                selectedElementId={selectedElementId}
                setSelectedElementId={setSelectedElementId}
                updateElementPosition={updateElementPosition}
                svgRef={svgRef}
              />

              <p className="text-xs text-slate-500 max-w-[280px]">
                Drag elements on the canvas to position them. Use the side panel to edit colors, sizes, rotations, or layer order.
              </p>
            </div>
          </div>
        </main>

        <footer className="app-footer">
          <div className="footer-content">
            <p>
              Developed by <strong><a href="https://hfps.dev" target="_blank" rel="noopener noreferrer" className="hover:text-indigo-600 transition-colors">Henrique Silva (hfps.dev)</a></strong>
            </p>
            <p className="tech-stack-info">
              React • Tailwind CSS v4 • Lucide Icons • Client-Side JSZip
            </p>
          </div>
        </footer>
      </div>
    </div>
  );
}
